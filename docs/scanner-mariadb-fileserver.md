# Sam_Att — MariaDB 10.11.10 และ Windows FILESERVER

เอกสารนี้ใช้ข้อเท็จจริงล่าสุด: FILESERVER เป็น Web/Application Server, Frontend HTTPS 3001, Central API Gateway 3002, DB host `10.1.0.201`, MariaDB `10.11.10`, schema `samchuk_attendance` ระบบ Sam_Att ยังไม่เปิดใช้งานจริง เจ้าของอนุญาตให้ปรับ schema/ข้อมูลเฉพาะฐานนี้ ไม่กำหนด Backup ฐานนี้เป็นเงื่อนไขบังคับ

คำสั่งในเอกสารเป็นงานที่ผู้ดูแลเลือกดำเนินการเอง ยังไม่มีการเชื่อมต่อ FILESERVER/10.1.0.201, migration ฐานจริง, activation, deploy หรือ restart จากงานพัฒนานี้ ห้ามใช้บัญชีสิทธิ์ครอบคลุมฐานอื่น

## ผลที่ยืนยันแล้วและความหมาย API

ทดสอบ MariaDB 10.11.10 portable จริงใน development workspace แยก ผ่าน named pipe, `skip_networking=1`, strict SQL mode ไม่ติดตั้ง service/เปิด HTTP listener ใช้ schemaทดสอบ `samchuk_attendance` และฐาน sentinel สังเคราะห์ `sam_att_test_sentinel` ที่ไม่เปลี่ยนแปลงจาก migration

- Raw Scan สามเครื่องบันทึกแบบ InnoDB transaction; duplicate ตรวจตาม unique `(fingle_id, scan_date_time)` จาก DB ไม่ใช้ยอด CLI
- OVERWRITE แยก INSERT กับ UPDATE ไม่อาศัย affectedRows ของ MariaDB upsert จึงไม่สับสนกับ CLIENT_FOUND_ROWS; การคำนวณ Attendance เดิมใช้ VALUES() upsert และผ่านการทดสอบจริงกับ roster สังเคราะห์
- `totalNew`, `total_new`, `newCount` เป็นยอดเพิ่มจริง; `duplicates`/`duplicateCount` เป็นยอดข้ามเพราะ unique key ตามรูป API เดิม; `totalUpdated` คือจำนวนแถวเดิมที่ประมวลผล OVERWRITE สำเร็จรวมกรณีค่าคงเดิม
- `unmapped`/`unmappedCount` เป็นจำนวนแถวที่เพิ่ม/overwrite รอบนี้แล้วยังรอจับคู่ ไม่รวม duplicate ที่ข้าม; `pendingMappingCount` เป็นจำนวนแถวรอจับคู่ทั้งหมดใน DB ณ transaction นั้น จึงไม่เพิ่มซ้ำเมื่อ Sync เดิมอีกครั้ง
- แถวรอจับคู่เก็บ `person_id=NULL`, `hr_mapped=0`, `push_status=PENDING`; หน้า Raw Scan เดิมอ่าน hrMapped=false ได้ โดยไม่ต้องเพิ่มสถานะปลอมใน push_status
- `rawSaveSuccess=true`, `rawSaveStatus=COMMITTED` ยืนยัน raw transaction สำเร็จ แม้ `success=false`/HTTP 502 เพราะคำนวณล้มเหลว; `calculationSuccess`/`calculationStatus`/`failedDates` แยกผลคำนวณไว้ ผู้ใช้เห็นจำนวนที่บันทึกแล้วและข้อผิดพลาด
- เมื่อบุคลากรยังว่าง ไม่สร้าง Attendance จำลอง: `calculationStatus=WAITING_FOR_MAPPING`, raw ยังสำเร็จ หลังมีบุคลากร/Mapping ให้ใช้ explicit recalculation ตามวันที่ต้องการ เพราะ SKIP_DUPLICATES ไม่คำนวณข้อมูลที่ไม่มีการเปลี่ยนแปลง
- OVERWRITE ที่ไม่มี master บุคลากรตรงกันจะรักษา HR snapshot เดิม หากแถวนั้นเคยจับคู่แล้ว เพื่อไม่ลบ mapping เดิมโดยไม่ตั้งใจ
- `SAM_ATT_ENABLE_HOSOFFICE_PUSH` ไม่ตั้ง/ไม่เท่ากับ true ทำให้ทั้ง Push batch และ test-push คืน 403 ก่อนเปิด connection HOSOffice อย่าเปิด flag นี้ระหว่างทดสอบ

