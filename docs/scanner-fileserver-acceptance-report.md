# รายงาน FILESERVER Staging Acceptance — Sam_Att

วันที่ 4 พฤศจิกายน 2569 (Asia/Bangkok)

## ฐานงานและการส่งมอบ

ต่อจาก commit `1d0306f66d70b52afbbf10dd5cf5835f4677f05d` บน branch `develop/scanner-three-stage-contract` เดิม ไม่เริ่มระบบใหม่และไม่เปลี่ยน Procurement/Cash_Cheque/Central Gateway รายการ commitส่งมอบล่าสุดอยู่ใน Draft PR #1 และผล `git log -1 --format=%H` ของ branchนี้ เพื่อไม่ฝัง hashของรายงานตัวเอง

ผู้ใช้รายงานว่า FILESERVER ที่ฐานเดิมผ่านBackend45/45,Frontend12/12,TypeScript,ViteBuild,ติดตั้งdependenciesแล้วและworktreeสะอาด รายงานนี้ไม่ตีความข้อมูลดังกล่าวว่า commitใหม่ได้รันบนFILESERVERแล้ว

**ไม่มี authenticated session, DB credential, Scanner connection หรือ approved IIS/Gateway staging slot ของFILESERVERในสภาพแวดล้อมที่Codexใช้งาน จึงไม่ได้ติดต่อ10.1.0.201หรือเรียกScanner/IISจริง** ทำงานพัฒนา/ทดสอบที่ทำได้ครบแล้ว และเตรียมentry pointเดียวให้ผู้ดูแลดำเนินการส่วนที่เหลือ

## สถานะทั้ง4งานบนสภาพแวดล้อมจริง

| งาน | สถานะจริง ณ ส่งมอบ | หลักฐาน/สิ่งที่ยังขาด |
|---|---|---|
| MariaDB connection10.1.0.201 | **NOT EXECUTED** | ต้องให้ผู้ดูแลใช้SELECT accountเฉพาะsamรันReadOnly |
| Schema/storage/calculation readinessจริง | **NOT EXECUTED** | ยังไม่มีschema-before.jsonจากserverจริง |
| Migrationจริง | **NOT EXECUTED** | ยังไม่มีแผนจากฐานจริงหรือการอนุมัติผู้ดูแล จึงไม่มีApply |
| Scanner1 | **NOT EXECUTED** | ยังไม่มีSDK/JSON/DBcountsของFILESERVER |
| Scanner2 | **NOT EXECUTED** | เช่นเดียวกัน |
| Scanner3 | **NOT EXECUTED** | เช่นเดียวกัน |
| Multi-machine/datewindowsจริง | **NOT EXECUTED** | ชุดทดสอบพร้อม แต่ยังไม่ได้รันอุปกรณ์ |
| IIS/Gateway stagingจริง | **NOT EXECUTED** | ยังไม่มีloaded-code/pool/proxy/assets evidenceจากhostจริง |
| Staging activation | **BLOCKED** จนยืนยันapproved slotที่ไม่restartProduction | ไม่สรุปว่าGatewayจริงต้องrestart; ถ้าจำเป็นต้องrestartให้หยุดตามข้อห้าม |
| Browserinteractiveจริง | **NOT EXECUTED** | ผู้ดูแลต้องตรวจปุ่ม/Network/Rawrefresh/errorด้วยbrowser |

**Staging Acceptance ยังไม่ผ่านครบและยังไม่พร้อมเปิดProduction** ไม่ใช้ผลMockหรือMariaDBportableแทนผลสภาพแวดล้อมจริง

## สิ่งที่แก้เพื่อปิดช่องว่างในการAcceptance

### MariaDBและMigration

- เพิ่มread-only `scanner:db:plan` แสดงSQL/actions/blockersและplanHash ผูกกับschema,version,serverfingerprintและSQLจริง
- Applyต้องมีทั้งconfirmationflagและapprovedPlanHash ตรวจแผนซ้ำภายใต้advisorylockก่อนDDL หากเปลี่ยนหรือยังมีblockerจะไม่apply
- เพิ่มread-only snapshotของraw/log/daily/personnel/mapping ใช้repeatable-read transactionและaggregateSHA256 ตรวจUPDATEได้แม้จำนวนแถวเท่าเดิม ไม่exportบุคลากร/scanรายคน
- DirectDBและscopedpoolของGatewayต้องได้serverIdentity fingerprintตรงกัน ไม่ใช้เพียงชื่อschemaที่อาจซ้ำคนละserver
- ไม่มีCREATE/DROP DATABASE,ไม่มีseed/DELETE/deduplicateบนserverจริง ไม่สร้างTestDBใหม่รอบนี้ Migrationยังfullyqualifiedเฉพาะsamchuk_attendance และไม่กำหนดBackupgate

### Scannerและผลบันทึก

