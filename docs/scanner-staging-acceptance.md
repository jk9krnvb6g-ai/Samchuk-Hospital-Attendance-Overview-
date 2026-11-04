# FILESERVER Staging Acceptance — Sam_Att

รอบนี้ต่อจาก `1d0306f66d70b52afbbf10dd5cf5835f4677f05d` โฟลเดอร์ทดสอบที่อนุญาตคือ `C:\inetpub\wwwroot\Sam_Att-Scanner-Test` ส่วน `C:\inetpub\wwwroot\Sam_Att` เป็น Production ห้ามเขียนทับ

**ยังไม่มีการรันกับ FILESERVER, 10.1.0.201, Scanner หรือ IIS/Gateway จริงจากสภาพแวดล้อมพัฒนานี้** สคริปต์ต่อไปเป็นขั้นตอนสำหรับผู้ดูแล ผลจริงต้องมาจาก evidence ของเครื่องนั้น ไม่ใช่ผล unit/mock หรือ MariaDB portable

## จุดเข้าเดียวและลำดับ

`scripts/invoke-scanner-staging-acceptance.ps1` แยกช่วงดังนี้:

| Phase | สิ่งที่ทำ | จุดหยุด/อนุมัติ |
|---|---|---|
| ReadOnly | inspect, version/schema, migration plan แบบอ่านอย่างเดียว | schemaไม่พร้อมบันทึก BLOCKED ไม่ applyเอง |
| Migration | แสดง SQL/planHash แล้ว applyเฉพาะ samchuk_attendance และตรวจจริงอีกครั้ง | ต้องพิมพ์อนุมัติ hash ของแผนนั้น; แผนเปลี่ยนหยุดก่อน DDL |
| PrepareRelease | สร้าง versioned artifact ใหม่ใต้ scanner-test/scanner-releases | ต้องอนุมัติ commit; ไม่เขียนทับ live/EXE/IIS |
| Scanner | ตรวจ staging identity ก่อน, snapshot preview, Syncเครื่อง1/2/3 และ[1,3], repeat,เทียบDB | ต้อง hash EXEตรงและอนุมัติก่อนแต่ละกลุ่ม; หยุดทันทีเมื่อผิดพลาด |
| IIS | ตรวจ loaded code/pool, HTTPS proxy, API base, index/static hashes,SPA refresh | ไม่แก้ rewrite/binding จริงและไม่เริ่ม listener |
| Activation | ตรวจว่า approved staging slot ที่มีอยู่โหลด releaseตรงแล้ว | ไม่ activateเอง; ถ้าต้อง restart Production หรือไม่มี slot ให้ BLOCKED |
| All | ReadOnly → Migrationเฉพาะเมื่อเลือก → PrepareRelease → gateway preflight → Scanner → IIS | ทุก mutationยังมีจุดอนุมัติ; ตรวจ gateway ก่อน Scanner เสมอ |

สคริปต์ไม่สร้างฐานทดสอบ ไม่ทำ CREATE/DROP DATABASE ไม่แก้ global Gateway pool ไม่มี Start/Restart IIS/Gateway หรือ node.listen ใหม่ ตัวแปร SAM_ATT_DB_* อยู่เฉพาะ process ที่รันและคืนค่าเมื่อจบ ไม่เขียน .env หรือเก็บรหัสผ่าน/Tokenใน evidence

`-PlanOnly` ตรวจ local prerequisites แล้วออกโดยไม่ติดต่อ DB/API/Scanner และไม่เตรียมrelease หากไม่ใช่เครื่อง FILESERVER/checkoutที่กำหนด จะไม่รัน actual phases ผลส่วนที่ไม่ได้ทำเป็น NOT EXECUTED หากทราบล่วงหน้าว่าต้อง restart Production ให้ใช้ `-GatewayRestartRequired` จะหยุด BLOCKED ก่อนเปลี่ยนแปลง

## 1. อัปเดต checkoutทดสอบและ Build

ผู้ใช้รายงานว่ารอบเดิมบน FILESERVER ผ่าน45/45,12/12,TypeScript,Buildและworktreeสะอาดแล้ว แต่รอบนี้มีโค้ด/metadataใหม่ ต้องอัปเดต branchในโฟลเดอร์ทดสอบเท่านั้น ห้าม reset/clean หรือ switch/pullทับไฟล์แก้ค้าง

