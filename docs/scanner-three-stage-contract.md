# Scanner three-stage JSON contract and safe migration plan

## Contracts
1. `scanner-cli-output.sample.json`: scanner reader output, per-scan records required in `scans[]` for direct raw ingestion. Each record has `machineNo`, `enrollNumber`, `scanDateTime` (Bangkok local `YYYY-MM-DD HH:mm:ss`), `verifyMode`, `inOutMode`, `workCode`. Reader summary alone is insufficient.
2. `scanner-sync-api.sample.json`: `POST /api/Sam_Att/scanners/sync` response from Gateway (Sam_Att internal route `/api/scanners/sync`), reporting actual DB inserted/duplicate/unmapped counts and calculation status. Do not substitute CLI `totalNew` for DB inserts.
3. `scanner-raw-scans.sample.json`: `GET /api/Sam_Att/raw-scans` response from `attendance_raw_scan`; map `enrollNumber` to `fingleId` without timezone conversion. Preserve `pushStatus=PENDING` until manual HOSOffice push.

## Historical findings before direct ingestion (superseded below)
- `executeScannerReaderCli` invokes `ScannerSyncCli.exe` and parses summary JSON; no direct `scans[]` ingestion.
- `POST /api/scanners/sync` and `POST /api/scanners/sync-custom` subsequently copy data from `hosoffice.fingle_scan` into `attendance_raw_scan`; they do not directly ingest scanner records from EXE.
- Both routes contain `DELETE FROM fingle_scan WHERE CREATE_BY = 'SCAN_SYNC'`. This write must not run as part of a new read-only scanner-to-raw workflow.
- The supplied CLI source emits only summary JSON and uses `--days` and a single `--machine`. It does not emit per-scan JSON; backend-only changes cannot manufacture missing scanner records.
- `GET /api/raw-scans` reads `attendance_raw_scan`; batch insert endpoint already exists.
- `sync-custom` may collapse a multiple-machine selection into an all-machines invocation; explicit selections must be honored.

## Required gates before enabling direct ingestion
- Obtain real scanner records from a supported existing read-only source (new CLI JSON protocol would require separately validating/building an EXE; **do not replace working EXE without explicit approval**). Never infer records from aggregate counters.
- Implement a single idempotent insert path with validated machine number, numeric fingerprint ID and local scan timestamp. Use existing unique-key semantics, and verify actual inserted/skipped counts.
- Keep HOSOffice read/write operations separate from scanner ingestion; no automatic deletion and no automatic push.
- Treat preview as strictly read-only, including no log/database mutation if that is the documented expectation.
- Recalculate attendance only after verified ingestion, and report failures accurately.
- Verify the existing `/api/Sam_Att/` gateway prefix on the shared port 3002. Do not open extra web listeners.
- Test using fixtures, isolated DB and Windows scanner environment before deployment. Protect Procurement and production data.

This is a contract/design checkpoint only. No executable, production DB, server process, or existing runtime handler was changed.


## Follow-up implementation and verification

Continues commit `81bb7ec4c03ada337518a4f0782c5c9174136ef6` on
`develop/scanner-three-stage-contract`. The supplied successful three-device
EXE result (9,917 read / 746 date-filtered records) is accepted as reference;
no scanner hardware or production service was accessed.

- Corrected the escaped timestamp regex and reject invalid calendar dates,
  incomplete scan records, out-of-range SQL INT identifiers/modes, missing IPs,
  failed machine results and ambiguous active fingerprint mappings.
- Map enrollNumber only by attendance_personnel.fingle_id, without person_id fallback.
  Preserve local timestamp strings and SDK mode integers, including 268435456
  and 1073741824. No interpretation of inOutMode as attendance direction added.
