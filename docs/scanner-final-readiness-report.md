> อัปเดต 4 พ.ย. 2569: ผล MariaDB 10.11.10 แบบแยกและข้อเท็จจริง FILESERVER/DB host ล่าสุดอยู่ใน [รายงาน MariaDB](scanner-mariadb-readiness-report.md) และ [คู่มือ FILESERVER](scanner-mariadb-fileserver.md) ข้อความ MySQL unavailable/10.2.0.201 ด้านล่างเป็นประวัติรอบก่อน ไม่ใช่ผลล่าสุด ห้ามใช้ legacy CREATE/DROP suite บน shared hospital server

# รายงานความพร้อมขั้นสุดท้าย — Sam_Att Scanner Integration

จัดทำวันที่ 3 พฤศจิกายน 2569 (Asia/Bangkok) สำหรับตรวจเช้าวันถัดไป

## 1. Commit ล่าสุด

- Commit โค้ดและ Tests ล่าสุดที่ผ่านการตรวจ: `b4ff72432b0b36cf924ba6b3895a537bcd1d044a`
- ทำต่อจาก `b95bb716b258c54ec54efc694ce011b15e079efa` ซึ่งอยู่ถัดจากฐานที่ผู้ใช้ยืนยัน `d93f5d94b9693412b7700a52b4c02656c66e6663` โดยไม่ได้ย้อนทับงานเดิม
- Branch: `develop/scanner-three-stage-contract`
- [Commit โค้ดล่าสุด](https://github.com/jk9krnvb6g-ai/Samchuk-Hospital-Attendance-Overview-/commit/b4ff72432b0b36cf924ba6b3895a537bcd1d044a)
- [Draft PR #1](https://github.com/jk9krnvb6g-ai/Samchuk-Hospital-Attendance-Overview-/pull/1)

รายงานฉบับนี้เพิ่มด้วย commit เอกสารถัดจาก commit โค้ดข้างต้น เพื่อไม่ฝัง SHA ของตัวเองลงในเนื้อหา ตรวจ SHA ส่งมอบล่าสุดได้ด้วยคำสั่งอ่านอย่างเดียว `git log -1 --format=%H` บน branch นี้ หรือดู commit ล่าสุดใน PR

## 2. ไฟล์ที่แก้ไขทั้งหมด

ขอบเขตรวมตั้งแต่ฐาน `d93f5d94` จนถึงรายงานฉบับนี้ (ไม่รวมไฟล์ scratch, node_modules และ dist ที่ไม่ commit):

1. `backend/server.cjs`
2. `backend/scanner-sync.test.cjs`
3. `backend/tests/scanner-mysql.integration.test.cjs`
4. `backend/tests/scanner-reader-contract.test.cjs`
5. `src/services/attendanceStore.ts`
6. `src/components/CustomSyncModal.tsx`
7. `src/pages/ScannersPage.tsx`
8. `src/pages/RawScansPage.tsx`
9. `src/tests/scanner-sync.test.ts`
10. `package.json` — เพิ่มคำสั่ง tests โดยไม่เปลี่ยน dependency versions
11. `scripts/scanner-readonly-check.ps1`
12. `docs/scanner-three-stage-contract.md`
13. `docs/scanner-integration-testing.md`
14. `docs/scanner-final-readiness-report.md`

ไม่แก้ Procurement, Cash_Cheque, Central API Gateway, EXE หรือไฟล์ตั้งค่า Production

## 3. สิ่งที่พัฒนาเสร็จแล้ว

- Backend รับ JSON scans[] และบันทึก attendance_raw_scan โดยตรง ไม่พัก/ลบข้อมูล HOSOffice และไม่ Push อัตโนมัติ
- จับคู่ enrollNumber ด้วย fingle_id เท่านั้น; ข้อมูลที่จับคู่ไม่ได้ยังคงบันทึก person_id=null, hr_mapped=0 และ PENDING
- ตรวจเทียบชื่อคอลัมน์และ Unique Key กับ DDL ใน repository รวมการสะกดเดิม hr_leavel_name และ source; ยังไม่ได้ตรวจเทียบฐาน Production จริงและไม่ได้เชื่อมต่อไปตรวจ
- Transaction ครอบคลุม Raw Scan ทั้งชุด; เกิดข้อผิดพลาดจะ rollback; duplicate ใช้ข้อผิดพลาดจาก unique fingerprint/time จริง; OVERWRITE รักษา Push status/audit
- ยอดเพิ่ม/ซ้ำ/อัปเดตมาจากผล DB; updated หมายถึงรายการเดิมที่ประมวลผล OVERWRITE สำเร็จ รวมกรณีค่าคงเดิม
- Preview ไม่เขียน raw/log ไม่เรียก migration หรือคำนวณ; หน้าจอแสดง candidate total โดยไม่อ้างว่าศูนย์คือไม่มีข้อมูลใหม่
- เลือกหลายเครื่องโดยเรียก reader แยกเครื่องและกรองซ้ำก่อนบันทึก; หากเครื่องถัดไปล้มเหลว จะไม่บันทึกข้อมูลบางส่วนจากเครื่องก่อนหน้า
- คำนวณหลัง commit และเฉพาะวันที่ insert/overwrite; ผล false/exception ส่ง failure; สำเร็จบางวันแสดง PARTIAL พร้อมจำนวน Raw Scan ที่ commit จริง
- ปุ่ม Sync รายเครื่องแสดง error และกันการกดซ้ำ; refresh หลัง Scanner Sync ไม่คำนวณ/บันทึก Attendance ซ้ำจาก frontend
- Raw Scan refresh ข้าม cache, รักษาข้อมูลเดิมเมื่อ GET ล้มเหลวและแสดงคำเตือน; GET ส่งเวลา DATETIME เป็นข้อความท้องถิ่นและส่ง 503 เมื่อ DB ใช้งานไม่ได้
- รอบสุดท้ายแก้ Custom date validation: DATE/MONTH/YEAR/RANGE ผิดรูปแบบหรือวันที่ไม่มีจริงจะถูกปฏิเสธก่อนเรียก reader ไม่ normalize เป็นวันอื่นหรือ fallback เป็นวันนี้
- เปิดเว็บจำลองแล้วโหลดเฉพาะข้อมูล ไม่มีการขอ Scanner Sync อัตโนมัติ

## 4. ผล Automated Tests

| รายการที่รันจริง | ผล |
|---|---|
| `node --check backend/server.cjs` | ผ่าน |
| `npm run test:scanner` | ผ่าน 39/39: helper/route 32 + reader/GET/guard 7 |
| `npm run test:scanner:frontend` | ผ่าน 10/10 |
| `npm run lint` | ผ่าน TypeScript check |
| PowerShell parser และรัน read-only script ใน development checkout | ผ่าน |
| `git diff --check` | ผ่าน |

รวม **49 tests ผ่านจริง** ไม่รวม MySQL ที่ skip

Coverage เพิ่มเติมรอบนี้: shared mutex ทั้งสองเส้นทางคืน 409 ขณะ reader ยังไม่จบ, aggregate success แต่ machine failure ไม่บันทึก, selected-machine failure ไม่เกิด partial raw save, PARTIAL calculation กับยอดที่ commit แล้ว, leap-year/date boundaries, malformed dates, process exit 7, child timeout และ startup ที่ไม่มี scanner-sync request

Reader transport tests ใช้ Node child process จริง ไม่ใช่การเรียก ScannerSyncCli.exe ส่วน endpoint tests ใช้ DB/reader/calculation doubles จึงไม่ใช่หลักฐานว่า SQL หรือ Attendance algorithm ผ่านกับ MySQL จริง การทดสอบ frontend ใช้ API/store จริงกับ fetch doubles และ browser-like globals ไม่ใช่ Browser/IIS E2E

ตรวจเฉพาะ diff ที่เพิ่ม: ไม่พบ private-key/token/password literal ตาม pattern และตรวจ fixtures ว่าใช้ข้อมูลสังเคราะห์ ไม่มีชื่อบุคลากรจริงหรือรหัสผ่านถูกเพิ่มใน commit การตรวจนี้ไม่ได้อ้างว่า audit repository ทั้งหมดแล้ว

## 5. ผล MySQL Integration Tests

**ยังไม่ได้รันกับ MySQL จริง — BLOCKER สำหรับยืนยัน Database Integration**

เครื่อง development นี้ไม่มี MySQL/MariaDB/Docker test instance จึงไม่มีชื่อฐานข้อมูลที่ใช้ทดสอบจริง และไม่ได้เชื่อมต่อ Production แทน คำสั่ง `npm run test:scanner:mysql` แสดง suite SKIP ไม่ใช่ผ่าน 10 กรณี

เตรียม 10 กรณีครบใน `backend/tests/scanner-mysql.integration.test.cjs`: insert, duplicate ข้ามเครื่อง, OVERWRITE พร้อม Push audit, real SQL SIGNAL rollback กลางชุด, preview, HR mapping, unmapped retention, local time/null workCode, DB count consistency และ calculate-after-commit ของสอง endpoints

Suite ต้องเปิดใช้โดยเจตนา, ยอมรับเฉพาะ numeric loopback, test port ที่ไม่ใช่ 3306 และบัญชี sam_att_test_runner; สร้าง/ลบเฉพาะฐานสุ่ม `sam_att_scanner_test_<16 hex>`; ไม่อ่าน .env/appsettings หรือ database URL ของระบบจริง Tests ของ guard ผ่านจริงว่าปฏิเสธ remote host/3306 ก่อนเชื่อมต่อ แต่ไม่ทดแทน MySQL integration

ดู [คู่มือและคำสั่งรัน](scanner-integration-testing.md) ผู้ดูแลต้องเตรียม MySQL แยกที่ไม่มีข้อมูลโรงพยาบาลก่อน กรณีทดสอบลำดับคำนวณใช้ callback ที่ตรวจเห็นข้อมูลจาก connection แยก ยังต้องตรวจ Attendance algorithm เต็มด้วยข้อมูล staging

## 6. ผล Frontend Build

`npm ci` จาก lockfile เดิมสำเร็จ แล้ว `npm run build` ผ่านจริงด้วย Vite 8.3.5 จำนวน 1,684 modules; `npm run lint` ผ่าน

มี warning ว่า bundle บางส่วนเกิน 500 kB ซึ่งไม่ทำให้ build ล้มเหลว ไม่ได้เพิ่ม HTTP listener หรือ deploy dist ที่สร้างขึ้น npm ถูก bootstrap ใน scratch สำหรับงานนี้ ไม่ได้ติดตั้งทับ runtime ระบบโรงพยาบาล

## 7. ผลตรวจ Scanner JSON Contract

- required scan fields: machineNo, enrollNumber, scanDateTime, verifyMode, inOutMode, workCode
- ปฏิเสธ scans[] หาย/ผิดรูปแบบ, วันเวลาไม่ถูกต้อง, ID/mode เกินชนิด INT และเครื่องที่รายงาน failure โดยไม่บันทึก partial raw data
- เวลารูป YYYY-MM-DD HH:mm:ss รักษา wall-clock; ค่า 268435456/1073741824 และ inOutMode=1 คงเดิม ไม่ตีความเป็นวิธียืนยัน/เข้าออกโดยเดา
- workCode=null ใช้ได้ ไม่ต้องเปลี่ยน schema; ไม่มีคอลัมน์สำหรับเก็บ workCode ที่ไม่ใช่ null
- stdout JSON แบบ compact/pretty ผ่าน รวม 20,000 scans จาก child process จริง
- stdout เกิน 25 MiB คืน maxBuffer error ไม่มี scans บางส่วน; process exit ไม่เป็นศูนย์แม้ส่ง success JSON และ timeout คืน failure
- Timeout ที่ Backend ตั้งไว้ยังเป็น 180,000 ms ต่อ reader invocation; test timeout ใช้ child fixture พร้อมเวลาทดสอบสั้น ไม่รอ 3 นาทีและไม่เรียก hardware
- ผล hardware เดิมที่ผู้ใช้ให้: 3 เครื่อง อ่าน 9,917 / ในช่วงวันที่ 746 เป็นข้อมูลอ้างอิงเดิม ไม่ใช่ผลที่รันทดสอบใหม่รอบนี้

## 8. ข้อจำกัดของ EXE

ยังไม่ยืนยัน argument/retention ของ binary ที่ใช้งานจริง ไม่ได้เรียก EXE เพื่อ --help หรืออ่านเครื่อง และไม่ได้เปลี่ยน/แทนที่ EXE

Backend ส่ง --days และหนึ่ง --machine ต่อครั้ง ไม่ส่ง --date-from/--date-to การกรองวันอย่างถูกต้องหลังอ่านไม่ได้รับประกันว่า EXE คืนข้อมูลย้อนหลังครบทุกวัน จึงห้ามอ้างว่าช่วงวันที่รองรับสมบูรณ์

หากต้องรองรับช่วงเก่าหรือ payload ใหญ่กว่านี้ ต้องได้เอกสาร/source ของ reader รุ่นที่ตรงกันก่อน แล้วทำข้อเสนอ argument/streaming protocol และ patch แยกสำหรับ test build ไม่แก้ EXE Production แบบคาดเดา รอบนี้ยังไม่จำเป็นต้องสร้าง patch EXE และไม่มีหลักฐานเพียงพอให้เปลี่ยน binary อย่างปลอดภัย

## 9. ความเสี่ยงที่ยังเหลือ

- ยังไม่มีหลักฐาน SQL/locking/strict SQL mode กับ MySQL instance จริง ต้องตรวจคอลัมน์ source และ unique key บนฐาน staging ที่ใช้จริงโดยไม่ migrate Production
- ยังไม่ได้ทดสอบ Browser/IIS/Windows Server E2E และ Attendance algorithm เต็ม
- Raw Scan commit แล้วแต่ Attendance ล้มเหลวได้: failure/PARTIAL ต้องไม่ตีความว่า raw rollback; retry failedDates ด้วย explicit recalculation เพราะ SKIP_DUPLICATES ไม่คำนวณวันที่ไม่มีรายการเปลี่ยน
- ระหว่าง Attendance calculation อาจบันทึกผลบางส่วนก่อน error จึงต้องตรวจ/คำนวณวันที่ล้มเหลวใหม่ใน staging
- Mutex อยู่ใน process เดียว ไม่รับรองการกันงานซ้ำระหว่างหลาย worker; unique key ยังคงเป็นข้อบังคับ DB ต้องยืนยันว่า staging/production topology ใช้งานตามที่ทดสอบ
- EXE/save failure ยังไม่สร้าง failure row ใน scanner_sync_log แม้ API ส่ง failure; ไม่ควรใช้ log เก่าอ้างว่า sync ล่าสุดสำเร็จ
- 25 MiB/180 วินาทีเป็นขีดจำกัดต่อ invocation; หลายเครื่องทำงานต่อกันอาจต้องใช้เวลารวมมากกว่า 3 นาที ต้องตรวจ timeout ของ IIS/gateway ใน staging โดยไม่แก้ค่าระบบจริงรอบนี้

## 10. รายการที่ต้องทดสอบบน Windows Server

เริ่มด้วยคำสั่งอ่านอย่างเดียวนี้จาก checkout ที่เลือก:

```powershell
powershell.exe -NoProfile -File .\scripts\scanner-readonly-check.ps1 `
  -RepositoryPath 'C:\Path\To\Sam_Att-Staging' `
  -ReaderPath 'C:\Path\To\ReadOnlyCopy\ScannerSyncCli.exe'
```

Script อ่าน branch/commit/status ชื่อไฟล์, tool availability, listener เดิม 3001/3002 และ metadata/hash ของ EXE เท่านั้น ไม่รัน EXE/backend/npm, ไม่ส่ง HTTP/SQL, ไม่อ่าน credentials/บุคลากร และไม่ start/restart services

งานที่เปลี่ยนข้อมูลต่อไปนี้ทำได้เฉพาะ **staging/test database แยก** หลังตั้งค่าระบบทดสอบแล้ว ไม่ใช่ส่วนของ read-only script:

1. รัน MySQL 10 กรณีตาม runbook และตรวจตาราง/unique key จริงของ staging
2. ทดสอบปุ่ม Sync รายเครื่อง/ทุกเครื่อง, Custom DATE/MONTH/YEAR/RANGE, เลือก [1,3] และ preview
3. เปิดเว็บ/เปลี่ยนเมนูแล้วต้องไม่มี scanner-sync POST; preview ไม่เปลี่ยน raw/log/daily
4. ตรวจ Raw Scan refresh/cache, เวลาไทย, unmapped, new/duplicate/update counts และ Push audit หลัง OVERWRITE
5. จำลอง reader บางเครื่อง failure, JSON ไม่ครบ, timeout, DB failure และ calculation PARTIAL; ตรวจ error UI กับจำนวนที่ commit จริง
6. ตรวจ Attendance algorithm และ explicit recalculation ของ failedDates ด้วยข้อมูลจำลอง
7. ตรวจ HTTPS /Sam_Att/ ที่ frontend 3001 ไป /api/Sam_Att/ backend 3002, request timeout สำหรับหลายเครื่อง และยืนยัน Procurement/Cash_Cheque ไม่ได้รับผลกระทบ
8. ยืนยัน argument/retention ของ reader รุ่นตรงกันจากเอกสารก่อนวางแผน hardware acceptance ที่ได้รับอนุญาตแยก

## 11. ขั้นตอนก่อน Deploy Production

ต้องมีหลักฐาน MySQL integration ผ่าน, Browser/IIS และ Attendance staging acceptance ผ่าน, schema/unique-key compatibility ยืนยัน, historical-date limitations/timeout ได้ข้อยุติ และมีแผน retry/recovery/rollback ที่ตรวจแล้ว จากนั้นให้ผู้ดูแลอนุมัติ deployment เป็นงานแยก

รอบนี้ไม่มีการเชื่อมต่อหรือแก้ฐาน Production, ไม่มี deploy/restart, ไม่เพิ่ม HTTP port, ไม่แก้ EXE หรือ schema Production และไม่ merge main

## 12. สถานะสุดท้าย

**READY FOR STAGING** — โค้ด, 49 automated tests, build และคู่มือพร้อมนำไปทดสอบในสภาพแวดล้อมแยก

**ยัง BLOCKED สำหรับ Production readiness** ด้วยการขาดผล MySQL integration จริง, Windows Server/Browser/IIS E2E, Attendance algorithm acceptance และหลักฐาน EXE date coverage ไม่ได้ถือว่ารายการเหล่านี้ผ่านแล้ว และไม่มีการใช้ Production ทดแทน
