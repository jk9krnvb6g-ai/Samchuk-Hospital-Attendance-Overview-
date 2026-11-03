# Scanner three-stage JSON contract and safe migration plan

## Contracts
1. `scanner-cli-output.sample.json`: scanner reader output, per-scan records required in `scans[]` for direct raw ingestion. Each record has `machineNo`, `enrollNumber`, `scanDateTime` (Bangkok local `YYYY-MM-DD HH:mm:ss`), `verifyMode`, `inOutMode`, `workCode`. Reader summary alone is insufficient.
2. `scanner-sync-api.sample.json`: `POST /api/Sam_Att/scanners/sync` response from Gateway (Sam_Att internal route `/api/scanners/sync`), reporting actual DB inserted/duplicate/unmapped counts and calculation status. Do not substitute CLI `totalNew` for DB inserts.
3. `scanner-raw-scans.sample.json`: `GET /api/Sam_Att/raw-scans` response from `attendance_raw_scan`; map `enrollNumber` to `fingleId` without timezone conversion. Preserve `pushStatus=PENDING` until manual HOSOffice push.

## Current repository findings (backend/server.cjs)
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