- Insert the batch on one connection in a transaction; any error rolls it back.
  Plain INSERT avoids INSERT IGNORE suppressing unrelated database errors.
  Only ER_DUP_ENTRY with an existing (fingle_id, scan_date_time) row is a duplicate.
  OVERWRITE updates the matching row's modes/personnel snapshot, preserving
  push status/audit metadata and original device/source provenance. Updated counts
  mean existing rows successfully processed, including unchanged snapshots.
- DB insert/duplicate/update outcomes drive API counts, per-machine summaries
  and successful-sync logs. Preview reports zero DB mutations, with totalFound
  describing matching candidate rows, not predicted inserts/duplicates.
- Both scanner paths bypass schema initialization, logging and calculation in preview.
  Multiple custom-machine selections invoke the CLI once per selected machine;
  normal sync supports a single machine or ALL. Backend filters dates/machines
  again before saving. YEAR/RANGE iteration does not depend on host timezone.
- Calculate only committed insert/overwrite dates; duplicates skipped by policy
  do not create calculation dates. Both false results and exceptions return
  success=false / HTTP 502, with FAILED/PARTIAL details and committed counts.
- Parse compact and pretty stdout JSON, including diagnostic prefixes, with
  bounded parsing attempts. The existing 25 MiB maxBuffer remains a hard cap;
  overflow/timeout/process errors fail closed before ingestion.

### Verification actually performed

- `node --check backend/server.cjs`: passed.
- `node --test backend/scanner-sync.test.cjs`: 23 tests passed.
- Tests execute the actual helper and route source inside node:vm with mocked
  DB connections, EXE calls and calculation. They do not start HTTP listeners,
  run startup migrations, invoke a scanner executable or connect to a database.
- Fixtures cover 10,000 compact/pretty JSON scans, malformed/overflow output,
  ID mapping, calendar validation, duplicate keys across machines, preservation
  of Push metadata, rollback, multi-machine invocation, date filtering, strict
  preview, endpoint save/EXE errors, calculation false/throw and mutex release.

### Remaining gates and limitations

**Not production-ready.** SQL matches the repository schema, including the
existing `hr_leavel_name` spelling and unique `(fingle_id, scan_date_time)` key,
but no isolated MySQL integration was run: this environment has no MySQL,
MariaDB or Docker executable. Verify SQL, transaction/locking behavior,
SQL modes, persisted values/counts and GET /api/raw-scans refresh against a
non-production database with the real schema before deployment. Full frontend
build was not run (npm unavailable); frontend source/API field names are unchanged.

The backend passes `--days` and one `--machine` per CLI call. It does **not** claim
support for `--date-from`/`--date-to`, and cannot prove that the deployed EXE
honors an arbitrarily old date window or retains all historical records.
The former silent backend 180-day clamp was removed; coverage still requires
the existing EXE's documented retention/argument behavior. No EXE was changed.

The raw schema has no workCode column. Nullable workCode is accepted in the CLI
contract but is not persisted; storing non-null workCode requires a separately
authorized schema decision. Data beyond 25 MiB fails explicitly rather than
being partially imported; larger supported payloads need a separate limit or
streaming decision. Scanner EXE/DB save failures return errors before successful
sync logging; they currently do not create a scanner_sync_log row. After a
calculation failure, raw rows remain committed; use the existing explicit
recalculation operation to retry failedDates (SKIP_DUPLICATES alone does not
recalculate unchanged dates).

No production EXE/data/service, database schema, shared listener/port,
Procurement route, HOSOffice staging, push workflow or main branch was changed.


## Integration/build follow-up

The frontend-build limitation above is superseded by
[scanner-integration-testing.md](scanner-integration-testing.md): the actual
production build and TypeScript check now pass. There are 27 passing backend
scanner tests and 8 passing frontend scanner tests. The real-MySQL suite has ten
prepared cases and remains unexecuted without an isolated MySQL instance (the
disabled suite reports SKIP). See that runbook for guarded local-only commands,
frontend fixes, EXE transport limits and Windows Server staging acceptance.
