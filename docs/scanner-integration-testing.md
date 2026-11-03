# Scanner sync verification and isolated MySQL runbook

## Results in this checkout

Continues `d93f5d94b9693412b7700a52b4c02656c66e6663` on the existing development branch.

| Check | Actual result |
|---|---|
| Frontend production build (`npm run build`) | PASS; Vite 8.3.5, 1,684 modules. Existing >500 kB chunk warning remains. |
| TypeScript (`npm run lint`) | PASS |
| Backend syntax (`node --check backend/server.cjs`) | PASS |
| Backend scanner tests (`npm run test:scanner`) | 39/39 PASS (32 persistence/route cases + 7 contract/raw-GET/guard cases) |
| Frontend scanner tests (`npm run test:scanner:frontend`) | 10/10 PASS |
| MySQL (`npm run test:scanner:mysql`) | NOT RUN against MySQL; disabled suite reports SKIP, not PASS |

npm was bootstrapped into the task's scratch directory; `npm ci` installed the
existing lockfile without changing dependency versions. No listener, browser
production session, scanner EXE or production database was started/contacted.

## Changes found by tracing the frontend scanner flow

- Single-machine Sync now displays request failures instead of swallowing them,
  and disables repeat clicks while that request is active.
- Scanner preview displays candidate totals, without presenting zero DB-write
  counters as predictions of new/duplicate rows. Failed previews display errors.
- Successful scanner sync and committed-but-failed calculation refresh raw rows
  using read-only loaders, without triggering the frontend's fallback attendance
  calculation/save. Other consumers retain their existing behavior.
- Custom calculation failures retain backend counts and failedDates in the
  displayed message. Normal sync messages use DB counts rather than CLI counters.
- Raw Scan force refresh still uses GET and bypasses the cache. A failed refresh
  retains the last rows and shows an error; a successful refresh clears it.
- Raw GET returns local DATETIME text using SQL DATE_FORMAT and HTTP 503 on DB
  failure, instead of claiming an empty successful result.

Frontend tests execute the real API client/store with mocked fetch/API calls;
this is not a browser/IIS end-to-end acceptance test.

## Run the ten real MySQL cases later

There is no installed MySQL, MariaDB or Docker executable/test instance in the
current environment. No production connection was substituted. The suite is
prepared in `backend/tests/scanner-mysql.integration.test.cjs`.

Use a **dedicated disposable MySQL 8 test instance** on numeric loopback and a
non-default database port, e.g. 127.0.0.1:3307. Do not tunnel a production DB to
this port. No HTTP port is opened by these tests.

On that disposable instance only, create an account with CREATE/DROP, table,
DML and TRIGGER privileges for the `sam_att_scanner_test_` database namespace.
The required account name is `sam_att_test_runner`; do not reuse hospital app
credentials. An administrator can grant the account privileges on the test
namespace (use an account host suitable for the disposable instance).

Then, from the repository in PowerShell, with Node/npm installed:

```powershell
npm ci
$env:SCANNER_TEST_MYSQL_ENABLE = 'ISOLATED_LOCAL_TEST_ONLY'
$env:SCANNER_TEST_MYSQL_HOST = '127.0.0.1'
$env:SCANNER_TEST_MYSQL_PORT = '3307'
$env:SCANNER_TEST_MYSQL_USER = 'sam_att_test_runner'
# Set SCANNER_TEST_MYSQL_PASSWORD using your local secret mechanism.
npm run test:scanner:mysql
Remove-Item Env:SCANNER_TEST_MYSQL_PASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:SCANNER_TEST_MYSQL_ENABLE
```

The suite refuses non-loopback hosts, port 3306 and other account names. It never
loads `.env`, appsettings, production config, a database URL or a supplied schema
name. It creates a cryptographically unique `sam_att_scanner_test_<16 hex>`
database, creates only test tables, and drops only that generated database in
`finally`. If the process is forcibly killed, inspect the printed generated
schema name and remove that specific disposable database manually.

The personnel DDL comes from schema_latest.sql; the raw/log DDL comes from the
backend's current table definitions, including source and the existing unique
fingerprint/time key. Startup migrations/server imports are not executed.

Cases:
1. New insert and initial PENDING status.
2. Duplicate fingerprint/time, including a different scanner machine.
3. OVERWRITE preserves Push status, time, user, batch and error metadata.
4. A real MySQL SIGNAL trigger error on the second row rolls back the first row.
5. Both preview handlers leave raw/personnel/log table contents unchanged and
   never bootstrap tables or calculate attendance.
