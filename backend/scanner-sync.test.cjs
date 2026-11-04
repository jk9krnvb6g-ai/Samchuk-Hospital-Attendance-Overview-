const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/server.cjs', 'utf8');
function section(from, to) { return source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from))); }
const helpers = section('function scannerDbMachineSummaries', 'async function syncHosofficeToAttendanceRawScan');
const normalRoute = section("samRouter.post(samRoute('/api/scanners/sync'),", '// 4.12.2');
const customRoute = section("samRouter.post(samRoute('/api/scanners/sync-custom'),", '// 4.12.3');
const payload = () => ({ success: true, totalRead: 100, totalNew: 99, duplicates: 90,
  machines: [1,2,3].map(machineNo => ({ machineNo, ip: '192.0.2.' + machineNo, success: true })),
  scans: [{ machineNo: 1, enrollNumber: '12', scanDateTime: '2026-11-03 08:00:00', verifyMode: 1073741824, inOutMode: 1, workCode: null }] });
function harness(options = {}) {
  const rows = new Map(), calls = [], routes = {}, exeCalls = [];
  let snapshot;
  const connection = {
    async beginTransaction() { calls.push('begin'); snapshot = new Map(rows); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); rows.clear(); for (const [k,v] of snapshot) rows.set(k,v); },
    release() { calls.push('release'); },
    async query(sql, values) {
      calls.push(sql);
      if (options.dbFail && values?.[2] === 13) throw new Error('DB write failed');
      if (sql.startsWith('INSERT')) {
        const key = `${values[2]}_${values[3]}`;
        if (rows.has(key)) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
        rows.set(key, { id: rows.size + 1, values, push: 'PENDING' }); return [{ affectedRows: 1 }];
      }
      if (sql.includes('COUNT(*) AS pending')) return [[{ pending: [...rows.values()].filter(r => r.values[16] === 0).length }]];
      if (sql.startsWith('SELECT')) return [[...rows.values()].filter(r => r.values[2] === values[0] && r.values[3] === values[1]).map(r => ({ id: r.id }))];
      if (sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
      throw new Error('Unexpected query ' + sql);
    }
  };
  const pool = { async getConnection() { calls.push('connection'); return connection; }, async query(sql) {
    calls.push(sql);
    if (sql.includes('FROM attendance_personnel')) return [options.people || [{ id: 99, fingle_id: 12, hr_fullname: 'Mapped' }]];
    if (sql.includes('scanner_sync_log')) return [{ affectedRows: 1 }];
    throw new Error('Unexpected pool SQL');
  }};
  const ctx = vm.createContext({ console: { log(){}, warn(){}, error(){} }, getDbPool: () => pool,
    toBangkokDateTimeStr: () => '2026-11-03 10:00:00', syncRunning: false,
    assertScannerStorage: async () => { if (options.schemaFail) throw new Error("Schema inspection failed"); },
    ensureTablesExist: async () => calls.push('DDL'), samRoute: x => x,
    samRouter: { post: (path, fn) => routes[path] = fn },
    executeScannerReaderCli: async args => { exeCalls.push(args); return options.cli ? options.cli(args) : payload(); },
    calculateDailyAttendanceForDate: async d => { calls.push('calculate:' + d); if (options.calcThrow) throw new Error('calc throw'); return options.calcWaiting ? { success: true, skipped: true, reason: 'WAITING_FOR_MAPPING' } : { success: !options.calcFail && !options.calcFailureDates?.includes(d) }; }
  });
  vm.runInContext(helpers + normalRoute + customRoute, ctx);
  async function request(path, body) {
    const res = { code: 200, status(n) { this.code = n; return this; }, json(value) { this.body = value; return this; } };
    await routes[path]({ body }, res); return res;
  }
  return { ctx, calls, rows, exeCalls, request };
}
test('insert preserves local time, SDK integers and fingle_id mapping; duplicate is DB-derived', async () => {
  const h = harness();
  const first = await h.ctx.persistScannerCliScans(payload());
  assert.equal(first.inserted, 1); assert.equal(h.rows.values().next().value.values[3], '2026-11-03 08:00:00');
  assert.equal(h.rows.values().next().value.values[4], 1073741824); assert.equal(h.rows.values().next().value.values[6], 99);
  const second = await h.ctx.persistScannerCliScans(payload());
  assert.equal(second.inserted, 0); assert.equal(second.skipped, 1); assert.equal(second.affectedDates.length, 0);
});
test('never maps enrollNumber by person_id', async () => {
  const h = harness({ people: [{ id: 12, fingle_id: 88 }] });
  const result = await h.ctx.persistScannerCliScans(payload());
  assert.equal(result.unmapped, 1); assert.equal(h.rows.values().next().value.values[6], null);
});
test('OVERWRITE duplicate preserves Push metadata, counts update independently of FOUND_ROWS', async () => {
  const h = harness(); await h.ctx.persistScannerCliScans(payload());
  h.rows.values().next().value.push = 'PUSHED';
  const result = await h.ctx.persistScannerCliScans(payload(), { strategy: 'OVERWRITE' });
  assert.equal(result.inserted, 0); assert.equal(result.updated, 1);
  const update = h.calls.find(c => c.startsWith('UPDATE'));
  assert.doesNotMatch(update, /push_status|pushed_at|source\s*=/); assert.equal(h.rows.values().next().value.push, 'PUSHED');
});
test('any DB write error rolls back entire batch', async () => {
  const h = harness({ dbFail: true }), cli = payload(); cli.scans.push({ ...cli.scans[0], enrollNumber: 13 });
  await assert.rejects(h.ctx.persistScannerCliScans(cli), /DB write failed/);
  assert.equal(h.rows.size, 0); assert.ok(h.calls.includes('rollback')); assert.ok(!h.calls.includes('commit'));
});
test('calendar validation, missing scans, failed machines, invalid modes fail before writes', async () => {
  for (const change of [c => c.scans = undefined, c => c.scans[0].scanDateTime = '2026-02-30 08:00:00', c => c.scans[0].verifyMode = 'bad', c => c.machines[0].success = false]) {
    const h = harness(), cli = payload(); change(cli);
    await assert.rejects(h.ctx.persistScannerCliScans(cli)); assert.ok(!h.calls.includes('connection'));
  }
});
test('date and machine filters apply before persistence', async () => {
  const h = harness(), cli = payload(); cli.scans.push({ ...cli.scans[0], machineNo: 2, enrollNumber: 13 });
  const result = await h.ctx.persistScannerCliScans(cli, { dates: ['2026-11-03'], machineNos: [2,3] });
  assert.equal(result.total, 1); assert.equal(h.rows.values().next().value.values[0], 2);
});
for (const path of ['/api/scanners/sync', '/api/scanners/sync-custom']) {
  test(path + ' preview has no DDL, writes, logs or calculation', async () => {
    const h = harness(); const r = await h.request(path, { preview: true, mode: 'DATE', date: '2026-11-03' });
    assert.equal(r.code, 200); assert.equal(r.body.success, true);
    assert.ok(h.calls.every(c => c.includes('FROM attendance_personnel')));
  });
  test(path + ' calculation false/throw is failure after committed save', async () => {
    for (const failure of [{ calcFail: true }, { calcThrow: true }]) {
      const h = harness(failure); const r = await h.request(path, { mode: 'DATE', date: '2026-11-03' });
      assert.equal(r.code, 502); assert.equal(r.body.success, false); assert.equal(r.body.calculationStatus, 'FAILED'); assert.ok(h.calls.includes('commit'));
    }
  });
  test(path + ' EXE failure cannot save or calculate', async () => {
    const h = harness({ cli: () => ({ success: false }) }); const r = await h.request(path, { mode: 'TODAY' });
    assert.equal(r.code, 502); assert.equal(r.body.success, false); assert.ok(!h.calls.includes('connection'));
  });
}
test('custom selected machines invoked separately; dates outside request discarded; counts ignore CLI totals', async () => {
  const h = harness({ cli: args => { const c = payload(); c.scans[0].machineNo = args.machine; c.scans[0].enrollNumber = args.machine; return c; } });
  const r = await h.request('/api/scanners/sync-custom', { machineNos: [1,3], mode: 'DATE', date: '2026-11-03', recalculate: false });
  assert.deepEqual(h.exeCalls.map(x => x.machine), [1,3]); assert.equal(r.body.newCount, 2); assert.equal(r.body.duplicateCount, 0); assert.equal(r.body.calculationStatus, 'SKIPPED');
});
test('YEAR uses UTC calendar independent of host timezone', async () => {
  const h = harness(); const r = await h.request('/api/scanners/sync-custom', { preview: true, mode: 'YEAR', year: 2026 });
  assert.equal(r.body.targetDates[0], '2026-01-01'); assert.equal(r.body.targetDates.at(-1), '2026-12-31');
});
const reader = section('function executeScannerReaderCli', '// แปลงค่าเวลา');
function readerContext(stdout, error) {
  const end = source.indexOf('\nfunction ', source.indexOf('function executeScannerReaderCli') + 1);
  const code = source.slice(source.indexOf('function executeScannerReaderCli'), end);
  let execOptions;
  const ctx = vm.createContext({ console: { log(){}, warn(){}, error(){} }, process: { env: {} },
    fs: { existsSync: () => true }, path: require('node:path'), getScannerReaderExePath: () => 'fixture.exe',
    execFile: (p,a,o,cb) => { execOptions = o; cb(error, stdout, ''); }
  }); vm.runInContext(code, ctx);
  return { ctx, options: () => execOptions };
}
test('reader accepts pretty/compact JSON and diagnostic prefix without truncating scans', async () => {
  for (const spacing of [undefined, 2]) {
    const cli = payload(); cli.scans = Array.from({ length: 10000 }, () => cli.scans[0]);
    const h = readerContext('diagnostics\n' + JSON.stringify(cli, null, spacing));
    const r = await h.ctx.executeScannerReaderCli(); assert.equal(r.success, true); assert.equal(r.scans.length, 10000);
    assert.equal(h.options().maxBuffer, 25 * 1024 * 1024);
  }
});
test('reader rejects truncated JSON, missing success and process/maxBuffer error even with valid JSON', async () => {
  for (const [output,error] of [['{"success":true',null], ['{"totalRead":4}',null], [JSON.stringify(payload()), new Error('maxBuffer exceeded')]]) {
    const h = readerContext(output,error); const r = await h.ctx.executeScannerReaderCli(); assert.equal(r.success, false);
  }
});

