import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceStore, scannerSyncMessage } from '../services/attendanceStore';
import { apiClient } from '../services/apiClient';
import { cacheService } from '../services/cacheService';
// No browser global: the store performs no startup requests. All API calls are mocked.
const store = attendanceStore as any;
const api = apiClient as any;
function noNetwork(t: any) {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network access'); });
}
test('API sends single-machine, custom date/machine array and preview payloads unchanged', async t => {
  noNetwork(t); const calls: any[] = [];
  t.mock.method(api, 'request', async (path: string, options: any) => { calls.push({ path, body: options.body && JSON.parse(options.body), method: options.method }); return { success: true }; });
  await api.syncFromScanners(3, { days: 7, preview: true });
  assert.deepEqual(calls[0], { path: '/api/scanners/sync', method: 'POST', body: { machineNo: 3, auto: false, days: 7, preview: true } });
  const payload = { machineNos: [1,3], mode: 'RANGE', dateFrom: '2026-11-01', dateTo: '2026-11-03', preview: true, recalculate: false };
  await api.syncScannersCustom(payload); assert.equal(calls[1].path, '/api/scanners/sync-custom'); assert.deepEqual(calls[1].body, payload);
  await api.getRawScansFromDb(500); assert.equal(calls[2].path, '/api/raw-scans?limit=500'); assert.equal(calls[2].method, 'GET');
});
test('custom preview does not refresh, calculate or save attendance', async t => {
  noNetwork(t); const refresh = t.mock.method(store, 'loadFromMySqlDb', async () => { throw new Error('Preview refresh forbidden'); });
  t.mock.method(api, 'syncScannersCustom', async () => ({ success: true, preview: true, totalFound: 746, newCount: 0, duplicateCount: 0 }));
  const result = await store.syncScannersCustom({ machineNos: [1,3], preview: true });
  assert.equal(result.success, true); assert.equal(result.details.totalFound, 746); assert.equal(refresh.mock.callCount(), 0);
});
test('single-machine failure propagates; preview never refreshes old sync logs', async t => {
  noNetwork(t); t.mock.method(api, 'syncFromScanners', async () => ({ success: false, message: 'EXE failed' }));
  await assert.rejects(store.triggerScannerSync(1), /EXE failed/);
  t.mock.method(api, 'syncFromScanners', async () => ({ success: true, preview: true, totalRead: 746, totalNew: 99 }));
  const log = t.mock.method(api, 'getScannerSyncLog', async () => { throw new Error('No preview logs'); });
  const refresh = t.mock.method(store, 'loadFromMySqlDb', async () => { throw new Error('No preview refresh'); });
  const result = await store.triggerScannerSync(1, { preview: true });
  assert.equal(result.totalNew, 0); assert.equal(log.mock.callCount(), 0); assert.equal(refresh.mock.callCount(), 0);
});
test('custom committed calculation failure refreshes raw rows and preserves error/count details', async t => {
  noNetwork(t); const refresh = t.mock.method(store, 'loadFromMySqlDb', async () => ({ success: true }));
  t.mock.method(api, 'syncScannersCustom', async () => ({ success: false, totalInserted: 2, totalUpdated: 1, totalSkipped: 3, message: 'calculation failed', failedDates: [{ date: '2026-11-03', error: 'DB unavailable' }] }));
  const result = await store.syncScannersCustom({ preview: false });
  assert.equal(result.success, false); assert.match(result.message, /2/); assert.match(result.message, /2026-11-03: DB unavailable/);
  assert.deepEqual(refresh.mock.calls[0].arguments, [{ calculateMissingAttendance: false }]);
});
test('scanner refresh reads fresh DB data without frontend calculation or attendance writes', async t => {
  noNetwork(t); const calls: string[] = [];
  for (const method of ['loadShifts', 'loadPersonnelTypes', 'loadPersonnel', 'loadDailyAttendance', 'loadPushBatches']) t.mock.method(store, method, async () => []);
  t.mock.method(api, 'getRawScansFromDb', async () => { calls.push('GET'); return { success: true, data: [{ id: 1, fingleId: 12, scanDateTime: '2026-11-03 00:01:02', verifyMode: 1073741824, inOutMode: 1, hrMapped: false }] }; });
  const calc = t.mock.method(store, 'calculateAttendance', () => { throw new Error('Frontend calculation forbidden'); });
  const save = t.mock.method(api, 'saveDailyAttendanceToDb', async () => { throw new Error('Frontend save forbidden'); });
  await store.loadFromMySqlDb({ calculateMissingAttendance: false });
  assert.equal(calls.length, 1); assert.equal(calc.mock.callCount(), 0); assert.equal(save.mock.callCount(), 0);
  assert.equal(store.getState().rawScans[0].scanDateTime, '2026-11-03 00:01:02'); assert.equal(store.getState().rawScans[0].verifyMode, 1073741824); assert.equal(store.getState().rawScans[0].hrMapped, false);
});
test('Raw Scan forced refresh bypasses cache; failure retains rows and exposes error; recovery clears it', async t => {
  noNetwork(t); cacheService.invalidateAll();
  let n = 0;
  t.mock.method(api, 'getRawScansFromDb', async () => { n++; return n === 2 ? { success: false, message: 'DB offline' } : { success: true, data: [{ id: n, fingleId: 12, scanDateTime: '2026-11-03 08:15:00' }] }; });
  await store.loadRawScans(500, true); await store.loadRawScans(500, true);
  assert.equal(store.getState().rawScans[0].id, 1); assert.equal(store.getState().rawScansError, 'DB offline');
  await store.loadRawScans(500, true); assert.equal(n, 3); assert.equal(store.getState().rawScans[0].id, 3); assert.equal(store.getState().rawScansError, undefined);
});
test('preview messages never invent DB insert/duplicate predictions', () => {
  assert.equal(scannerSyncMessage({ preview: true, message: '746 candidates', totalInserted: 0 }), '746 candidates');
});
test('HTTP 502 JSON retains committed counts and failedDates for scanner UI', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ success: false, totalInserted: 3, failedDates: [{ date: '2026-11-03', error: 'calc' }], message: 'Raw scans saved; attendance calculation failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } }));
  const result = await api.syncScannersCustom({ machineNos: [1,3] }); assert.equal(result.success, false); assert.equal(result.status, 502); assert.equal(result.totalInserted, 3); assert.equal(result.failedDates[0].error, 'calc');
});