## แยกการทดสอบอย่างชัดเจน

1. **Unit/protocol/frontend:** `npm run test:scanner`, `npm run test:scanner:frontend` ไม่เชื่อมต่อ DB/เครื่องจริง
2. **Isolated MariaDB:** `npm run test:scanner:mariadb:isolated` ใช้ named pipe ของ instance ที่สร้างแยกไว้เท่านั้น ตรวจ version, skip_networking, exact datadir และรายชื่อ schemaก่อนเขียน ต้องเริ่มด้วย samchuk_attendance ที่ไม่มีตาราง สร้าง/แก้/ลบเฉพาะตาราง fixture; ห้ามชี้ไป shared hospital instance
3. **Shared-server read-only:** `npm run test:scanner:mariadb:readonly` มีแต่ SELECT ตรวจ metadata/จำนวน duplicate/จำนวนรอจับคู่ ไม่มี CREATE/DROP DATABASE, DDL, DML, Push หรือการเรียก scanner

คำสั่งเก่า `npm run test:scanner:mysql` เปลี่ยนเป็น alias ของ **read-only** แล้ว Legacy file `scanner-mysql.integration.test.cjs` ที่มี CREATE/DROP DATABASE ไม่ใช่ชุดยอมรับบน FILESERVER: เพิ่ม explicit disposable-server confirmation และยังคงห้ามรันกับ shared MariaDB รวมถึงผ่าน tunnel ชุด isolated ใหม่ไม่มี CREATE/DROP DATABASE; การสร้าง instance/schema fixture ทำเฉพาะเครื่องพัฒนาแยก

## 1. อ่าน schema บน 10.1.0.201 โดยไม่แก้ข้อมูล

เปิด PowerShell ใน checkout ของ branchพัฒนา **อย่ารัน backend/server.cjs โดยตรงบน FILESERVER** เพราะ Central Gateway เป็นผู้จัดการ listener 3002 อยู่แล้ว อย่า import backend เพื่อทดสอบ เพราะอาจอ่าน config ของระบบจริง ให้ใช้ CLI แยกนี้ซึ่งไม่โหลด .env/appsettings

```powershell
Set-Location 'D:\Dev\Sam_Att'
$env:SAM_ATT_DB_HOST = '10.1.0.201'
$env:SAM_ATT_DB_PORT = '3306'
$env:SAM_ATT_DB_USER = Read-Host 'บัญชีอ่านได้เฉพาะ samchuk_attendance'
$taskSecret = Read-Host 'รหัสผ่าน' -AsSecureString
$taskPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
try { $env:SAM_ATT_DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPtr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPtr) }
try {
    npm run scanner:db:inspect
    if ($LASTEXITCODE -ne 0) { throw 'Schema inspection failed' }
    $env:SAM_ATT_MARIADB_ACCEPTANCE = 'READ_ONLY_SAMCHUK_ATTENDANCE'
    npm run test:scanner:mariadb:readonly
    if ($LASTEXITCODE -ne 0) { throw 'Read-only acceptance not ready; review the JSON report' }
} finally {
    Remove-Item Env:SAM_ATT_DB_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:SAM_ATT_MARIADB_ACCEPTANCE -ErrorAction SilentlyContinue
    Remove-Variable taskSecret -ErrorAction SilentlyContinue
}
```

ใช้ SELECT-only account สำหรับขั้นนี้จริง CLIไม่พิมพ์รหัสผ่าน ไม่แสดง fingle_id/บุคลากรรายคน รายงาน `missingTables`, `missingColumns`, InnoDB, critical key/time shape, `rawUniqueKeys`, `dailyUniqueKeys`, `redundantRawUniqueKeys`, duplicate group counts และ pending mapping counts ตารางที่ตรวจมีเพียงเก้าตารางของ scanner/calculation ใน samchuk_attendance; information_schema ถูกอ่านแบบกรอง schema/table เฉพาะเท่านั้น