for (const path of ['/api/scanners/sync', '/api/scanners/sync-custom']) {
  test(path + ' rejects missing scans and DB errors without calculation; releases mutex', async () => {
    for (const options of [{ cli: () => ({ success: true, machines: [] }) }, { dbFail: true, cli: () => { const c = payload(); c.scans[0].enrollNumber = 13; return c; } }]) {
      const h = harness(options); const r = await h.request(path, { mode: 'TODAY' });
      assert.equal(r.code, 502); assert.equal(r.body.success, false);
      assert.ok(!h.calls.some(c => c.startsWith('calculate:'))); assert.equal(h.ctx.syncRunning, false);
    }
  });
  test(path + ' rejects non-boolean preview before mutation', async () => {
    const h = harness(); const r = await h.request(path, { preview: 'true' });
    assert.equal(r.code, 400); assert.equal(h.calls.length, 0); assert.equal(h.exeCalls.length, 0);
  });
}
test('unique key spans machines; one fingerprint/time is inserted once', async () => {
  const h = harness(), c = payload(); c.scans.push({ ...c.scans[0], machineNo: 2 });
  const result = await h.ctx.persistScannerCliScans(c);
  assert.equal(result.inserted, 1); assert.equal(result.skipped, 1); assert.equal(result.machineCounts[2].duplicates, 1);
});
test('normal sync filters unrequested machines/dates and exposes DB counts', async () => {
  const h = harness({ cli: () => { const c = payload(); c.scans.push({ ...c.scans[0], scanDateTime: '2026-10-01 08:00:00' }); c.scans.push({ ...c.scans[0], machineNo: 2, enrollNumber: 13 }); return c; } });
  const r = await h.request('/api/scanners/sync', { machineNo: 1, days: 3 });
  assert.equal(r.body.totalNew, 1); assert.equal(r.body.duplicates, 0); assert.equal(r.body.machines[0].newCount, 1);
  assert.equal(h.rows.size, 1);
});
test('invalid calendar range and empty machine selection fail safely', async () => {
  const h = harness();
  assert.equal((await h.request('/api/scanners/sync-custom', { mode: 'DATE', date: '2026-02-30' })).code, 400);
  assert.equal((await h.request('/api/scanners/sync-custom', { mode: 'TODAY', machineNos: [] })).body.success, false);
  assert.equal(h.exeCalls.length, 0);
});