```powershell
Set-Location 'C:\inetpub\wwwroot\Sam_Att-Scanner-Test'
git status --short
if (git status --porcelain) { throw 'หยุด: มีไฟล์แก้ค้าง ให้ใช้ worktreeแยก' }
git fetch origin develop/scanner-three-stage-contract
git merge --ff-only origin/develop/scanner-three-stage-contract
if ($LASTEXITCODE -ne 0) { throw 'ไม่สามารถ fast-forward ห้าม reset/clean' }
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependencies failed' }
node --check backend/server.cjs
if ($LASTEXITCODE -ne 0) { throw 'Syntax failed' }
npm run test:scanner
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed' }
npm run test:scanner:frontend
if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed' }
npm run test:scanner:acceptance
if ($LASTEXITCODE -ne 0) { throw 'Mocked PowerShell checks failed' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'TypeScript failed' }
$env:VITE_BASE_PATH='/Sam_Att/'
# ค่าเริ่มต้น API = same-origin /Sam_Att/api → proxyไป /api/Sam_Att/
Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
```

Buildสร้าง `scanner-build.json` ระบุbase/API configที่ compileจริง ไม่อนุญาต credentials/query/fragmentใน VITE_API_URL ต้องมีmetadataนี้ก่อนprepare release สคริปต์ตรวจweb.config ที่proxyไปloopback3002 และassetsใต้/Sam_Att/ การ build ไม่ได้เริ่ม Vite dev/preview server

## 2. ชุดคำสั่งหลัก — รันทีละช่วงหรือ All

Evidenceต้องอยู่นอกpublic web roots มีสิทธิ์อ่านเฉพาะผู้เกี่ยวข้อง ไม่เก็บBearer,รหัสผ่าน,raw scans หรือบุคลากรรายคน มีSQLแผนที่เป็นDDLคงที่,hash,countsและstatusเท่านั้น

```powershell
$repo='C:\inetpub\wwwroot\Sam_Att-Scanner-Test'
$evidence='C:\ProgramData\Sam_Att\ScannerAcceptance'

# ตรวจชุดคำสั่งแบบไม่ติดต่ออะไรจริงก่อน (ไม่ใช่ผล Staging PASS)
& "$repo\scripts\invoke-scanner-staging-acceptance.ps1" `
  -RepositoryPath $repo -EvidenceDirectory $evidence -Phase All -PlanOnly

# SELECT accountที่มีสิทธิ์เฉพาะ samchuk_attendance
$readOnly=Get-Credential -Message 'SELECT account: samchuk_attendance @ 10.1.0.201'
& "$repo\scripts\invoke-scanner-staging-acceptance.ps1" `
  -RepositoryPath $repo -EvidenceDirectory $evidence `
  -Phase ReadOnly -DatabaseCredential $readOnly
```

หาก schemaยังไม่พร้อม คำสั่งReadOnlyจะหยุดBLOCKEDแต่ยังสร้างschema-before.jsonและmigration-plan.jsonให้ตรวจ รายงานstorageReady/calculationSchemaReady,missingTables/Columns,duplicates/pendingและserverIdentity fingerprint โดยไม่แสดงชื่อhostname/credentials ตัวfingerprintใช้เทียบDBที่ติดต่อโดยตรงกับpoolของGateway ไม่ทดแทนการตั้งค่า host10.1.0.201/databaseอย่างชัดเจน

### Migration — มีแผนและรออนุมัติ

```powershell
& "$repo\scripts\invoke-scanner-staging-acceptance.ps1" `
  -RepositoryPath $repo -EvidenceDirectory $evidence `
  -Phase Migration -DatabaseCredential $readOnly
