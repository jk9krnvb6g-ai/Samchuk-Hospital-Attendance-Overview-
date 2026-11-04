# รายงาน Sam_Att — MariaDB 10.11.10 / FILESERVER

วันที่ 4 พฤศจิกายน 2569 (Asia/Bangkok)

## ฐานงานและขอบเขต

ทำต่อจาก `ecf402e9b9bdaffa50431d0ff8af9460280b2979` บน `develop/scanner-three-stage-contract` โดยรักษาระบบ Scanner Integration เดิม ไม่เริ่มเขียนใหม่ Commitส่งมอบล่าสุดตรวจได้จาก `git log -1 --format=%H` และ Draft PR #1; SHAระบุในข้อความส่งมอบ/PR เพื่อไม่ฝัง SHAของรายงานตัวเองในเนื้อหา

ใช้ข้อมูลสภาพแวดล้อมที่เจ้าของยืนยัน: FILESERVER, Frontend HTTPS3001, Gateway3002, MariaDB10.11.10 ที่10.1.0.201, ฐาน samchuk_attendance ที่ยังไม่เปิดใช้งานจริง การปรับschema/ข้อมูลได้รับอนุญาตเฉพาะฐานนี้ ไม่กำหนด Backup ของฐานนี้เป็นเงื่อนไขบังคับ

## สิ่งที่แก้ไข

1. เพิ่ม `backend/scanner-storage.cjs`: ตรวจschema, InnoDB,คอลัมน์, critical type/nullability,unique column signatures,จำนวนduplicate/pendingแบบอ่านอย่างเดียว และ migrationที่จำกัด samchuk_attendance
2. เพิ่ม `backend/migrations/scanner-mariadb-10.11.sql`: นิยาม9ตารางแบบ fully qualified ไม่มี CREATE/DROP DATABASE, seed, DELETE หรือ statementที่เขียนฐานอื่น
3. เพิ่ม `backend/scanner-db-admin.cjs`: inspectเป็นค่าเริ่มต้นแบบSELECT-only; --applyต้องยืนยันชื่อฐาน/version/flag,ใช้connectionเดียว/advisorylock,ไม่โหลด.env/appsettings ไม่เดาcredentials
4. Scanner Syncทั้งสองเส้นทางใช้schema inspectionแทนlegacy migration/bootstrapแม้preview จึงไม่มีการสร้างฐาน/ALTER DATABASEผ่านปุ่มSync
5. ยอด totalNew/total_new/newCount และduplicates/duplicateCount/log total_new อ้างอิง DB insert/unique outcomesจริง; added pendingMappingCountวัดในtransaction และไม่ inflateยอดรอจับคู่จากduplicate retry
6. บุคลากร/Mappingว่างยังเก็บRawครบด้วยperson_idNULL/hr_mapped0/PENDING,คำนวณรอWAITING_FOR_MAPPING; overwriteโดยไม่มีmasterไม่ล้างHRsnapshotเดิม
7. แยก rawSaveSuccess/rawSaveStatus จาก calculationSuccess/calculationStatus/failedDates; คำนวณล้มเหลวหลังrawcommitยังส่งHTTP502ตามcontractเดิมพร้อมยืนยันrawสำเร็จ เพื่อให้frontendไม่อ้างว่าข้อมูลหายหรือrollback
8. Frontendแสดงรอจับคู่/รอคำนวณ,ยอดบันทึกและข้อผิดพลาดแยกกัน; previewแสดงunmapped candidates,RawScanลบlabelhost10.2.0.201ที่ไม่ตรงข้อเท็จจริง
9. ปิดทั้งPush batchและtest-pushโดยค่าเริ่มต้นด้วยflagSAM_ATT_ENABLE_HOSOFFICE_PUSH ไม่เปิดflagนี้ระหว่างทดสอบ; testsยืนยันคืน403ก่อนDBaccess
10. แยกisolated MariaDBกับshared-server SELECT-only acceptance; alias test:scanner:mysqlเปลี่ยนเป็นreadonly ไม่ชี้legacyDROP DATABASEsuiteอีก; legacysuiteเพิ่มconfirmationสำหรับempty disposable instance
11. เพิ่มสคริปต์เตรียมstagingartifactแบบdirectoryใหม่,manifestSHA256,ปฏิเสธlivewebroot/reparse/dirtycheckout/overwrite,ไม่รวมEXE/DLL/readerarchive/config/secrets และไม่activate/restartอะไร