for (const firstPath of ['/api/scanners/sync', '/api/scanners/sync-custom']) {
  test(firstPath + ' holds shared mutex until reader completes; overlapping requests get 409', async () => {
    let release;
    const pending = new Promise(resolve => release = resolve);
    const h = harness({ cli: () => pending });
    const first = h.request(firstPath, { preview: true, mode: 'TODAY' });
    await Promise.resolve(); await Promise.resolve();
    for (const route of ['/api/scanners/sync', '/api/scanners/sync-custom']) {
      const overlap = await h.request(route, { mode: 'TODAY' });
      assert.equal(overlap.code, 409); assert.equal(overlap.body.success, false);
    }
    assert.equal(h.exeCalls.length, 1); release(payload()); await first;
    assert.equal(h.ctx.syncRunning, false);
  });
  test(firstPath + ' rejects machine-level failure despite aggregate success, without writes', async () => {
    const h = harness({ cli: () => { const c = payload(); c.machines[1].success = false; return c; } });
    const result = await h.request(firstPath, { mode: 'TODAY' });
    assert.equal(result.body.success, false); assert.equal(result.code, 502); assert.equal(h.rows.size, 0);
    assert.ok(!h.calls.includes('connection')); assert.ok(!h.calls.some(c => c.startsWith('calculate:')));
  });
  test(firstPath + ' partial calculation returns failure and accurate committed counts', async () => {
    const h = harness({ calcFailureDates: ['2026-11-03'], cli: () => { const c = payload(); c.scans.push({ ...c.scans[0], scanDateTime: '2026-11-02 08:00:00' }); return c; } });
    const result = await h.request(firstPath, { mode: 'RANGE', dateFrom: '2026-11-02', dateTo: '2026-11-03' });
    assert.equal(result.code, 502); assert.equal(result.body.success, false); assert.equal(result.body.calculationStatus, 'PARTIAL');
    assert.equal(result.body.rawScan?.inserted ?? result.body.totalInserted, 2); assert.equal(h.rows.size, 2);
    assert.equal(result.body.calculatedDates.length, 1); assert.equal(result.body.failedDates.length, 1);
    assert.ok(h.calls.indexOf('commit') < h.calls.indexOf('calculate:2026-11-02'));
  });
}
test('custom reads do not partially persist an earlier successful machine when a later machine fails', async () => {
  const h = harness({ cli: ({ machine }) => machine === 3 ? { success: false, machines: [{ machineNo: 3, success: false }] } : payload() });
  const result = await h.request('/api/scanners/sync-custom', { machineNos: [1,3], mode: 'TODAY' });
  assert.equal(result.body.success, false); assert.equal(h.exeCalls.length, 2); assert.equal(h.rows.size, 0);
  assert.ok(!h.calls.includes('connection'));
});
test('custom DATE/MONTH/YEAR/RANGE generate exact local calendar sets including leap day', async () => {
  const cases = [
    [{ mode: 'DATE', date: '2026-11-03' }, '2026-11-03', '2026-11-03', 1],
    [{ mode: 'MONTH', month: '2024-02' }, '2024-02-01', '2024-02-29', 29],
    [{ mode: 'YEAR', year: '2024' }, '2024-01-01', '2024-12-31', 366],
    [{ mode: 'RANGE', dateFrom: '2026-10-31', dateTo: '2026-11-02' }, '2026-10-31', '2026-11-02', 3]
  ];
  for (const [body, first, last, count] of cases) {
    const h = harness(), result = await h.request('/api/scanners/sync-custom', { ...body, preview: true });
    assert.equal(result.code, 200); assert.equal(result.body.targetDates[0], first); assert.equal(result.body.targetDates.at(-1), last); assert.equal(result.body.targetDates.length, count);
  }
});
test('malformed scanner windows cannot normalize into another date or default to today', async () => {
  for (const body of [{ mode: 'RANGE', dateFrom: '2026-02-30', dateTo: '2026-03-03' }, { mode: 'YEAR', year: '2026garbage' }, { mode: 'MONTH', month: '2026-13' }, { mode: 'DATE' }, { mode: 'unknown' }]) {
    const h = harness(), result = await h.request('/api/scanners/sync-custom', { ...body, preview: true });
    assert.equal(result.code, 400); assert.equal(h.exeCalls.length, 0); assert.equal(h.calls.length, 0);
  }
});