## 2. Migration ที่อนุญาตเฉพาะ samchuk_attendance

Migrationเป็นคำสั่งผู้ดูแลแยกจาก request Sync; endpoints Scanner Sync ตรวจ schema แบบอ่านอย่างเดียวและไม่เรียก legacy bootstrap ไม่เดาบัญชี/สร้างฐาน/ALTER DATABASE หรือแปลง charset ทั้งฐาน

Migration ทำได้เฉพาะเมื่อ connectionเลือก samchuk_attendance และ versionเป็น MariaDB 10.11; สร้างเฉพาะตารางที่ขาด, เพิ่มคอลัมน์ nullable/default ที่ขาด และเพิ่ม unique ที่จำเป็นเมื่อไม่มี equivalent key อยู่แล้ว ไม่ทำ seed บุคลากร ไม่ลบ/merge แถว และไม่ drop index อัตโนมัติ ใช้ advisory lock สำหรับ migration, ตรวจ InnoDB/type/nullability/conflicting groups ก่อน DDL ที่เกี่ยวข้อง

**DDL มี implicit commit** จึงไม่อ้างว่า migration rollback ทั้งชุดได้ หากคำสั่ง DDL ใดล้มเหลวให้หยุดตรวจรายงานแล้วรันซ้ำได้หลังแก้สาเหตุ ห้ามปล่อย writer/Sync แข่งกับงานตรวจ/สร้าง unique key เลือกช่วงทดสอบ Sam_Att ที่ยังไม่เปิดใช้งานตามที่เจ้าของอนุญาต ไม่ต้อง restart Central Gateway/IIS

```powershell
# ใช้ checkout และ SAM_ATT_DB_HOST/PORT เดิม แต่เปลี่ยนเป็นบัญชีที่มีสิทธิ์
# CREATE/ALTER/INDEX/SELECT เฉพาะ samchuk_attendance.* เท่านั้น
$env:SAM_ATT_DB_USER = Read-Host 'บัญชี migration เฉพาะ samchuk_attendance'
$taskSecret = Read-Host 'รหัสผ่าน migration' -AsSecureString
$taskPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
try { $env:SAM_ATT_DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPtr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPtr) }
try {
    $env:SAM_ATT_MIGRATION_CONFIRM = 'APPLY_SAMCHUK_ATTENDANCE_ONLY'
    npm run scanner:db:migrate
    if ($LASTEXITCODE -ne 0) { throw 'Migration stopped; inspect before retrying' }
    npm run scanner:db:inspect
    if ($LASTEXITCODE -ne 0) { throw 'Post-migration inspection failed' }
} finally {
    Remove-Item Env:SAM_ATT_DB_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:SAM_ATT_MIGRATION_CONFIRM -ErrorAction SilentlyContinue
    Remove-Variable taskSecret -ErrorAction SilentlyContinue
}
```

หากฐาน samchuk_attendance ยังไม่มี ให้ผู้ดูแลสร้างเฉพาะฐานนี้ด้วยบัญชีที่ได้รับอนุญาตก่อน CLI ไม่ทำ CREATE DATABASE และไม่ใช้บัญชี root ของ shared server ไม่รัน SQL migration artifactตรงโดยข้าม guard

### Unique Key ซ้ำและข้อมูลชนกัน — ไม่ทำให้ข้อมูลสูญหาย

- หากมี uq_scan/uq_fingle_scan/ชื่ออื่นแต่เป็น full unique ของคอลัมน์คู่เดียวกัน ถือว่ามี constraintแล้ว ไม่เพิ่มซ้ำเพราะชื่อแตกต่าง ตรวจ column signature และไม่มี prefix
- หากมีหลาย equivalent unique indexes ให้คงไว้ก่อน ข้อมูลยังถูกบังคับ uniqueเหมือนเดิม การถอด redundant indexเป็นงาน reviewเฉพาะชื่อ/foreign-key usage ไม่อยู่ใน automatic migration; ตรวจประสิทธิภาพ/SHOW CREATE TABLE ก่อนเสนอ ALTER DROP INDEX ภายหลัง ไม่จำเป็นต้องลบเพื่อให้ Sync ใช้ได้
- หากมีหลายแถวของ `(fingle_id,scan_date_time)` จริง migrationจะหยุดและรักษาทุกแถว ไม่มี DELETE, REPLACE หรือ ALTER IGNORE
- แนวทางถัดไป: ให้เจ้าของตรวจ conflict พร้อม id, machine, source, Push audit และแหล่งอ้างอิงในฐาน samchuk_attendance; ถ้าจะรวมต้องออก migrationแยกที่เก็บ payloadเดิมทุกแถวในตาราง archive ภายใน samchuk_attendance พร้อม map idเก่า→idที่ใช้งานและตรวจ source_scan_ids/matched_scan references ก่อนแก้แถว active ห้ามเลือก MIN(id) แล้วลบเอง หรือรวม PUSHED/PENDING โดยเดา รอบนี้ยังไม่ทำ data reconciliation ดังกล่าว
- ถ้า type/nullability/engine เก่าต่างจากที่คาด จะหยุดแทนแปลงข้อมูลอัตโนมัติ

