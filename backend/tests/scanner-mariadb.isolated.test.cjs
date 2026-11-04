const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {inspectScannerStorage,assertScannerStorage,migrateScannerStorage,definitions}=require('../scanner-storage.cjs');
const enabled=process.env.SAM_ATT_MARIADB_TEST_MODE==='ISOLATED_DISPOSABLE_ONLY';
const source=fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8');
function section(a,b){const from=source.indexOf(a),to=source.indexOf(b,from);assert.ok(from>=0&&to>from);return source.slice(from,to);}
function payload(){return {success:true,totalRead:3,totalNew:999,duplicates:999,machines:[1,2,3].map(machineNo=>({machineNo,ip:'192.0.2.'+machineNo,success:true})),scans:[1,2,3].map(machineNo=>({machineNo,enrollNumber:String(10+machineNo),scanDateTime:'2026-11-03 08:15:00',verifyMode:268435456,inOutMode:1,workCode:null}))};}
function handlers(pool,cli=payload()){
 const routes={};
 const ctx=vm.createContext({console:{log(){},warn(){},error(){}},getDbPool:()=>pool,assertScannerStorage,syncRunning:false,
 samRoute:x=>x,samRouter:{post:(p,...f)=>routes[p]=f.at(-1)},executeScannerReaderCli:async()=>structuredClone(cli)});
 vm.runInContext(section('function toBangkokDateTimeStr','function scannerDbMachineSummaries')+section('function scannerDbMachineSummaries','async function syncHosofficeToAttendanceRawScan')+section('async function calculateDailyAttendanceForDate','// 4.12.1')+section("samRouter.post(samRoute('/api/scanners/sync'),",'// 4.12.2')+section("samRouter.post(samRoute('/api/scanners/sync-custom'),",'// 4.12.3'),ctx);
 return {ctx,async request(p,body={}){const r={code:200,status(n){this.code=n;return this},json(b){this.body=b;return this}};await routes[p]({body},r);return r;}};
}
test('MariaDB 10.11 isolated suite — NEVER run on shared hospital DB server',{skip:!enabled},async t=>{
 const pipe=process.env.SAM_ATT_MARIADB_TEST_PIPE;
 assert.match(pipe||'',/^SamAttCodex[0-9A-Za-z_-]+$/,'Only a separately created development named pipe is accepted');
 assert.ok(process.env.SAM_ATT_MARIADB_TEST_DATADIR,'Exact workspace test datadir is required');
 const mysql=require('mysql2/promise');
 const pool=mysql.createPool({socketPath:'\\\\.\\pipe\\'+pipe,user:'root',database:'samchuk_attendance',charset:'utf8mb4',dateStrings:true,multipleStatements:false,connectionLimit:4});
 try{
  const [[id]]=await pool.query('SELECT VERSION() AS version,@@skip_networking AS skip_networking,@@datadir AS datadir,@@sql_mode AS sql_mode');
  assert.match(id.version,/^10\.11\.\d+.*MariaDB/);assert.equal(Number(id.skip_networking),1);
  const normalize=p=>path.resolve(p).toLowerCase().replace(/[\\/]+$/,'');
  assert.equal(normalize(id.datadir),normalize(process.env.SAM_ATT_MARIADB_TEST_DATADIR));
  const [schemas]=await pool.query('SHOW DATABASES');
  assert.ok(schemas.every(s=>['information_schema','mysql','performance_schema','sys','samchuk_attendance','sam_att_test_sentinel'].includes(s.Database)),'Unexpected database: refusing all writes');
  const [[existing]]=await pool.query('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',['samchuk_attendance']);
  assert.equal(Number(existing.n),0,'Suite requires a fresh, empty workspace test schema');
  assert.match(id.sql_mode,/STRICT_TRANS_TABLES|STRICT_ALL_TABLES/);
  console.log('REAL ENGINE:',id.version,'schema=samchuk_attendance; named pipe; skip_networking=1; strict SQL mode; workspace datadir verified');
  const reset=async()=>{for(const table of ['attendance_person_roster','attendance_daily_result','attendance_raw_scan','fingle_mapping','attendance_personnel','attendance_shift','scanner_sync_log'])await pool.query('DELETE FROM '+table);};
  const people=async()=>{await pool.query("INSERT INTO attendance_personnel(person_id,fingle_id,hr_fullname) VALUES(99,11,'fixture-99'),(11,88,'fixture-unrelated')");};
  const rows=async()=> (await pool.query('SELECT * FROM attendance_raw_scan ORDER BY id'))[0];
  await t.test('scoped migration creates scanner/calculation tables, is idempotent and leaves sentinel schema untouched',async()=>{
   const c=await pool.getConnection();try{const first=await migrateScannerStorage(c);assert.equal(first.after.storageReady,true);assert.equal(first.after.calculationSchemaReady,true);assert.equal((await migrateScannerStorage(c)).after.storageReady,true);}finally{c.release();}
   assert.equal((await pool.query('SELECT marker FROM sam_att_test_sentinel.guard'))[0][0].marker,'unchanged');
  });
  await t.test('empty personnel/mapping retains scans from all three machines as waiting and exact DB counts',async()=>{
   await reset();const h=handlers(pool);const r=await h.request('/api/scanners/sync-custom',{mode:'DATE',date:'2026-11-03',machineNos:'ALL'});
   assert.equal(r.body.rawSaveSuccess,true);assert.equal(r.body.calculationStatus,'WAITING_FOR_MAPPING');assert.equal(r.body.totalInserted,3);assert.equal(r.body.pendingMappingCount,3);assert.equal(r.body.unmappedCount,3);
   assert.equal((await rows()).length,3);assert.ok((await rows()).every(r=>r.person_id===null&&r.hr_mapped===0&&r.push_status==='PENDING'));
   const again=await h.request('/api/scanners/sync-custom',{mode:'DATE',date:'2026-11-03'});assert.equal(again.body.totalInserted,0);assert.equal(again.body.duplicateCount,3);assert.equal(again.body.unmappedCount,0);assert.equal(again.body.pendingMappingCount,3);
   const [logs]=await pool.query('SELECT total_new,duplicates FROM scanner_sync_log ORDER BY id');assert.deepEqual(logs.map(r=>[r.total_new,r.duplicates]),[[3,0],[0,3]]);
  });
  await t.test('DB unique key spans machines and exact counts do not use CLI totalNew',async()=>{
   await reset();const cli=payload();cli.scans.forEach(s=>s.enrollNumber='11');const h=handlers(pool,cli);const saved=await h.ctx.persistScannerCliScans(cli);
   assert.equal(saved.inserted,1);assert.equal(saved.skipped,2);assert.equal((await rows()).length,1);
  });
  await t.test('OVERWRITE preserves Push audit, source and device and updates the original row',async()=>{
   await reset();const cli=payload();cli.scans=cli.scans.slice(0,1);const h=handlers(pool,cli);await h.ctx.persistScannerCliScans(cli);
   await pool.query("UPDATE attendance_raw_scan SET push_status='PUSHED',pushed_by=5,pushed_at='2026-11-03 09:00:00',push_batch_id=7,push_error='fixture'");
   const before=(await rows())[0];cli.scans[0].verifyMode=1073741824;const result=await h.ctx.persistScannerCliScans(cli,{strategy:'OVERWRITE'});const after=(await rows())[0];assert.equal(result.updated,1);assert.equal(result.inserted,0);assert.equal(after.verify_mode,1073741824);
   for(const k of ['id','push_status','pushed_by','pushed_at','push_batch_id','push_error','source','machine_no','device_ip'])assert.equal(after[k],before[k]);
  });
  await t.test('real second-row SQL error rolls back entire transaction',async()=>{
   await reset();await pool.query("CREATE TRIGGER fixture_raw_error BEFORE INSERT ON attendance_raw_scan FOR EACH ROW BEGIN IF NEW.fingle_id=12 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture rollback'; END IF; END");
   try{await assert.rejects(handlers(pool).ctx.persistScannerCliScans(payload()),/fixture rollback/);assert.equal((await rows()).length,0);}finally{await pool.query('DROP TRIGGER fixture_raw_error');}
  });
  await t.test('both preview handlers leave raw/log/daily unchanged',async()=>{
   await reset();for(const p of ['/api/scanners/sync','/api/scanners/sync-custom']){const r=await handlers(pool).request(p,{preview:true,mode:'DATE',date:'2026-11-03',days:7});assert.equal(r.body.success,true);}
   for(const table of ['attendance_raw_scan','scanner_sync_log','attendance_daily_result'])assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM '+table))[0][0].n),0);
  });
  await t.test('fingle_id mapping and local datetime/SDK mode values survive actual storage',async()=>{
   await reset();await people();const cli=payload();cli.scans=cli.scans.slice(0,1);await handlers(pool).ctx.persistScannerCliScans(cli);const r=(await rows())[0];assert.equal(r.person_id,99);assert.equal(r.hr_fullname,'fixture-99');assert.equal(r.scan_date_time,'2026-11-03 08:15:00');assert.equal(r.verify_mode,268435456);assert.equal(r.in_out_mode,1);
  });
  await t.test('real Attendance algorithm runs after raw commit and MariaDB VALUES upsert remains idempotent',async()=>{
   await reset();await people();await pool.query("INSERT INTO attendance_shift(id,shift_code,shift_name,start_time,end_time) VALUES(1,'FIXTURE','fixture-morning','08:15:00','16:00:00')");await pool.query("INSERT INTO attendance_person_roster(person_id,work_date,shift_id) VALUES(99,'2026-11-03',1)");
   const cli=payload();cli.scans=[cli.scans[0],{...cli.scans[0],scanDateTime:'2026-11-03 16:00:00'}];const h=handlers(pool,cli);const result=await h.request('/api/scanners/sync-custom',{mode:'DATE',date:'2026-11-03'});
   assert.equal(result.body.rawSaveSuccess,true);assert.equal(result.body.calculationStatus,'SUCCESS',JSON.stringify(result.body.failedDates));const [daily]=await pool.query('SELECT * FROM attendance_daily_result');assert.equal(daily.length,1);assert.equal(daily[0].person_id,99);assert.equal(daily[0].status,'ON_TIME');assert.equal(daily[0].check_in,'08:15');assert.equal(daily[0].check_out,'16:00');
   assert.equal((await h.ctx.calculateDailyAttendanceForDate('2026-11-03')).success,true);assert.equal((await pool.query('SELECT COUNT(*) AS n FROM attendance_daily_result'))[0][0].n,1);
  });
  await t.test('calculation SQL failure is separate from committed Raw Scan success',async()=>{
   await reset();await people();await pool.query("CREATE TRIGGER fixture_calc_error BEFORE INSERT ON attendance_daily_result FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture calculation error'");
   try{const r=await handlers(pool).request('/api/scanners/sync-custom',{mode:'DATE',date:'2026-11-03'});assert.equal(r.body.success,false);assert.equal(r.body.rawSaveSuccess,true);assert.equal(r.body.totalInserted,3);assert.equal(r.body.calculationStatus,'FAILED');assert.equal((await rows()).length,3);}finally{await pool.query('DROP TRIGGER fixture_calc_error');}
  });
  await t.test('equivalent unique indexes are detected by columns, not assumed names',async()=>{
   await reset();await pool.query('ALTER TABLE attendance_raw_scan ADD UNIQUE KEY fixture_redundant (scan_date_time,fingle_id)');const report=await inspectScannerStorage(pool);assert.equal(report.rawUniqueKeys.length,2);assert.equal(report.redundantRawUniqueKeys.length,1);
   const c=await pool.getConnection();try{await migrateScannerStorage(c);}finally{c.release();}assert.equal((await inspectScannerStorage(pool)).rawUniqueKeys.length,2);await pool.query('ALTER TABLE attendance_raw_scan DROP INDEX fixture_redundant');
  });
  await t.test('duplicate existing data blocks migration with every row retained',async()=>{
   await reset();await pool.query('ALTER TABLE attendance_raw_scan DROP INDEX uq_fingle_scan');const sql="INSERT INTO attendance_raw_scan(machine_no,fingle_id,scan_date_time) VALUES(1,11,'2026-11-03 08:15:00')";await pool.query(sql);await pool.query(sql);
   const c=await pool.getConnection();try{await assert.rejects(migrateScannerStorage(c),/Duplicate raw groups/);}finally{c.release();}assert.equal((await rows()).length,2);assert.equal((await inspectScannerStorage(pool)).duplicateExtraRows,1);
   // Test fixture cleanup only, after asserting preservation; never part of migration.
   await pool.query('DELETE FROM attendance_raw_scan');const con=await pool.getConnection();try{await migrateScannerStorage(con);}finally{con.release();}
  });
  await t.test('additive migration repairs missing optional/source columns without losing raw rows or Push audit',async()=>{
   await reset();const cli=payload();await handlers(pool).ctx.persistScannerCliScans(cli);const before=await rows();
   await pool.query('ALTER TABLE attendance_raw_scan DROP COLUMN source');await pool.query('ALTER TABLE attendance_daily_result DROP COLUMN source_scan_ids');
   const c=await pool.getConnection();try{const r=await migrateScannerStorage(c);assert.equal(r.after.storageReady,true);assert.equal(r.after.calculationSchemaReady,true);}finally{c.release();}
   const after=await rows();assert.equal(after.length,before.length);for(let i=0;i<after.length;i++){assert.equal(after[i].id,before[i].id);assert.equal(after[i].push_status,before[i].push_status);assert.equal(after[i].source,'DEVICE');}
  });
  await t.test('OVERWRITE cannot erase an existing HR snapshot when personnel master is empty',async()=>{
   await reset();await people();const cli=payload();cli.scans=cli.scans.slice(0,1);const h=handlers(pool);await h.ctx.persistScannerCliScans(cli);await pool.query('DELETE FROM attendance_personnel');cli.scans[0].verifyMode=1073741824;
   const result=await h.ctx.persistScannerCliScans(cli,{strategy:'OVERWRITE'});const row=(await rows())[0];assert.equal(row.person_id,99);assert.equal(row.hr_fullname,'fixture-99');assert.equal(row.hr_mapped,1);assert.equal(result.unmapped,0);assert.equal(result.pendingMappingCount,0);
  });
  await t.test('wrong selected schema is rejected before mutation',async()=>{
   const c=await pool.getConnection();try{await c.query('USE sam_att_test_sentinel');await assert.rejects(migrateScannerStorage(c),/requires database samchuk_attendance/);assert.equal((await c.query('SELECT marker FROM guard'))[0][0].marker,'unchanged');await c.query('USE samchuk_attendance');}finally{c.release();}
  });
 }finally{await pool.end();}
});
