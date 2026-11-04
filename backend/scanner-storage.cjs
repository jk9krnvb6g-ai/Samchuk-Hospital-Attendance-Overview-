const fs = require('node:fs');
const path = require('node:path');
const SCHEMA = 'samchuk_attendance';
const ddlText = fs.readFileSync(path.join(__dirname, 'migrations/scanner-mariadb-10.11.sql'), 'utf8');
const definitions = [...ddlText.matchAll(/CREATE TABLE IF NOT EXISTS samchuk_attendance\.(\w+) \(([\s\S]*?)\) ENGINE=InnoDB[^;]*;/g)].map(m => ({
  table: m[1], sql: m[0], columns: Object.fromEntries(m[2].split('\n').map(line => line.trim().replace(/,$/, '')).filter(line => /^\w+\s+(?:INT|BIGINT|VARCHAR|DATETIME|DATE|TIME|TEXT|JSON|TINYINT)\b/i.test(line)).map(line => [line.split(/\s/)[0], line]))
}));
function failure(message) { return Object.assign(new Error(message), { code: 'SCANNER_SCHEMA_NOT_READY' }); }
async function identity(db) {
  const [[row]] = await db.query("SELECT DATABASE() AS db, VERSION() AS version, SHA2(CONCAT_WS(':',@@hostname,@@server_id,@@port),256) AS server_identity");
  if (row.db !== SCHEMA) throw failure('Scanner operation requires database samchuk_attendance');
  return row;
}
async function inspectScannerStorage(db, options = {}) {
  const id = await identity(db);
  const names = definitions.map(d => d.table);
  const [tables] = await db.query('SELECT TABLE_NAME AS table_name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME IN (?)', [SCHEMA, names]);
  const [columns] = await db.query('SELECT TABLE_NAME AS table_name,COLUMN_NAME AS column_name,DATA_TYPE AS data_type,IS_NULLABLE AS is_nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME IN (?)', [SCHEMA, names]);
  const [indexes] = await db.query('SELECT TABLE_NAME AS table_name,INDEX_NAME AS index_name,NON_UNIQUE AS non_unique,COLUMN_NAME AS column_name,SEQ_IN_INDEX AS seq,SUB_PART AS sub_part FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME IN (?) ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX', [SCHEMA, names]);
  const present = new Map(tables.map(t => [t.table_name,t.engine]));
  const missingTables = names.filter(n => !present.has(n));
  const missingColumns = definitions.flatMap(d => !present.has(d.table) ? [] : Object.keys(d.columns).filter(c => !columns.some(r => r.table_name === d.table && r.column_name === c)).map(column => ({ table: d.table, column })));
  const nonTransactional = tables.filter(t => t.engine !== 'InnoDB').map(t => t.table_name);
  const groups = new Map();
  for (const index of indexes) {
    const key = index.table_name + ':' + index.index_name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  }
  const uniqueFor = (table, signature) => [...groups.values()].filter(g => g[0].table_name === table && g.every(c => Number(c.non_unique) === 0 && c.sub_part == null) && g.map(c => c.column_name).sort().join(',') === signature).map(g => g[0].index_name);
  const rawUniqueKeys = uniqueFor('attendance_raw_scan','fingle_id,scan_date_time');
  const dailyUniqueKeys = uniqueFor('attendance_daily_result','person_id,shift_id,work_date');
  const rawColumn = n => columns.find(c => c.table_name === 'attendance_raw_scan' && c.column_name === n);
  const criticalShapeProblems = ['fingle_id','scan_date_time'].filter(n => rawColumn(n) && (rawColumn(n).is_nullable !== 'NO' || rawColumn(n).data_type !== (n === 'fingle_id' ? 'int' : 'datetime')));
  let duplicateGroups = null, duplicateExtraRows = null, pendingMappingCount = null;
  if (present.has('attendance_raw_scan') && rawColumn('fingle_id') && rawColumn('scan_date_time')) {
    if (options.auditDuplicates === false && rawUniqueKeys.length && !criticalShapeProblems.length) {
      duplicateGroups = 0; duplicateExtraRows = 0; // Guaranteed by full NOT NULL unique key.
    } else {
      const [[counts]] = await db.query('SELECT COUNT(*) AS duplicate_groups, COALESCE(SUM(n-1),0) AS duplicate_extra_rows FROM (SELECT COUNT(*) AS n FROM samchuk_attendance.attendance_raw_scan GROUP BY fingle_id,scan_date_time HAVING COUNT(*)>1) AS scan_duplicates');
      duplicateGroups = Number(counts.duplicate_groups); duplicateExtraRows = Number(counts.duplicate_extra_rows);
    }
    if (rawColumn('hr_mapped')) {
      const [[mapping]] = await db.query('SELECT COUNT(*) AS pending FROM samchuk_attendance.attendance_raw_scan WHERE hr_mapped=0');
      pendingMappingCount = Number(mapping.pending);
    }
  }

  const storageTables = ['attendance_raw_scan','attendance_personnel','scanner_sync_log'];
  const storageReady = !missingTables.some(n => storageTables.includes(n)) && !missingColumns.some(c => storageTables.includes(c.table)) && !nonTransactional.some(n => storageTables.includes(n)) && !criticalShapeProblems.length && rawUniqueKeys.length > 0 && duplicateGroups === 0;
  return { database: id.db, version: id.version, serverIdentity: id.server_identity, mariaDb1011: /10\.11\.\d+.*MariaDB/i.test(id.version), storageReady,
    calculationSchemaReady: !missingTables.length && !missingColumns.length && !nonTransactional.length && dailyUniqueKeys.length > 0,
    missingTables, missingColumns, nonTransactional, criticalShapeProblems, rawUniqueKeys, dailyUniqueKeys, redundantRawUniqueKeys: rawUniqueKeys.slice(1), duplicateGroups, duplicateExtraRows, pendingMappingCount };
}
async function assertScannerStorage(db) {
  const report = await inspectScannerStorage(db, { auditDuplicates: false });
  if (!report.storageReady) throw failure('Scanner schema is not ready; run the scoped schema inspection/migration separately');
  return report;
}
async function snapshotScannerState(db) {
  if (typeof db.getConnection === 'function') throw failure('Snapshot requires one dedicated read-only connection, not a pool');
  await identity(db);
  const tables = ['attendance_raw_scan','scanner_sync_log','attendance_daily_result','attendance_personnel','fingle_mapping'];
  await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await db.query('START TRANSACTION READ ONLY');
  try {
    const snapshot = {};
    for (const table of tables) {
      const [columns] = await db.query('SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[SCHEMA,table]);
      if (!columns.length || columns.some(c => !/^[a-zA-Z0-9_]+$/.test(c.name))) throw failure('Snapshot requires a known, initialized scanner schema');
      const fields = columns.map(c => '\`' + c.name + '\`').join(',');
      const [rows] = await db.query(`SELECT SHA2(JSON_ARRAY(${fields}),256) AS digest FROM samchuk_attendance.\`${table}\` ORDER BY id`);
      const hash = require('node:crypto').createHash('sha256');
      for (const row of rows) { if (!row.digest) throw failure('Snapshot digest is unavailable'); hash.update(row.digest + '\n'); }
      snapshot[table] = { rows: rows.length, sha256: hash.digest('hex') };
    }
    await db.commit();
    return { database: SCHEMA, tables: snapshot };
  } catch (error) { await db.rollback(); throw error; }
}
async function planScannerMigration(db) {
  const before = await inspectScannerStorage(db);
  const blockers = [];
  if (!before.mariaDb1011) blockers.push('Migration requires MariaDB 10.11');
  if (before.criticalShapeProblems.length) blockers.push('Existing raw identifier/time types or nullability need a separate migration; no automatic MODIFY');
  if (before.nonTransactional.length) blockers.push('Non-InnoDB tables need a separately reviewed conversion');
  if (before.duplicateGroups > 0) blockers.push('Duplicate raw groups exist; all rows retained');
  const [dailyColumns] = await db.query('SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', [SCHEMA,'attendance_daily_result']);
  if (['person_id','work_date','shift_id'].every(n => dailyColumns.some(c => c.column_name === n))) {
    const [[conflicts]] = await db.query('SELECT COUNT(*) AS n FROM (SELECT 1 FROM samchuk_attendance.attendance_daily_result GROUP BY work_date,person_id,shift_id HAVING COUNT(*)>1) AS duplicates');
    if (Number(conflicts.n)) blockers.push('Duplicate daily groups exist; all rows retained');
  }
  const actions = [];
  for (const d of definitions) if (before.missingTables.includes(d.table)) actions.push({ kind: 'CREATE_TABLE', table: d.table, sql: d.sql });
  for (const c of before.missingColumns) {
    const definition = definitions.find(d => d.table === c.table).columns[c.column];
    if (/PRIMARY KEY|AUTO_INCREMENT|NOT NULL(?!.*DEFAULT)/i.test(definition)) blockers.push('Unsafe required legacy column: ' + c.table + '.' + c.column);
    else actions.push({ kind: 'ADD_COLUMN', table: c.table, column: c.column, sql: `ALTER TABLE samchuk_attendance.\`${c.table}\` ADD COLUMN IF NOT EXISTS ${definition}` });
  }
  // Optional missing raw columns must not hide conflicts from the plan.
  if (before.duplicateGroups == null && !before.missingTables.includes('attendance_raw_scan') && !before.missingColumns.some(c => c.table === 'attendance_raw_scan' && ['fingle_id','scan_date_time'].includes(c.column))) {
    const [[conflicts]] = await db.query('SELECT COUNT(*) AS n FROM (SELECT 1 FROM samchuk_attendance.attendance_raw_scan GROUP BY fingle_id,scan_date_time HAVING COUNT(*)>1) AS duplicates');
    if (Number(conflicts.n)) blockers.push('Duplicate raw groups exist; all rows retained');
  }
  if (!before.rawUniqueKeys.length && !before.missingTables.includes('attendance_raw_scan')) actions.push({ kind: 'ADD_UNIQUE', table: 'attendance_raw_scan', sql: 'ALTER TABLE samchuk_attendance.attendance_raw_scan ADD UNIQUE KEY uq_scanner_fingerprint_time (fingle_id,scan_date_time)' });
  if (!before.dailyUniqueKeys.length && !before.missingTables.includes('attendance_daily_result')) actions.push({ kind: 'ADD_UNIQUE', table: 'attendance_daily_result', sql: 'ALTER TABLE samchuk_attendance.attendance_daily_result ADD UNIQUE KEY uq_scanner_daily_person_shift (work_date,person_id,shift_id)' });
  const content = { database: SCHEMA, version: before.version, serverIdentity: before.serverIdentity, actions, blockers };
  const planHash = require('node:crypto').createHash('sha256').update(JSON.stringify(content)).digest('hex');
  return { ...content, planHash, before, executable: blockers.length === 0, implicitCommit: true };
}
async function migrateScannerStorage(db, options = {}) {
  if (typeof db.getConnection === 'function') throw failure('Migration requires one dedicated connection, not a pool');
  await identity(db);
  if (!/^[a-f0-9]{64}$/.test(options.approvedPlanHash || '')) throw failure('A reviewed, approved planHash is required before apply');
  const [[lock]] = await db.query("SELECT GET_LOCK('samchuk_attendance.scanner_migration',0) AS acquired");
  if (Number(lock.acquired) !== 1) throw failure('Another scanner migration holds the lock');
  try {
    const plan = await planScannerMigration(db);
    if (!plan.executable) throw failure(plan.blockers.join('; '));
    if (plan.planHash !== options.approvedPlanHash) throw failure('Migration plan changed; inspect and obtain approval again. No DDL applied');
    for (const action of plan.actions) await db.query(action.sql);
    return { before: plan.before, plan, after: await inspectScannerStorage(db) };
  } finally { await db.query("SELECT RELEASE_LOCK('samchuk_attendance.scanner_migration')"); }
}
module.exports = { SCHEMA, definitions, inspectScannerStorage, assertScannerStorage, snapshotScannerState, planScannerMigration, migrateScannerStorage };