- คงexistingpipeline/UniqueKey/Transaction/rawSaveSuccessและcalculationStatusเดิม ไม่เปลี่ยนSQLinsertที่ผ่านแล้วโดยไม่จำเป็น
- Stagingreaderpathเป็นdependencyconfigเฉพาะrouter หากไม่กำหนดจะไม่fallbackไปเดาEXEProduction ไม่แก้/คัดลอกทับEXE
- Acceptanceต้องเทียบEXEhashกับไฟล์เดิมที่ผู้ดูแลอนุมัติก่อนเรียกreader
- แต่ละเครื่อง1/2/3และ[1,3]มีpreview/snapshot/typedapproval/write/repeat/DBrowdelta/pending/RawGET แยกหลักฐาน การอ่านวันไม่มีข้อมูลไม่ถือว่าเครื่องผ่าน
- HTTP502ที่rawcommitแล้วแต่calcล้มเหลวยังคงcountsและrawSaveStatusในผลFAIL ไม่แสดงเหมือนRawสูญหาย และไม่write/repeatต่อหลังfailure

### IIS/GatewayและRelease

- เพิ่มprotected staging-status สำหรับADMIN/HR เปิดเฉพาะconfigstaging มีhashที่จับไว้ตอนmodule load,sourceอยู่ใต้scanner-test,scopedpool,Push/migration disabledและschemaพร้อม การcopyไฟล์บนdiskไม่สามารถปลอมว่าreloadแล้วได้
- ทดสอบcreateSamAttRouterแยกpoolข้ามasynchronousrequestsโดยไม่แตะsharedpoolหรือเปิดlistener
- อนุญาตprepareartifactเฉพาะ`C:\inetpub\wwwroot\Sam_Att-Scanner-Test`และsubtree ปฏิเสธProduction/lookalike/reparsepoint ไม่เขียนทับreleaseเก่า
- สร้างmanifestและbuildmetadataจริงในfrontend ตรวจbase/API URL/staticrewriteก่อนpackage ไม่รวมnativeEXE/DLL/readerarchive/config/credentials
- IIS acceptanceตรวจHTTPS3001,proxyไปmoduleเดียวกัน,APIbase/index/JS/CSS hashes,scanner-build.jsonและSPArefresh ไม่แก้IISbinding/rewriteหรือrestartserviceเอง
- ไม่สร้างNodeServerแยก ไม่เปิดportเพิ่ม ไม่เปลี่ยนpoolส่วนกลาง หากไม่มีapprovedslotหรือloadต้องrestartProduction ให้BLOCKED

## ชุดคำสั่งPowerShellที่ส่งมอบ

Entry point: `scripts/invoke-scanner-staging-acceptance.ps1`

[คู่มือคำสั่งทั้งหมด](scanner-staging-acceptance.md) มีReadOnly,Migration,PrepareRelease,Scanner,IIS,ActivationและAllในสคริปต์เดียว มีPlanOnlyและจุดยืนยันก่อนการเปลี่ยนแปลงจริง ทุกช่วงหยุดเมื่อผิดพลาด/เงื่อนไขไม่พร้อม และเก็บPASS/FAIL/BLOCKED/NOT EXECUTEDเป็นJSONในfolderนอกpublicIISroots

ลำดับAll: read-only → plan/approval/applyถ้าเลือก → releaseapproval → ผู้ดูแลยืนยันapprovedstagingที่ไม่restartProduction → loadedidentity → Scanner → IIS ส่วนBrowserต้องตรวจจริงแยก การexit0ของPlanOnly/ReadOnlyไม่เท่ากับผ่านStagingทั้งหมด

โฟลเดอร์releaseใหม่ใต้`scanner-releases`ถูกignore ไม่ทำให้worktreeสกปรก หน้าเว็บต้องserveเฉพาะrelease/frontend ไม่servecheckout/backend/evidenceทั้งหมด ไม่เปลี่ยนProduction physicalpath

## ผลที่รันจริงในDevelopment

| รายการ | ผล |
|---|---|
| Backendscanner/protocol/staging tests | **55/55 PASS** |
| FrontendAPI/store tests | **12/12 PASS** |
| MariaDB10.11.10แบบแยก | **17กรณี PASS** (Nodeนับ18เมื่อรวมparent suite) |
| PowerShellmockedacceptance | **9/9 PASS** บนWindowsPowerShell5.1 และPowerShellปัจจุบัน |
| Backendsyntax/TypeScript | PASS |
| Viteproductionbuild | PASS พร้อมscanner-build.json;warningbundle>500kBยังมี |
| Diff/credential review | ตรวจaddedfiles/diff ไม่มีรหัสผ่าน/token/privatekeyจริง;fixturesสังเคราะห์ |
| PlanOnly/releaseartifactsmoke | ตรวจในworkspaceหลังcommitตามบันทึกส่งมอบ ไม่ใช่FILESERVERactivation |
| Shared-serverreadonlysuite | SKIP/NOT EXECUTED ไม่เรียกว่าPASS |

MariaDBจริงที่ใช้ทดสอบคือ**instanceเดิมในdevelopmentworkspace**,version10.11.10,strictSQLmode,namedpipe,skip_networking=1,ไม่มีHTTP/TCPlistenerและไม่มีWindowsservice ใช้schemafixtureเดิม ไม่CREATE/DROP DATABASEใหม่ รันresetเฉพาะตารางfixtureภายในinstanceแยกก่อนtestและตรวจdatadir/version/schemawhitelistก่อนเขียน ไม่ใช่10.1.0.201