```

สคริปต์จะแสดงSQLจริง/รายการเปลี่ยนแปลง/ผลblockers/planHashก่อนถามให้พิมพ์:

`APPLY samchuk_attendance <planHashเต็ม>`

จากนั้นจึงถามบัญชี DDLที่มีสิทธิ์เฉพาะฐานนี้ ไม่ใช้ root หรือ poolส่วนกลาง CLIตรวจแผนซ้ำภายใต้lockก่อนDDL ถ้าschema/server/SQLเปลี่ยนต้องตรวจและอนุมัติใหม่ หลังApplyต้องอ่านฐานจริงแล้วstorageReadyและcalculationSchemaReadyเป็นtrue มิฉะนั้นFAILและไม่ไปช่วงScanner DDLมีimplicit commitจึงไม่อ้างว่าrollbackmigrationทั้งชุดได้

หากใช้CLIโดยตรง ต้องครบทั้งแผนที่ตรวจแล้ว,flagเดิมและhash:

```powershell
# ใช้SAM_ATT_DB_*เฉพาะprocessจากบัญชีที่ผู้ดูแลเตรียมไว้ ไม่ใส่passwordในคำสั่ง/ไฟล์Git
npm run scanner:db:plan
# หลังตรวจและอนุมัติแผนจริงแล้วเท่านั้น
$env:SAM_ATT_MIGRATION_CONFIRM='APPLY_SAMCHUK_ATTENDANCE_ONLY'
npm run scanner:db:migrate -- --approved-plan '<planHashที่อนุมัติจริง>'
Remove-Item Env:SAM_ATT_MIGRATION_CONFIRM
```

ไม่ต้องสร้างTest Databaseใหม่ ไม่เพิ่มBackupgate ไม่ลบduplicateอัตโนมัติ การแก้engine/type/data conflictที่มีblockerต้องออกแผนแยกและอนุมัติก่อน

## 3. เตรียม Staging Release

```powershell
& "$repo\scripts\invoke-scanner-staging-acceptance.ps1" `
  -RepositoryPath $repo -EvidenceDirectory $evidence -Phase PrepareRelease
```

ต้องพิมพ์ `PREPARE STAGING <commitเต็ม>` ก่อนสร้างโฟลเดอร์ใหม่ใต้ `$repo\scanner-releases\...` พื้นที่นี้ถูกignoreจากGitไม่ทำให้worktreeสกปรก ไม่เขียนทับreleaseเก่า/source/Production ไม่คัดลอก EXE/DLL/reader archive/.env/appsettings

ใช้เฉพาะ `release\frontend` เป็นphysical pathของstaging frontendที่ผู้ดูแลจัดเตรียมไว้ ไม่เปิดเว็บให้serve checkout/backend/evidenceทั้งหมด ติดตั้งruntime dependenciesในreleaseใหม่ด้วย `npm ci --omit=dev` ก่อนให้staging loaderโหลดbackend ไม่มีคำสั่งให้รันnodebackendstandaloneเพื่อแย่ง3002

## 4. เงื่อนไข Staging Activation — ไม่ Restart Production

Physical folder `Sam_Att-Scanner-Test` ไม่ได้ทำให้ URL `/Sam_Att/` หรือ Gatewayเปลี่ยนไปใช้stagingเอง ต้องมีapproved staging hostname/site/slotอยู่แล้วที่HTTPS3001และGateway3002 และไม่ชนProduction URLเดิม หากไม่มีหรือการเปิดslotต้องrestartGatewayProductionให้หยุดและรายงานBLOCKED ห้ามแก้central pool/Procurement/Cash_ChequeหรือIIS Productionเพื่อข้ามเงื่อนไข

รูปแบบdependenciesสำหรับ **loader stagingที่ได้รับอนุมัติแล้ว** เท่านั้น (ไม่ใช่คำสั่งให้นำไปแก้Production Gateway):

```javascript
const samAttPool = mysql.createPool({
  host: '10.1.0.201', port: 3306, database: 'samchuk_attendance',
  user: stagingSecrets.samAttUser, password: stagingSecrets.samAttPassword,
  dateStrings: true, charset: 'utf8mb4', connectionLimit: 5
});
const stagingRouter = samAttModule.createSamAttRouter({
  dbPool: samAttPool,
  config: {
    allowSchemaMigration: false, allowMigration: false,
    scannerStagingAcceptance: true,
    scannerStagingInstance: 'Sam_Att-Scanner-Test',
    scannerReaderExePath: approvedExistingReaderPath
  }
});
```