## ไฟล์ที่เปลี่ยนในรอบนี้

- backend/server.cjs
- backend/scanner-storage.cjs
- backend/scanner-db-admin.cjs
- backend/migrations/scanner-mariadb-10.11.sql
- backend/scanner-sync.test.cjs
- backend/tests/scanner-reader-contract.test.cjs
- backend/tests/scanner-mysql.integration.test.cjs
- backend/tests/scanner-mariadb.isolated.test.cjs
- backend/tests/scanner-mariadb.readonly.test.cjs
- src/services/attendanceStore.ts
- src/components/CustomSyncModal.tsx
- src/pages/RawScansPage.tsx
- src/tests/scanner-sync.test.ts
- package.json
- scripts/prepare-scanner-staging.ps1
- docs/scanner-mariadb-fileserver.md
- docs/scanner-mariadb-readiness-report.md
- docs/scanner-three-stage-contract.md
- docs/scanner-integration-testing.md
- docs/scanner-final-readiness-report.md

## ผลทดสอบที่รันจริง

| รายการ | ผลและขอบเขต |
|---|---|
| Backend syntax | ผ่าน server.cjs และ module/CLI/testsใหม่ |
| Backend scanner tests | 45/45ผ่าน — sourceจริงกับDB/reader doublesและchildprocess fixtures |
| Frontend API/store tests | 12/12ผ่าน |
| MariaDB10.11.10 isolated integration | **14กรณีผ่านจริง**; Nodeรายงาน15รายการเมื่อรวมparent suite |
| TypeScript lint | ผ่าน |
| Production frontend build | ผ่าน Vite8.3.5/1,684modules; warningbundle>500kBยังมี |
| Shared10.1.0.201 acceptance | **ยังไม่รัน**; default suiteแสดงSKIP ไม่ใช่ผลผ่าน |
| PowerShell staging script | Parserผ่าน;การเตรียมartifactทดสอบเฉพาะworkspaceหลังcommitตามบันทึกส่งมอบ ไม่ใช่deploymentFILESERVER |
| Diff/credential review | ตรวจadded diffและfixtureสังเคราะห์ ไม่เพิ่มรหัสผ่าน/private key/token/ข้อมูลบุคลากรจริง |

### หลักฐาน MariaDBจริง

ดาวน์โหลดofficialportable10.11.10จากMariaDB archiveและตรวจSHA256ตรงไฟล์checksumทางการ ตั้งdatadirภายในwork/mariadb-portable/isolated-dataที่สร้างใหม่ เปิดผ่านnamedpipeที่ตั้งชื่อเฉพาะโดยskip_networking=1,ไม่มีTCP/HTTPlistenerและไม่ติดตั้งWindowsservice ตรวจVERSION()=`10.11.10-MariaDB`,exactdatadir,strictSQLmodeและรายชื่อschemaก่อนทำtests

schemaทดสอบคือsamchuk_attendanceบนinstanceที่แยกนี้เท่านั้น ไม่ใช่samchuk_attendanceที่10.1.0.201 มีsam_att_test_sentinel.guardเก็บfixturemarkerสำหรับยืนยันmigrationไม่เขียนฐานอื่น ไม่มีการเชื่อมต่อhospitalDB/FILESERVER

14กรณีจริง:

1. Migrationสร้างตารางscanner/calculation,รันซ้ำได้,ฐานsentinelไม่เปลี่ยน
2. บุคลากร/Mappingว่าง:Rawจาก3เครื่องครบ,รอจับคู่,log/new/duplicateตรงDBและretryไม่inflatepending
3. Uniqueเดียวกันข้ามเครื่องinsert1/skip2โดยไม่อ้างCLI999
4. OVERWRITEรักษาPushstatus/time/user/batch/errorและdevice/source
5. SQLSIGNALที่แถวสองrollbackแถวแรกจริง
6. Previewทั้งสองhandlerไม่เปลี่ยนraw/log/daily
7. fingle_idmappingถูกต้องและเวลาไทย/verifyMode/inOutMode/workCodeNULLบันทึกได้
8. **Attendance algorithmจริง**กับroster/scanเข้า08:15ออก16:00ได้ON_TIME,upsertซ้ำยังแถวเดียวบนMariaDB
9. SQLerrorขณะคำนวณแยกจากrawcommit:rawSaveSuccesstrue/จำนวนrawครบแต่calculationFAILED
10. พบequivalentuniqueหลายชื่อ/ลำดับคอลัมน์และไม่dropindexอัตโนมัติ
11. ข้อมูลrawซ้ำจริงทำให้migrationหยุดโดยคงทุกแถว
12. เพิ่มsource/optionalcolumnที่ขาดโดยรักษาrawid/Pushaudit
13. ไม่มีmasterบุคลากรหลังเคยmapแล้ว:OVERWRITEไม่ล้างsnapshotเดิม
14. เลือกschemaอื่นแล้วmigrationปฏิเสธก่อนเขียน,markerไม่เปลี่ยน

Testsนี้ใช้helper/handler/calculatorจากsourceจริงและSQLบนengineจริง แต่**readerยังเป็นJSONfixture**และไม่มีBrowser/IIS networkE2E ไม่ใช่ผลจากHIP3เครื่องหรือFILESERVERจริง

## ความเข้ากันได้และMigration

SQLCREATE/ALTER,JSONfield,InnoDBtransaction,SELECTFORUPDATE,SIGNALและVALUES()upsertผ่านกรณีทดสอบข้างต้นบน10.11.10 การนับrawใช้INSERTแยกจากUPDATEจึงไม่ผูกกับaffectedRows/CLIENT_FOUND_ROWSของupsert [เอกสารMariaDB](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/inserting-loading-data/insert-on-duplicate-key-update)