17กรณีรวม14กรณีเดิมกับ3กรณีใหม่: แสดงSQLโดยไม่apply/ปฏิเสธapprovalหายหรือhashผิด,schemadriftทำให้approvalเดิมใช้ไม่ได้,read-onlysnapshotตรวจUPDATEโดยไม่exportบุคลากร รวมทั้งAttendancealgorithmจริง/VALUESupsert/rollback/mappingว่าง/Pushaudit/duplicate dataไม่สูญหายที่ยังผ่านบนengineจริง

PowerShelltestsใช้function ASTของสคริปต์จริงกับfakeCLI/HTTP/credential ไม่ติดต่อnetworkหรือdevice ตรวจargumentflags,approvalตรง,HTTPถูกปฏิเสธ,HTTPJSONerrorรักษาrawoutcome,previewเปลี่ยนแล้วห้ามwrite,restartถูกBLOCKEDและpathProductionถูกปฏิเสธ จึงไม่ใช่ผลIISจริง

## ไฟล์ที่แก้รอบนี้

1. `.gitignore`
2. `backend/scanner-storage.cjs`
3. `backend/scanner-db-admin.cjs`
4. `backend/scanner-staging.cjs`
5. `backend/server.cjs`
6. `backend/tests/scanner-mariadb.isolated.test.cjs`
7. `backend/tests/scanner-staging.test.cjs`
8. `scripts/prepare-scanner-staging.ps1`
9. `scripts/invoke-scanner-staging-acceptance.ps1`
10. `scripts/tests/test-scanner-staging.ps1`
11. `vite.config.ts`
12. `package.json`
13. `docs/scanner-staging-acceptance.md`
14. `docs/scanner-fileserver-acceptance-report.md`
15. `docs/scanner-mariadb-fileserver.md`

## งานที่ผู้ดูแลต้องดำเนินการจริงและส่งกลับ

1. อัปเดตcleanworktreeทดสอบและbuildcommitส่งมอบใหม่ ห้ามทับไฟล์แก้ค้าง
2. รันReadOnlyด้วยบัญชีSELECTเฉพาะsamที่10.1.0.201 ส่งschema-before/planที่ไม่มีcredentials
3. ตรวจSQLแผนจริงก่อนอนุมัติ หากApplyแล้วส่งpost-inspectionจริง;ถ้ามีduplicate/type/engineblockerให้หยุด ไม่ลบdataเอง
4. เตรียมversionedartifactใหม่ และใช้approvedstagingloaderที่ไม่restartProduction พร้อมpoolเฉพาะSam_Att/dateStrings:true/readerpathที่อนุมัติ/ปิดPush
5. รันScanner/IISกับURLstagingที่ยืนยันแล้ว บันทึกactualcounts/EXEhash/loadedhash/proxy/assets/status ไม่exportบุคลากรหรือtoken
6. ตรวจBrowserจริงและเรียกexplicitrecalculationเมื่อPersonnel/Mappingพร้อมหากrawรออยู่
7. ถ้าactivationจำเป็นต้องrestartCentralGatewayหรือIISProduction ให้BLOCKEDและรายงาน ไม่ดำเนินการแทน

## ข้อจำกัดที่ยังคงอยู่

- EXEdatecoverage/retentionยังไม่ยืนยันจากอุปกรณ์จริงในรอบนี้ --daysไม่เท่ากับการรองรับ--date-from/--date-toเต็มรูปแบบ
- 25MiB/180วินาทีต่อreaderinvocationยังคงเดิม ช่วงกว้างอาจล้มเหลวชัดเจนและIIS/gatewaytimeoutจริงต้องตรวจ
- workCode:nullรองรับ แต่ไม่มีคอลัมน์workCodeที่ไม่null ไม่เปลี่ยนschemaเพื่อเหตุนี้
- Snapshot/rowdeltaต้องทดสอบในช่วงไม่มีSam_Attwriterอื่นและวันที่ปิดแล้ว หากมีข้อมูลสดเปลี่ยนจะFAIL/ต้องทดสอบใหม่ ไม่สรุปว่าduplicatebugโดยเดา
- serverIdentityเป็นfingerprintสำหรับตรวจความสอดคล้อง ไม่ทดแทนการตั้งhost/database/accountเฉพาะและสิทธิ์ที่ผู้ดูแลต้องยืนยัน
- ไม่มีการเปิดPush,Migration/DeployProductionจริง,Restart/Mergemain,แก้EXEหรือเขียนฐานhosoffice/procurement_db/ฐานอื่นบนhospitalserver

## ข้อสรุป

Development handoffพร้อมสำหรับผู้ดูแลดำเนินStaging Acceptanceด้วยคำสั่งชุดเดียว แต่**FILESERVER Staging Acceptanceยังไม่เสร็จและไม่ผ่านจริง** เพราะยังขาดaccess/evidenceของทั้ง4ส่วนจริง รันเฉพาะสิ่งที่ได้รับอนุญาตและส่งผลจริงก่อนพิจารณาเปิดใช้งานProductionภายหลัง