ไม่เปลี่ยนDB_HOST/DB_NAME/poolกลางของserviceอื่น ไม่ตั้งSAM_ATT_ENABLE_HOSOFFICE_PUSH=true และไม่เปิดlegacyauto-migration `scannerReaderExePath`เป็นค่าscopedเฉพาะrouter ใช้EXEเดิมที่ผู้ดูแลยืนยัน หากstagingไม่ได้กำหนดpathนี้จะไม่fallbackไปเดาEXE Production

Protected `GET scanners/staging-status` ต้องใช้ADMIN/HRและเปิดเฉพาะconfigstagingเท่านั้น ส่งhashโค้ดที่จับไว้ตอนmodule load,scoped-pool/schema readiness,Push/migration flagsและhashของEXE ไม่ส่งsecret/pathจริง การcopyไฟล์ใหม่ลงdiskโดยไม่loadใหม่ไม่ทำให้loaded hashเปลี่ยน สคริปต์เทียบกับmanifestของreleaseและDBserverIdentityจากdirectreadก่อนอนุญาตSync ถ้าendpoint404/unsafe/hashต่าง ให้BLOCKED ไม่restartหรือแก้gatewayอัตโนมัติ

## 5. Scannerทั้งสามเครื่องและIIS — หลังมีapproved slot

ใส่ URLของstagingที่ผู้ดูแลยืนยันแล้ว ไม่ใช้Production originเพียงเพราะมีpathชื่อเหมือนกัน tokenกรอกแบบSecureStringไม่บันทึกลงevidence เลือกวันที่ปิดแล้วที่readerยังมีข้อมูลเพื่อไม่ให้สแกนสดทำให้repeatต่างกัน

```powershell
$frontend=[uri](Read-Host 'Approved staging URL: https://<staging-host>:3001/Sam_Att/')
$api=[uri]($frontend.AbsoluteUri.TrimEnd('/')+'/api/')
$release=Read-Host 'Full pathของversioned releaseใต้Sam_Att-Scanner-Test'
$token=Read-Host 'ADMIN/HR staging Bearer token' -AsSecureString
$reader=Read-Host 'PathของEXEเดิมที่อนุมัติ ไม่คัดลอก/เขียนทับ'
$readerHash=(Get-FileHash -LiteralPath $reader -Algorithm SHA256).Hash
$date=Read-Host 'วันที่ที่มีข้อมูลจริง YYYY-MM-DD'

& "$repo\scripts\invoke-scanner-staging-acceptance.ps1" `
  -RepositoryPath $repo -EvidenceDirectory $evidence -Phase Scanner `
  -DatabaseCredential $readOnly -ReleasePath $release `
  -FrontendUrl $frontend -ApiBaseUrl $api -BearerToken $token `
  -ReaderExpectedSha256 $readerHash -Mode DATE -ScanDate $date

& "$repo\scripts\invoke-scanner-staging-acceptance.ps1" `
  -RepositoryPath $repo -EvidenceDirectory $evidence -Phase IIS `
  -DatabaseCredential $readOnly -ReleasePath $release `
  -FrontendUrl $frontend -ApiBaseUrl $api -BearerToken $token