## 3. Build และเตรียม release บน FILESERVER โดยไม่แตะ live

เครื่องต้องมี Node ที่ตรง engines ของ dependency lock และ npm/git ใช้ checkoutพัฒนาที่แยกจากโฟลเดอร์ระบบจริง คำสั่งนี้สร้าง build และ **เตรียม artifactใหม่ใน stagingเท่านั้น** ไม่คัดลอกทับ live และไม่เปิดพอร์ต

```powershell
Set-Location 'D:\Dev\Sam_Att'
git status --short
if (git status --porcelain) { throw 'มีไฟล์แก้ค้าง: ให้ใช้ checkout แยก' }
git switch develop/scanner-three-stage-contract
git fetch origin develop/scanner-three-stage-contract
git merge --ff-only origin/develop/scanner-three-stage-contract
if ($LASTEXITCODE -ne 0) { throw 'Branch ไม่สามารถ fast-forward ได้ ห้าม reset/clean' }
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency install failed' }
node --check backend/server.cjs
npm run test:scanner
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed' }
npm run test:scanner:frontend
if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'TypeScript failed' }
$env:VITE_BASE_PATH = '/Sam_Att/'
# หาก staging proxy มี prefixอื่น ให้ตั้งค่าตาม mappingที่ผู้ดูแลเตรียมไว้โดยใช้ HTTPSเดิม
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
powershell.exe -NoProfile -File .\scripts\prepare-scanner-staging.ps1 `
    -RepositoryPath 'D:\Dev\Sam_Att' -StagingRoot 'D:\Sam_Att_Staging'
