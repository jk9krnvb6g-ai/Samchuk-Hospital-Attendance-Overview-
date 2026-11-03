const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../server.cjs'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '../../schema_latest.sql'), 'utf8');
function section(from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `Missing source boundary: ${from}`);
  return source.slice(start, end);
}
function ddl(table) {
  const start = source.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf(';', start) + 1);
}
const helperCode = section('function scannerDbMachineSummaries', 'async function syncHosofficeToAttendanceRawScan');
const normalCode = section("samRouter.post(samRoute('/api/scanners/sync'),", '// 4.12.2');
const customCode = section("samRouter.post(samRoute('/api/scanners/sync-custom'),", '// 4.12.3');
const rawCode = section("samRouter.get(samRoute('/api/raw-scans'),", "samRouter.post(samRoute('/api/raw-scans'),");
function fixture(fid = 12, time = '2026-11-03 08:15:00') {
  return { success: true, totalRead: 1, machines: [{ machineNo: 1, ip: '192.0.2.1', success: true }],
    scans: [{ machineNo: 1, enrollNumber: String(fid), scanDateTime: time, verifyMode: 268435456, inOutMode: 1, workCode: null }] };
}
function handlers(pool, payload = fixture()) {
  const routes = {}, events = [];
  const context = vm.createContext({ console, getDbPool: () => pool, syncRunning: false,
    samRoute: x => x, samRouter: { post: (p, fn) => routes[p] = fn, get: (p, fn) => routes['GET ' + p] = fn },
    ensureTablesExist: async () => events.push('ensureTables'),
    toBangkokDateTimeStr: () => '2026-11-03 12:00:00', executeScannerReaderCli: async () => structuredClone(payload),
    calculateDailyAttendanceForDate: async date => {
      // A separate pooled connection observes only committed rows. Real SQL,
      // calculation orchestration only: the full attendance algorithm is not substituted into this suite.
      const [rows] = await pool.query('SELECT COUNT(*) AS count FROM attendance_raw_scan WHERE DATE(scan_date_time)=?', [date]);
      assert.ok(rows[0].count > 0, 'calculation must observe committed raw scans');
      events.push('calculate:' + date); return { success: true };
    }
  });
  vm.runInContext(helperCode + normalCode + customCode + rawCode, context);
  return { context, events, async request(route, body = {}) {
    const response = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    await routes[route]({ body, query: { limit: '200' } }, response); return response;
  }};
}
const enabled = process.env.SCANNER_TEST_MYSQL_ENABLE === 'ISOLATED_LOCAL_TEST_ONLY';
test('Scanner MySQL integration (10 cases; isolated disposable database only)', { skip: !enabled }, async t => {
  const host = process.env.SCANNER_TEST_MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.SCANNER_TEST_MYSQL_PORT || 3307);
  assert.ok(['127.0.0.1', '::1'].includes(host), 'Only numeric loopback test hosts are allowed');
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535 && port !== 3306, 'Use a dedicated non-production test port, not 3306');
  assert.equal(process.env.SCANNER_TEST_MYSQL_USER, 'sam_att_test_runner', 'Use the dedicated disposable-instance account');
  const mysql = require('mysql2/promise');
  const database = 'sam_att_scanner_test_' + crypto.randomBytes(8).toString('hex');
  assert.match(database, /^sam_att_scanner_test_[a-f0-9]{16}$/);
  // Deliberately never load appsettings, .env, production config or a supplied database URL/name.
  const config = { host, port, user: 'sam_att_test_runner', password: process.env.SCANNER_TEST_MYSQL_PASSWORD || '',
    charset: 'utf8mb4', dateStrings: true, timezone: '+07:00', connectTimeout: 3000 };
  const admin = await mysql.createConnection(config);
  let pool, created = false;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); created = true;
    pool = mysql.createPool({ ...config, database, connectionLimit: 3 });
    const personnelDdl = schema.match(/CREATE TABLE IF NOT EXISTS `attendance_personnel`[\s\S]*?;/)[0];
    await pool.query(personnelDdl);
    await pool.query(ddl('attendance_raw_scan'));
    await pool.query(ddl('scanner_sync_log'));
    console.log(`Test database: ${database} on numeric loopback port ${port} (disposable)`);
    const all = async () => (await pool.query('SELECT * FROM attendance_raw_scan ORDER BY id'))[0];
    const reset = async () => {
      await pool.query('DELETE FROM attendance_raw_scan');
      await pool.query('DELETE FROM scanner_sync_log');
      await pool.query('DELETE FROM attendance_personnel');
      await pool.query("INSERT INTO attendance_personnel (person_id,fingle_id,hr_fullname) VALUES (99,12,'บุคลากรทดสอบ'),(12,88,'ไม่ใช่เจ้าของนิ้ว 12')");
    };
    const cases = [
      ['new scan is inserted with PENDING', async () => {
        const h = handlers(pool), result = await h.context.persistScannerCliScans(fixture());
        assert.equal(result.inserted, 1); const rows = await all(); assert.equal(rows.length, 1); assert.equal(rows[0].push_status, 'PENDING');
      }],
      ['same unique fingerprint/time across machines is skipped', async () => {
        const h = handlers(pool); await h.context.persistScannerCliScans(fixture());
        const c = fixture(); c.scans[0].machineNo = 2; c.scans[0].deviceIp = '192.0.2.2';
        const result = await h.context.persistScannerCliScans(c);
        assert.equal(result.inserted, 0); assert.equal(result.skipped, 1); assert.equal((await all()).length, 1);
      }],
      ['OVERWRITE preserves all Push audit fields', async () => {
        const h = handlers(pool); await h.context.persistScannerCliScans(fixture());
        await pool.query("UPDATE attendance_raw_scan SET push_status='PUSHED', pushed_at='2026-11-03 10:00:00', pushed_by=7,push_batch_id=8,push_error='audit'");
        const before = (await all())[0], c = fixture(); c.scans[0].verifyMode = 1073741824;
        const result = await h.context.persistScannerCliScans(c, { strategy: 'OVERWRITE' }), after = (await all())[0];
        assert.equal(result.updated, 1); assert.equal(result.inserted, 0); assert.equal(after.verify_mode, 1073741824);
        for (const key of ['push_status','pushed_at','pushed_by','push_batch_id','push_error','source','machine_no','device_ip']) assert.equal(after[key], before[key]);
      }],
      ['real server error on second insert rolls back first insert', async () => {
        await pool.query("CREATE TRIGGER scanner_test_fail BEFORE INSERT ON attendance_raw_scan FOR EACH ROW BEGIN IF NEW.fingle_id=13 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture failure'; END IF; END");
        try { const h = handlers(pool), c = fixture(); c.scans.push(fixture(13).scans[0]);
          await assert.rejects(h.context.persistScannerCliScans(c), /fixture failure/); assert.equal((await all()).length, 0);
        } finally { await pool.query('DROP TRIGGER scanner_test_fail'); }
      }],
      ['both preview handlers leave raw/personnel/log tables unchanged', async () => {
        const h = handlers(pool); await h.context.persistScannerCliScans(fixture());
        const before = JSON.stringify(await all());
        for (const route of ['/api/scanners/sync','/api/scanners/sync-custom']) {
          const response = await h.request(route, { preview: true, mode: 'TODAY' }); assert.equal(response.body.success, true);
        }
        assert.equal(JSON.stringify(await all()), before);
        assert.equal((await pool.query('SELECT COUNT(*) AS n FROM scanner_sync_log'))[0][0].n, 0);
        assert.equal((await pool.query('SELECT COUNT(*) AS n FROM attendance_personnel'))[0][0].n, 2);
        assert.equal(h.events.length, 0);
      }],
      ['mapping uses fingle_id despite conflicting person_id', async () => {
        const h = handlers(pool); await h.context.persistScannerCliScans(fixture()); const row = (await all())[0];
        assert.equal(row.person_id, 99); assert.equal(row.hr_mapped, 1); assert.equal(row.hr_fullname, 'บุคลากรทดสอบ');
      }],
      ['unmapped fingerprint survives with null person and PENDING', async () => {
        const h = handlers(pool), result = await h.context.persistScannerCliScans(fixture(555)); const row = (await all())[0];
        assert.equal(result.unmapped, 1); assert.equal(row.fingle_id, 555); assert.equal(row.person_id, null); assert.equal(row.hr_mapped, 0); assert.equal(row.push_status, 'PENDING');
      }],
      ['local timestamps and SDK integers survive DB and raw GET; workCode null accepted', async () => {
        const h = handlers(pool); await h.context.persistScannerCliScans(fixture(12, '2026-11-03 00:01:02'));
        const row = (await all())[0]; assert.equal(row.scan_date_time, '2026-11-03 00:01:02'); assert.equal(row.verify_mode, 268435456); assert.equal(row.in_out_mode, 1);
        const response = await h.request('GET /api/raw-scans'); assert.equal(response.body.data[0].scanDateTime, '2026-11-03 00:01:02');
      }],
      ['mixed insert/skip and overwrite counts match persisted row cardinality and values', async () => {
        const h = handlers(pool); await h.context.persistScannerCliScans(fixture()); const c = fixture(); c.scans.push(fixture(555).scans[0]);
        const result = await h.context.persistScannerCliScans(c); assert.equal(result.inserted, 1); assert.equal(result.skipped, 1); assert.equal((await all()).length, 2);
        c.scans.forEach(s => s.verifyMode = 1073741824);
        const overwrite = await h.context.persistScannerCliScans(c, { strategy: 'OVERWRITE' }); assert.equal(overwrite.updated, 2); assert.equal(overwrite.inserted, 0);
        assert.ok((await all()).every(r => r.verify_mode === 1073741824));
      }],
      ['both handlers calculate only after committed success and never after rollback', async () => {
        for (const route of ['/api/scanners/sync','/api/scanners/sync-custom']) {
          await pool.query('DELETE FROM attendance_raw_scan');
          const h = handlers(pool); const response = await h.request(route, { mode: 'TODAY' });
          assert.equal(response.body.success, true); assert.ok(h.events.includes('calculate:2026-11-03'));
          await pool.query('DELETE FROM attendance_raw_scan');
          await pool.query("CREATE TRIGGER scanner_test_fail BEFORE INSERT ON attendance_raw_scan FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture failure'");
          try { const failed = handlers(pool); const result = await failed.request(route, { mode: 'TODAY' });
            assert.equal(result.body.success, false); assert.ok(!failed.events.some(e => e.startsWith('calculate:'))); assert.equal((await all()).length, 0);
          } finally { await pool.query('DROP TRIGGER scanner_test_fail'); }
        }
      }]
    ];
    for (const [name, run] of cases) await t.test(name, async () => { await reset(); await run(); });
  } finally {
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  }
});
