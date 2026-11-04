// Administrative CLI: SELECT-only by default. No CREATE/DROP DATABASE is implemented.
const { inspectScannerStorage, migrateScannerStorage } = require('./scanner-storage.cjs');
async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && process.env.SAM_ATT_MIGRATION_CONFIRM !== 'APPLY_SAMCHUK_ATTENDANCE_ONLY') throw new Error('Explicit schema-only migration confirmation is required');
  if (!process.env.SAM_ATT_DB_USER || !process.env.SAM_ATT_DB_HOST) throw new Error('Set dedicated SAM_ATT_DB_HOST and SAM_ATT_DB_USER; application config is not loaded');
  const mysql = require('mysql2/promise');
  const db = await mysql.createConnection({ host: process.env.SAM_ATT_DB_HOST, port: Number(process.env.SAM_ATT_DB_PORT || 3306), user: process.env.SAM_ATT_DB_USER, password: process.env.SAM_ATT_DB_PASSWORD || '', database: 'samchuk_attendance', charset: 'utf8mb4', dateStrings: true, multipleStatements: false, connectTimeout: 5000 });
  try { console.log(JSON.stringify(apply ? await migrateScannerStorage(db) : await inspectScannerStorage(db), null, 2)); }
  finally { await db.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.code || 'SCANNER_DB_ADMIN_FAILED', error.message); process.exitCode = 1; });
