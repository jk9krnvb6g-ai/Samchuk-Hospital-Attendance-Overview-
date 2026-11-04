// Shared-server acceptance: only SELECT via the same inspector used at runtime.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspectScannerStorage}=require('../scanner-storage.cjs');
const enabled=process.env.SAM_ATT_MARIADB_ACCEPTANCE==='READ_ONLY_SAMCHUK_ATTENDANCE';
test('MariaDB shared-server schema acceptance — SELECT only',{skip:!enabled},async()=>{
 assert.ok(process.env.SAM_ATT_DB_HOST&&process.env.SAM_ATT_DB_USER,'Explicit read-only connection settings required');
 const mysql=require('mysql2/promise');const c=await mysql.createConnection({host:process.env.SAM_ATT_DB_HOST,port:Number(process.env.SAM_ATT_DB_PORT||3306),user:process.env.SAM_ATT_DB_USER,password:process.env.SAM_ATT_DB_PASSWORD||'',database:'samchuk_attendance',dateStrings:true,multipleStatements:false,connectTimeout:5000});
 try{const report=await inspectScannerStorage(c);console.log(JSON.stringify(report));assert.equal(report.mariaDb1011,true);assert.equal(report.storageReady,true);assert.equal(report.calculationSchemaReady,true);}finally{await c.end();}
});