6. fingle_id mapping wins over a conflicting person_id.
7. Unmapped scans remain stored with null person_id and PENDING.
8. Local timestamp and SDK integers survive storage and raw GET; workCode=null
   does not cause a save error.
9. Mixed insert/skip/overwrite counts match DB cardinality and values.
10. Both sync handlers invoke the calculation callback only after a separate
    connection can observe committed rows, and never after rollback.

The suite uses **real MySQL persistence and actual handler/helper source**.
The scanner reader is a fixture and attendance calculation is an observing
callback; the full attendance algorithm, IIS routing and hospital EXE are not
integration-tested here.

## ScannerSyncCli contract and remaining limits

- The previous user-supplied 746-row/three-device success remains the hardware
  reference. Neither bundled nor production EXE was executed or modified.
- This checkout contains compiled CLI files and a binary ZIP, but no CLI source
  or authoritative argument help. Deployed binary date-argument support and
  retention cannot be verified from those artifacts alone.
- The backend accepts the required scans[] fields, preserves mode integers and
  local wall-clock timestamps, and allows workCode=null. No schema column exists
  for persisting non-null workCode; a separate schema decision is still needed.
- Backend commands use --days and one --machine per selected device. They do not
  use --date-from/--date-to. Exact date/machine filtering happens after reading;
  this does not prove that an old requested interval was completely read.
- A real Node child process emitting 20,000 pretty JSON scans passed the existing
  execFile/parser path. A real child emitting more than 25 MiB failed with a
  maxBuffer error and no partial scans returned. These are protocol/transport
  fixtures, not scanner hardware tests.
- The 25 MiB limit remains. Above-limit results must fail explicitly; a future
  streaming protocol or separately reviewed limit increase is needed for larger
  supported windows. No silent truncation/import is accepted.
- If direct date-window support is needed, first obtain authoritative help/source
  for the exact deployed reader. Validate a separately built reader in a test
  environment, including read-only behavior; changing/replacing production EXE
  requires separate authorization. Do not add unsupported flags speculatively.
- Calculation failures leave raw scans committed. Retry failedDates using the
  existing explicit recalculation operation; SKIP_DUPLICATES does not recalculate
  unchanged dates. EXE/save failures still do not create failure sync-log rows.

## Windows Server staging acceptance before production

Ready to transfer to an **isolated staging checkout**, not production deployment.
First run the MySQL suite against the disposable instance. Then, using approved
staging fixtures and existing HTTPS architecture (frontend 3001 / backend 3002),
verify normal Sync, custom DATE/RANGE, machines [1,3], preview, Raw Scan refresh,
insert/duplicate/error messages and committed calculation failures. Confirm the
/Sam_Att/ IIS rewrite reaches /api/Sam_Att/ without affecting Procurement or
Cash_Cheque. Verify the actual attendance algorithm's persisted results in the
staging DB. Capture exact deployed reader argument/retention evidence before
claiming full historical-window support. No production deploy/restart/merge is
part of this work.


## Final coverage and read-only morning inspection

The final development round also verifies both shared-mutex paths (409 while a
reader is pending), aggregate-success/machine-failure rejection, zero partial
persistence when a later selected machine fails, committed-count consistency
on PARTIAL calculation, leap-year DATE/MONTH/YEAR/RANGE boundaries, nonzero child
exit and real child timeout. Invalid scanner windows now return HTTP 400 before
invoking the reader instead of normalizing dates or falling back to today.
A browser-like store startup fixture issues data reads and zero scanner-sync
requests. MySQL preflight guard tests reject remote hosts and port 3306 before
opening a connection; this is not a substitute for real-MySQL test execution.

Read-only morning inspection on the chosen development/staging checkout:

```powershell
powershell.exe -NoProfile -File .\scripts\scanner-readonly-check.ps1 `
  -RepositoryPath 'C:\Path\To\Sam_Att-Staging' `
  -ReaderPath 'C:\Path\To\ReadOnlyCopy\ScannerSyncCli.exe'
```

The script reads Git branch/commit/file-status names with optional Git locks
disabled, tool availability, existing local listeners on 3001/3002 and the reader
file's metadata/SHA256. It does not run the reader/backend/npm, invoke HTTP/SQL,
read configuration/secrets/personnel, start a listener or restart a service.
A differing reader hash only identifies a differing file; it does not prove
argument compatibility. Do not invoke a production reader for argument discovery.

See [the final Thai readiness report](scanner-final-readiness-report.md) for
blockers, actual results, staging acceptance and production gates.