test('empty personnel stores raw scans and duplicate retries do not inflate waiting counters', async () => {
  const h = harness({ people: [] });
  const first = await h.ctx.persistScannerCliScans(payload()); assert.equal(first.inserted, 1); assert.equal(first.unmapped, 1); assert.equal(first.pendingMappingCount, 1);
  const second = await h.ctx.persistScannerCliScans(payload()); assert.equal(second.inserted, 0); assert.equal(second.skipped, 1); assert.equal(second.unmapped, 0); assert.equal(second.pendingMappingCount, 1);
});
for (const path of ['/api/scanners/sync', '/api/scanners/sync-custom']) {
  test(path + ' mapping wait explicitly preserves raw save success', async () => {
    const h = harness({ people: [], calcWaiting: true }); const result = await h.request(path, { mode: 'TODAY' });
    assert.equal(result.body.success, true); assert.equal(result.body.rawSaveSuccess, true); assert.equal(result.body.rawSaveStatus, 'COMMITTED'); assert.equal(result.body.calculationStatus, 'WAITING_FOR_MAPPING'); assert.equal(result.body.autoCalculated, false); assert.equal(result.body.pendingMappingCount, 1);
  });
  test(path + ' schema failure never executes reader or legacy schema bootstrap', async () => {
    const h = harness({ schemaFail: true }); const result = await h.request(path, { mode: 'TODAY' });
    assert.equal(result.body.success, false); assert.equal(h.exeCalls.length, 0); assert.ok(!h.calls.includes('DDL'));
  });
}