```

Scanner phaseทำเครื่อง1,2,3แยกกันแล้ว[1,3] มีsnapshotแบบread-onlyก่อน/หลังpreviewของraw/log/daily/personnel/mapping (row count+aggregateSHA256ของทุกrow ไม่ส่งออกบุคลากร) ถ้าpreviewเปลี่ยนแม้เป็นUPDATEที่จำนวนแถวเท่าเดิมจะหยุดก่อนถามอนุมัติwrite

แต่ละกลุ่มต้องพิมพ์ `SYNC <เครื่อง> <mode> SAMCHUK_ATTENDANCE_ONLY` หลังดูplan/bodyและpreview จึงทำRaw+log+Attendance แล้วrepeatด้วยSKIP_DUPLICATES ยอดinsertต้องตรงDBrowdelta/pendingต้องตรงDB,repeatต้องnew0/duplicateตรงtotalFoundและrawdigestไม่เปลี่ยน หากไม่มีข้อมูลวันนั้นให้BLOCKEDไม่ถือว่าทดสอบเครื่องผ่าน ถ้าrawcommitแล้วcalcล้มเหลวจะเก็บcounts/statusแยกเป็นFAILและหยุด ไม่repeatwriteต่อ

รองรับ `-Mode MONTH -Month YYYY-MM`, `-Mode YEAR -Year YYYY`, `-Mode RANGE -DateFrom YYYY-MM-DD -DateTo YYYY-MM-DD` ด้วยbackend contractเดิม อย่าเลือกช่วงกว้างเกินbuffer25MiBหรืออ้างว่าreaderมีข้อมูลย้อนหลังครบโดยยังไม่ยืนยัน CLIยังใช้--days ไม่เพิ่ม--date-from/--date-to/SDKmutationเอง

IIS phaseเทียบmanifestและloaded module,ตรวจproxyผ่านFrontend `/Sam_Att/api/`จริงไปinstanceเดียวกัน,เทียบscanner-build.jsonกับAPIbase, index,JS/CSS hashesและSPAdeep refresh ไม่แก้rewrite/port/binding ถ้าเจอHTMLแทนJSON,401/403/502,TLSผิดหรือhashต่างจะหยุด ไม่ปิดcertificate validationเพื่อให้ผ่าน

## 6. คำสั่ง All ชุดเดียว

หลังมีapproved staging slotและURLแล้ว สามารถใช้entry pointเดียว:

```powershell
& "$repo\scripts\invoke-scanner-staging-acceptance.ps1" `
  -RepositoryPath $repo -EvidenceDirectory $evidence -Phase All -ApplyMigration `
  -DatabaseCredential $readOnly -FrontendUrl $frontend -ApiBaseUrl $api `
  -BearerToken $token -ReaderExpectedSha256 $readerHash -Mode DATE -ScanDate $date
```

Allจะprepare releaseใหม่แล้วหยุดให้ยืนยัน `VERIFY STAGING WITHOUT PRODUCTION RESTART <commit>` หลังผู้ดูแลใช้approved slotโหลดreleaseนั้นแล้ว จึงตรวจgatewayidentity หากloaderปัจจุบันยังใช้releaseเก่าจะBLOCKED ไม่เปลี่ยนslotให้เอง ให้ผู้ดูแลใช้กลไกstagingที่อนุมัติไว้แล้ว จากนั้นรัน `-Phase Scanner`/`-Phase IIS` พร้อม `-ReleasePath`ที่เลือก การต้องหยุดรอเงื่อนไขนี้เป็นเจตนา ไม่อ้างว่าcopy=activation

หากทราบว่าactivationต้องrestartProduction ห้ามรันต่อ:

```powershell
& "$repo\scripts\invoke-scanner-staging-acceptance.ps1" `
  -RepositoryPath $repo -EvidenceDirectory $evidence -Phase Activation -GatewayRestartRequired
```

## หลักฐานและBrowserที่ยังต้องทำเอง

ผลแต่ละrunอยู่ในGUIDfolderส่วนตัว: acceptance-results.json, schema-before.json, migration-plan.json และmigration-applied.jsonเมื่อapplyจริง statusเป็นPASS/FAIL/BLOCKED/NOT EXECUTED Phaseที่ไม่ทำไม่ถูกทำเครื่องหมายPASS การexit0ของReadOnly/PlanOnlyไม่ได้หมายความว่าStaging Acceptanceครบทั้งหมด

BrowserInteractiveตั้งใจคงNOT EXECUTEDจนผู้ดูแลทดสอบจริง: เปิดเว็บ/เปลี่ยนเมนูต้องไม่มีsyncPOSTอัตโนมัติ,ใช้ปุ่มเลือกวัน/เดือน/ปี/ช่วง,เลือกหลายเครื่อง/preview,ดูRawrefresh/cache,unmapped,ยอดnew/duplicate/errorและcalc failure ใช้Networktabยืนยันปลายทางเป็นapprovedstagingและไม่Push บันทึกผลที่ทำจริงแยกโดยไม่exporttoken/ข้อมูลบุคลากรขึ้นGit

ไม่มีคำสั่งDeployทับProduction/Restart/Merge/เปิดportเพิ่มในชุดนี้ ถ้าไม่มีapprovedrouteหรือสิทธิ์DB/Scanner ให้ส่งevidenceส่วนที่ทำแล้วและบันทึกNOT EXECUTED/BLOCKEDตามจริง ห้ามใช้Mock/portableผลผ่านแทนผลFILESERVER