```

สคริปต์ปฏิเสธ live web root/reparse-point, checkoutที่ยังมีแก้ค้าง และโฟลเดอร์ releaseที่มีอยู่แล้ว สร้าง frontend/backend payload + manifest SHA256 ไม่รวม EXE/DLL/ScannerSyncCli archive/config/credentials/node_modules และไม่แก้ IIS bindings/Gateway routing/service บนโฟลเดอร์ releaseใหม่ให้ผู้ดูแลรัน `npm ci --omit=dev` เพื่อติดตั้ง runtime dependencies เฉพาะ releaseนั้นก่อนให้ staging gateway load module อย่า copyทับ FILESERVER liveเพื่อให้ module reload

## 4. เปิดทดสอบและแนวทาง deploy ภายหลังอนุญาต

ต้องมี staging/twin FILESERVER ที่ผู้ดูแลจัดเตรียมอยู่แล้ว ใช้ HTTPS 3001 กับ Gateway3002 ของสภาพแวดล้อมนั้น ไม่เปิด dev server หรือ listener เพิ่ม ไม่มีคำสั่ง restart/activation ของ Productionในเอกสารนี้

Staging Gatewayควรฉีด poolเฉพาะ Sam_Att ผ่าน `createSamAttRouter({dbPool, config:{allowSchemaMigration:false,allowMigration:false}})` โดย poolระบุ host10.1.0.201/schema samchuk_attendance/dateStrings:true และบัญชีสิทธิ์เฉพาะฐานนี้ **อย่าเปลี่ยนตัวแปร DB_HOST/DB_NAME หรือ poolส่วนกลางของ Gateway** เพราะอาจกระทบ Procurement/Cash_Cheque ตั้ง `ALLOW_SCHEMA_MIGRATION=false`, `AUTO_MIGRATE_ON_STARTUP=false` ในสภาพแวดล้อมทดสอบที่แยก และอย่าตั้ง `SAM_ATT_ENABLE_HOSOFFICE_PUSH=true` ใช้ SCAN_READER_EXE ชี้ไฟล์ที่ผู้ดูแลยืนยัน hashเดิม ไม่คัดลอก EXE จาก artifact

หาก Central Gateway ปัจจุบันไม่มีวิธี load staging moduleแยกโดยไม่ restart ให้ถือว่าการ activationเป็น blockerที่ต้องวางแผนกับผู้ดูแล ห้าม restart Gateway/IIS Production หรือแก้ routerของระบบอื่นเพื่อข้ามข้อจำกัด

หลังผู้ดูแลเปิด stagingที่ได้รับอนุญาตแล้ว ให้ทดสอบ:

1. ดู read-only schema acceptanceและmanifest ให้ตรง commit
2. เปิดหน้าเว็บแล้วไม่มี Scanner Sync POSTอัตโนมัติ; Pushทั้งสอง endpointได้403
3. Previewสามเครื่อง/เลือก[1,3] และDATE/MONTH/YEAR/RANGE ไม่เปลี่ยน raw/log/daily
4. Syncจริงครั้งแรก raw/countถูกต้อง, ครั้งที่สอง new0/duplicateถูกต้อง, pendingMappingCountไม่เพิ่มซ้ำ
5. บุคลากร/Mappingว่าง: Rawครบ,รอจับคู่,ไม่สร้าง Attendanceปลอม; หลังใส่ข้อมูลบุคลากรในฐานนี้ให้ explicit recalculateวันที่ที่เก็บแล้ว
6. ตรวจ realEXE JSON/date retention/SDK/timezone จากหลักฐานเดิมและข้อมูลทดสอบที่ได้รับอนุญาต; ถ้าช่วงเก่ายังไม่ยืนยันห้ามอ้างว่าครบ
7. จำลองข้อผิดพลาดเฉพาะ staging: บันทึกล้มเหลว rollback; คำนวณล้มเหลว rawSaveSuccessยังtrueแต่HTTP502/failedDatesและUIแสดงเหตุผล
8. ตรวจ RawScan refresh/cache, PushauditหลังOVERWRITE, IIS/gateway timeoutที่รองรับหลายเครื่องต่อกัน และยืนยันระบบอื่นยังใช้ routingเดิม

การ Deploy Production/activate liveยังไม่ได้อนุญาตในงานนี้และยังไม่ได้ทำ ต้องมีผล FILESERVER/IIS/real-reader acceptanceก่อน และแผนโหลด moduleเฉพาะSam_Attที่ไม่ restart/กระทบบริการอื่นตามข้อจำกัด ห้าม Merge main ระหว่างการทดสอบ

## ข้อจำกัด reader ที่ยังเหลือ

Backendส่ง --days กับ --machineเดี่ยวต่อ invocation แล้วกรองวันที่/เครื่องซ้ำ ยังไม่ส่ง/ไม่ยืนยัน --date-from/--date-to; payload>25MiBล้มเหลวชัดเจน ไม่ importบางส่วน, timeout180วินาทีต่อเครื่อง หลายเครื่องรวมอาจนานกว่านั้น workCode:nullยอมรับ ไม่เพิ่ม schemaเพื่อเก็บ workCodeที่ไม่ใช่null และไม่ตีความ verifyMode/inOutModeโดยไม่มีSDKหลักฐาน ไม่มีการแก้EXEในรอบนี้

## แหล่งอ้างอิง MariaDB

- [INSERT ON DUPLICATE KEY UPDATE และ CLIENT_FOUND_ROWS](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/inserting-loading-data/insert-on-duplicate-key-update)
- [ALTER TABLE และ Unique index](https://mariadb.com/docs/server/reference/sql-statements/data-definition/alter/alter-table)
- [คำสั่งที่ทำ implicit commit](https://mariadb.com/docs/server/reference/sql-statements/transactions/sql-statements-that-cause-an-implicit-commit)
- [Official portable 10.11.10 archive/checksums](https://archive.mariadb.org/mariadb-10.11.10/winx64-packages/)
