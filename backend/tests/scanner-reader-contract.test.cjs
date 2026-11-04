const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFile } = require('node:child_process');
const source = fs.readFileSync(path.join(__dirname, '../server.cjs'), 'utf8');
const begin = source.indexOf('function executeScannerReaderCli');
const end = source.indexOf('\nfunction ', begin + 1);
function reader(script, testTimeout) {
  let seen;
  const ctx = vm.createContext({ console: { log(){}, warn(){}, error(){} }, fs: { existsSync: () => true }, path, process,
    getScannerReaderExePath: () => process.execPath,
    execFile: (_exe, args, options, callback) => { seen = { args, options }; return execFile(process.execPath, ['-e', script], testTimeout ? { ...options, timeout: testTimeout } : options, callback); }
  });
  vm.runInContext(source.slice(begin, end), ctx);
  return { run: args => ctx.executeScannerReaderCli(args), seen: () => seen };
}
test('real child process: 20,000 pretty JSON scans survive stdout parsing', async () => {
  const h = reader(`const scan={machineNo:1,enrollNumber:'12',scanDateTime:'2026-11-03 08:15:00',verifyMode:268435456,inOutMode:1,workCode:null}; console.log('diagnostic'); console.log(JSON.stringify({success:true,machines:[{machineNo:1,ip:'192.0.2.1',success:true}],scans:Array(20000).fill(scan)},null,2));`);
  const result = await h.run({ days: 400, machine: 3, preview: true });
  assert.equal(result.success, true); assert.equal(result.scans.length, 20000); assert.equal(result.scans[0].workCode, null);
  assert.equal(result.scans[0].verifyMode, 268435456); assert.equal(result.scans[0].scanDateTime, '2026-11-03 08:15:00');
  assert.ok(h.seen().args.includes('--days')); assert.ok(h.seen().args.includes('400')); assert.ok(h.seen().args.includes('--preview'));
  assert.ok(!h.seen().args.includes('--date-from')); assert.ok(!h.seen().args.includes('--date-to'));
});
test('real child process: stdout above 25 MiB fails explicitly without partial scans', async () => {
  const h = reader(`process.stdout.write(JSON.stringify({success:true,machines:[],scans:[],padding:'x'.repeat(26*1024*1024)}));`);
  const result = await h.run(); assert.equal(result.success, false); assert.match(result.error, /maxBuffer/i);
  assert.equal(result.scans, undefined); assert.equal(h.seen().options.maxBuffer, 25 * 1024 * 1024);
});
test('raw GET reports DB failure as HTTP 503 instead of successful empty refresh', async () => {
  let handler;
  const a = source.indexOf("samRouter.get(samRoute('/api/raw-scans'),");
  const b = source.indexOf("samRouter.post(samRoute('/api/raw-scans'),", a);
  const ctx = vm.createContext({ console: { warn(){} }, samRoute: x => x, samRouter: { get: (_path, fn) => handler = fn }, getDbPool: () => ({ query: async () => { throw new Error('fixture DB unavailable'); } }) });
  vm.runInContext(source.slice(a,b), ctx);
  const res = { code: 200, status(n) { this.code = n; return this; }, json(body) { this.body = body; } };
  await handler({ query: {} }, res); assert.equal(res.code, 503); assert.equal(res.body.success, false); assert.equal(res.body.data, undefined);
});
test('raw GET reads local timestamp text and preserves SDK values', async () => {
  let handler, sql;
  const a = source.indexOf("samRouter.get(samRoute('/api/raw-scans'),");
  const b = source.indexOf("samRouter.post(samRoute('/api/raw-scans'),", a);
  const ctx = vm.createContext({ console, samRoute: x => x, samRouter: { get: (_path, fn) => handler = fn }, getDbPool: () => ({ query: async query => { sql = query; return [[{ id: 1, scan_date_time: '2026-11-03 00:01:02', verify_mode: 1073741824, in_out_mode: 1, hr_mapped: 0 }]]; } }) });
  vm.runInContext(source.slice(a,b), ctx);
  const res = { json(body) { this.body = body; } }; await handler({ query: {} }, res);
  assert.match(sql, /DATE_FORMAT/); assert.equal(res.body.data[0].scanDateTime, '2026-11-03 00:01:02'); assert.equal(res.body.data[0].verifyMode, 1073741824);
});

test('real child nonzero exit rejects even a success JSON payload', async () => {
  const h = reader(`console.log(JSON.stringify({success:true,machines:[],scans:[]})); process.exitCode=7;`);
  const result = await h.run(); assert.equal(result.success, false); assert.equal(result.exitCode, 7); assert.equal(result.scans, undefined);
});
test('real child timeout fails closed; production timeout remains 180 seconds', async () => {
  const h = reader(`setInterval(()=>{},1000);`, 100);
  const result = await h.run(); assert.equal(result.success, false); assert.notEqual(result.exitCode, 0); assert.equal(result.scans, undefined); assert.equal(h.seen().options.timeout, 180000);
});
test('MySQL integration preflight refuses remote hosts and production-default port before connection', async () => {
  const { promisify } = require('node:util');
  for (const [host, port, expected] of [['example.invalid','3307', /Only numeric loopback/], ['127.0.0.1','3306', /dedicated non-production test port/]]) {
    await assert.rejects(promisify(execFile)(process.execPath, ['--test', path.join(__dirname, 'scanner-mysql.integration.test.cjs')], {
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT')), SCANNER_TEST_MYSQL_ENABLE: 'ISOLATED_LOCAL_TEST_ONLY', SCANNER_TEST_MYSQL_HOST: host, SCANNER_TEST_MYSQL_PORT: port, SCANNER_TEST_MYSQL_USER: 'sam_att_test_runner' },
      timeout: 5000, windowsHide: true
    }), error => { assert.match(error.stdout + error.stderr, expected); return true; });
  }
});

test('both HOSOffice Push endpoints are disabled by default before any DB access', async () => {
  for (const route of ['/api/hosoffice/test-push','/api/push/batch']) {
    const start = source.indexOf("samRouter.post(samRoute('" + route + "')");
    const end = source.indexOf('\n});',start)+5; let handler;
    const ctx = vm.createContext({process:{env:{}},samRoute:x=>x,requireRole:()=>()=>{},samRouter:{post:(_p,...handlers)=>handler=handlers.at(-1)},getHosofficePool:()=>{throw new Error('Push must not access HOSOffice');}});
    vm.runInContext(source.slice(start,end),ctx);
    const response={status(n){this.code=n;return this},json(b){this.body=b}};await handler({body:{}},response);assert.equal(response.code,403);assert.equal(response.body.error,'HOSOFFICE_PUSH_DISABLED');
  }
});