Migrationเพิ่มเฉพาะตาราง/คอลัมน์ที่ปลอดภัยและuniqueที่จำเป็นภายในฐานsamเท่านั้น ไม่ลบdataหรือindex ไม่convertengine/typeโดยเดา หากduplicateจริง,criticalshapeต่าง,nonInnoDBหรือmissingrequiredcolumnที่ต้องแปลงdataจะหยุดให้ตรวจเฉพาะกรณีนั้น DDLมีimplicitcommit ไม่รับประกันrollbackmigrationทั้งชุด;หยุดตรวจและrerunหลังแก้สาเหตุ [เอกสารMariaDBDDL](https://mariadb.com/docs/server/reference/sql-statements/transactions/sql-statements-that-cause-an-implicit-commit)

หากมีuniqueชื่อuq_scanกับuq_fingle_scanที่คอลัมน์เดียวกัน ให้คงไว้ก่อนเพราะไม่ทำข้อมูลสูญหายหรือทำinsertซ้ำ การถอดredundantindexต้องreviewชื่อ/foreignkeysแยก ไม่ต้องลบเพื่อให้Syncทำงาน หากมีแถวซ้ำจริงให้reviewPushaudit/source/referenceและออกmigrationแยกที่archiveทุกpayloadพร้อมidmapก่อนreconcileในsamเท่านั้น ยังไม่ทำDELETEหรือเลือกMIN(id)เพื่อลบทิ้งอัตโนมัติ

## ขั้นตอนที่ผู้ดูแลต้องทำบน FILESERVER

คำสั่งPowerShellครบอยู่ใน [คู่มือMariaDB/FILESERVER](scanner-mariadb-fileserver.md):

1. ใช้checkoutพัฒนาแยก ตรวจcommit/dirtyfiles;ไม่รันnodebackendstandaloneหรือเปลี่ยนGatewaypoolกลาง
2. ใช้SELECT-onlyaccountเฉพาะsamที่10.1.0.201รันscanner:db:inspectและtest:scanner:mariadb:readonly,เก็บผลจริงก่อนกล่าวว่าผ่านบนsharedserver
3. หากต้องmigration ใช้บัญชีCREATE/ALTER/INDEX/SELECTเฉพาะsam,ยืนยันAPPLY_SAMCHUK_ATTENDANCE_ONLYและรันCLIเฉพาะฐานนี้;ไม่ใช้legacytestที่มีDROP DATABASEบนsharedserver
4. Build/TypeScript/testsในcheckoutแยก แล้วprepare-scanner-staging.ps1สร้างversionedartifactใหม่ ติดตั้งruntime depsเฉพาะreleaseใหม่ ไม่คัดลอกทับlive/EXE
5. ให้ผู้ดูแลเตรียมstaging/twinFILESERVERที่ใช้HTTPS3001/Gateway3002เดิม,ฉีดpoolSam_AttเฉพาะschemaและdateStrings:true,ปิดlegacyauto-migrationและPush
6. ทดสอบrealreader3เครื่อง/เลือกหลายเครื่อง/datewindows,preview,Rawrefresh,emptyHR,mappingและexplicitrecalculate,ข้อผิดพลาดทั้งraw/calcและtimeoutผ่านIIS
7. หากไม่มีวิธีloadstagingmoduleโดยไม่restartGatewayProduction ให้ถือว่าactivationblocked ห้ามrestart/แก้routingระบบอื่นเพื่อหลบข้อห้าม

## ข้อจำกัดและงานก่อนProduction

- ยังไม่รู้schema/rowconflicts/privileges/latencyจริงบน10.1.0.201จนผู้ดูแลส่งผลreadonly
- ยังไม่ทดสอบFILESERVER/IIS/BrowserและhardwareJSONจริงรอบนี้
- Readerdatecoverage/retentionและ--date-from/--date-toยังไม่ยืนยัน;ใช้--days/--machineและfilterหลังอ่านไม่เท่ากับยืนยันประวัติครบ
- Buffer25MiB/timeout180วินาทีต่อเครื่องยังคงเดิม หลายเครื่องใช้เวลารวมมากกว่า3นาที ต้องยืนยันproxytimeoutในstaging
- workCode:nullรองรับโดยไม่เปลี่ยนschema;workCodeที่ไม่nullยังไม่มีช่องเก็บ
- Attendanceล้มเหลวหลังrawcommitให้retryfailedDatesexplicitly;SKIP_DUPLICATESไม่คำนวณวันที่ไม่มีแถวเปลี่ยน
- Mutexระดับprocess;uniqueDBป้องกันdataซ้ำแต่หลายworkerอาจได้deadlockที่ต้องretryหลังrollback;ยังไม่รับรองmultiworkeracceptance
- LegacybootstrapนอกScannerSyncยังอยู่เพื่อไม่เขียนระบบอื่นใหม่ ให้ใช้scopedmigrationใหม่และปิดlegacyauto-migrationในstagingตามคู่มือ
- FailureloggingของEXE/saveยังไม่สร้างfailedsync_logrowทุกกรณี;frontendใช้ผลrequestจริงไม่อ้างlogเก่า

## สถานะส่งมอบ

**READY FOR FILESERVER STAGING ACCEPTANCE** — โค้ด/migration/SQL/Attendancefixtureผ่านMariaDB10.11.10จริงแบบแยก มีshared-serverreadonlycheckและคำสั่งผู้ดูแลพร้อม

**ยังไม่พร้อมเปิดProduction** จนมีผลFILESERVER/sharedDB/realreader/IISacceptanceและแผนactivateSam_Attโดยไม่restart/กระทบGatewayหรือแอปอื่น ไม่ได้Deploy,Restart,MergeMainหรือเปลี่ยนEXEProduction ไม่มีการเขียนhosoffice/procurement_db/ฐานโรงพยาบาลอื่น ไม่มีHTTPportเพิ่ม และไม่เพิ่มBackupgateที่ผู้ใช้ไม่ได้ต้องการ
