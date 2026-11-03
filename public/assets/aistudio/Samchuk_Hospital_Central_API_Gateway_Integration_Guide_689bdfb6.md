# คู่มือเชื่อมต่อระบบเข้ากับ Samchuk Hospital Central API Gateway

**ฉบับอ้างอิงจากการเชื่อมต่อ Procurement ที่ใช้งานได้จริง — 3 พฤศจิกายน 2026**

> เอกสารนี้เป็นคู่มือสำหรับนักพัฒนาและผู้ดูแลระบบ ไม่ใช่สคริปต์ติดตั้งอัตโนมัติ ระบบอื่น ๆ เช่น Sam_Att และ Cash_Cheque ยังไม่ได้เปิดใช้งานผ่าน Gateway ในสถานะล่าสุด จึงต้องทดสอบแยกก่อนเปิดใช้งานจริง

## 1. เป้าหมายและสถาปัตยกรรม

ใช้เพียงสองพอร์ตสำหรับระบบเว็บของโรงพยาบาล:

| หน้าที่ | โปรโตคอล | พอร์ต | ผู้รับผิดชอบ |
|---|---|---:|---|
| Frontend | HTTPS | **3001** | IIS (TLS termination, static frontend, reverse proxy) |
| Backend | HTTP | **3002** | **Samchuk Hospital Central API Gateway** (Node.js / Express) |

- **Gateway เพียงหนึ่ง Node.js HTTP listener** เป็นเจ้าของพอร์ต 3002; ระบบย่อยไม่เปิด HTTP listener ของตนเอง
- Frontend ของแต่ละระบบแยกตาม URL: `/Procurement/`, `/Sam_Att/`, `/Cash_Cheque/`
- API แยกตาม prefix: `/api/Procurement/`, `/api/Sam_Att/`, `/api/Cash_Cheque/`
- Source code และฐานข้อมูลของแต่ละระบบต้องแยกความรับผิดชอบกัน
- IIS รับ HTTPS 3001 แล้ว reverse proxy คำขอ API ไปยัง `http://127.0.0.1:3002`
- ห้ามนำ HTTPS หรือพอร์ตใหม่ไปเปิดใน Backend โดยไม่เปลี่ยนแผนสถาปัตยกรรมอย่างเป็นทางการ

```text
Browser
  |
  | HTTPS https://10.2.0.13:3001
  v
IIS (Frontend + URL Rewrite / ARR)
  |-- /Procurement/   --> Procurement frontend
  |-- /Sam_Att/       --> Sam_Att frontend (อนาคต)
  |-- /Cash_Cheque/   --> Cash_Cheque frontend (อนาคต)
  |
  | Reverse proxy เฉพาะ API
  v
HTTP http://127.0.0.1:3002
Samchuk Hospital Central API Gateway
  |-- /api/Procurement --> Procurement Express Router [ACTIVE]
  |-- /api/Sam_Att     --> Sam_Att Router [DISABLED]
  |-- /api/Cash_Cheque --> Cash_Cheque Router [DISABLED]
  `-- /api/health      --> Gateway Health
```

## 2. สถานะอ้างอิงล่าสุด

สถานะที่ตรวจสอบแล้ว:

- Gateway health: `UP`
- Backend: Port `3002`, listener `127.0.0.1`
- Procurement: `ACTIVE`
- Procurement เชื่อมฐานข้อมูล `procurement_db` ได้ และ Login ผ่านหน้าเว็บจริงได้
- Scheduled Task: `Hospital-Central-API-Gateway` ใช้ดูแลการเริ่ม Gateway อัตโนมัติ
- Sam_Att, Cash_Cheque, Inventory: `DISABLED` ใน ENV ปัจจุบัน
- User กำลังทดลองใช้งาน Procurement; **ยังไม่ถือว่าการทดสอบทุกเมนูและ CRUD เสร็จสิ้น**

## 3. ตำแหน่งไฟล์ในเครื่อง FILESERVER

| ส่วนประกอบ | ตำแหน่ง |
|---|---|
| **Central Gateway (ตำแหน่งใช้งานหลัก)** | `C:\inetpub\wwwroot\Central-API-Gateway` |
| Gateway entry point | `C:\inetpub\wwwroot\Central-API-Gateway\index.js` |
| Gateway Express app | `C:\inetpub\wwwroot\Central-API-Gateway\app.js` |
| Gateway module registry | `C:\inetpub\wwwroot\Central-API-Gateway\modules\registry.js` |
| Procurement adapter | `C:\inetpub\wwwroot\Central-API-Gateway\modules\procurement\index.js` |
| Procurement backend candidate | `C:\inetpub\wwwroot\Procurement-Gateway-Staging\Procurement-Production-Candidate\server\routes\procurement.js` |
| Frontend Procurement ที่ IIS ใช้ | `C:\inetpub\wwwroot\Procurement-Gateway-Staging\Procurement-Frontend-Production\dist` |
| Gateway ENV ปัจจุบัน | `C:\ProgramData\SamchukHospital\Secrets\central-gateway.staging.env` |
| Startup script | `C:\ProgramData\SamchukHospital\Scripts\Start-CentralApiGateway.ps1` |
| Scheduled Task | `Hospital-Central-API-Gateway` |
| Backup ที่สร้างก่อนแก้ Gateway | `C:\ProgramData\SamchukHospital\Backups\Gateway-Migration-20261103-010252` |

**หมายเหตุ:** แม้ชื่อ ENV และ Source บางโฟลเดอร์จะยังมีคำว่า `staging` แต่ในสถานะล่าสุดถูกนำมาใช้กับ Gateway ที่ให้บริการจริงแล้ว อย่าเปลี่ยนชื่อหรือย้ายโฟลเดอร์โดยไม่ปรับ Startup Script, ENV และ Adapter ให้ตรงกัน

## 4. ข้อตกลงสำหรับ Backend ของระบบที่จะเชื่อมใหม่

ระบบย่อยต้องส่งออก **Express Router** โดยไม่เรียก `.listen()`, `http.createServer()` หรือเปิดพอร์ตเอง ตัวอย่างสำหรับระบบใหม่:

```js
// server/routes/example.js
const express = require('express');
const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ success: true, service: 'example', status: 'UP' });
});

module.exports = router;
```

Gateway จะ mount Router ภายใต้ prefix เช่น `/api/Example` จึงเรียกตัวอย่างข้างต้นได้ที่ `GET /api/Example/status`

**ข้อกำหนดสำคัญ:**

1. ห้ามเปิดพอร์ต 3002 ซ้ำ หรือเพิ่มพอร์ต 3003, 3004 ฯลฯ สำหรับระบบย่อย
2. ห้ามใช้ฐานข้อมูลหรือ Secret ของระบบอื่นโดยพลการ
3. ควรมี middleware ตรวจสอบสิทธิ์สำหรับ API ที่ต้อง Login และต้องทดสอบการหมดอายุของ Token
4. กำหนด prefix, CORS, proxy และ path ให้ตรงกันตลอดสาย
5. แยก Router, Dependencies, ENV และ Database ของแต่ละระบบตามความเหมาะสม
6. หากระบบมี Scanner / Raw Scan ต้องคงพฤติกรรมรับข้อมูลจริงและลำดับการทำงานเดิมไว้

## 5. วิธีเชื่อมระบบใหม่กับ Gateway

### ขั้นที่ 1 — เตรียม Backend Router

- จัดเตรียม source code ระบบใหม่ในโฟลเดอร์ของตนเอง
- ยืนยันว่า Router export ได้ และไม่สร้าง network listener
- ติดตั้ง dependencies ในตำแหน่งที่ Node.js resolve ได้จริง
- เตรียมการตั้งค่า DB/Secret ของระบบนั้นโดยไม่แก้ข้อมูลในฐานข้อมูลเดิม

### ขั้นที่ 2 — สร้าง Adapter ของระบบ

Gateway ที่ใช้งานจริงมีรูปแบบ Module Adapter อยู่แล้วที่:

`C:\inetpub\wwwroot\Central-API-Gateway\modules\procurement\index.js`

ให้ใช้รูปแบบ Interface/Validation ตามที่ Gateway เวอร์ชันปัจจุบันกำหนด **อย่าคัดลอก Procurement Adapter ทั้งไฟล์แล้วเปลี่ยนชื่ออย่างเดียว** เพราะมีการตรวจสอบและจำกัด path ของ Procurement โดยเฉพาะ

Adapter ของระบบใหม่ต้องระบุอย่างน้อย:

- `id` ของระบบ
- `name` ของระบบ
- `prefix` เช่น `/api/Example`
- `router` ที่เป็น Express Router จริง
- การตรวจสอบ path/validation ตาม Interface ของ Gateway

### ขั้นที่ 3 — ลงทะเบียน Module

ตรวจสอบและเพิ่มการตั้งค่าเฉพาะระบบใหม่ในไฟล์ที่เกี่ยวข้อง:

- `config/index.js` และ/หรือ `config/modules.js`
- `modules/registry.js`
- `modules/<system>/index.js`

**ต้องตรวจโค้ดจริงของ Gateway รุ่นที่ใช้อยู่ก่อนแก้** เนื่องจากโครงสร้างการลงทะเบียนอาจเปลี่ยนไปตามรุ่น และไม่ควรแก้ Module ของ Procurement ที่ทำงานได้แล้ว

### ขั้นที่ 4 — ตั้งค่า ENV

ไฟล์ ENV ปัจจุบัน:

`C:\ProgramData\SamchukHospital\Secrets\central-gateway.staging.env`

ตัวอย่างเฉพาะค่าที่ไม่เป็นความลับ (อย่านำไปเขียนทับ ENV ปัจจุบัน):

```dotenv
NODE_ENV=production
HOST=127.0.0.1
GATEWAY_PORT=3002
SSL_ENABLED=false
MODULE_PROCUREMENT_ENABLED=true
MODULE_PROCUREMENT_PATH=C:/inetpub/wwwroot/Procurement-Gateway-Staging/Procurement-Production-Candidate/server/routes/procurement.js
MODULE_SAM_ATT_ENABLED=false
MODULE_CASH_CHEQUE_ENABLED=false
MODULE_INVENTORY_ENABLED=false
CORS_ALLOWED_ORIGINS=https://10.2.0.13:3001
```

การเปิดระบบใหม่ต้องเพิ่ม/แก้เฉพาะ Key ที่ Gateway รองรับ และต้องผ่านการตรวจสอบ Adapter ก่อน **ห้ามเปิด `MODULE_SAM_ATT_ENABLED=true` หรือ `MODULE_CASH_CHEQUE_ENABLED=true` เพียงเพื่อทดลองโดยยังไม่เตรียม Router และแผนทดสอบ**

**ข้อควรระวังสำคัญเกี่ยวกับ Password:** หาก Secret มี `#` ให้ครอบค่าด้วย Double Quote เพื่อไม่ให้ถูกตีความเป็น Comment เช่น:

```dotenv
EXAMPLE_DB_PASSWORD="replace-with-your-own-secret#value"
```

อย่าใส่รหัสผ่านจริงลงใน GitHub, README, log หรือภาพหน้าจอ และจำกัดสิทธิ์เข้าถึง ENV

### ขั้นที่ 5 — เชื่อม Frontend ผ่าน IIS

ตัวอย่างเมื่อ Frontend เรียก URL แบบ relative:

```js
const API_BASE = '/Example/api';
const response = await fetch(`${API_BASE}/status`);
```

สร้าง IIS Application `/Example` และกำหนด URL Rewrite สำหรับ API ให้ชี้ไปยัง Gateway:

```xml
<rule name="ReverseProxyToExample" stopProcessing="true">
  <match url="^api/(.*)" />
  <action type="Rewrite" url="http://127.0.0.1:3002/api/Example/{R:1}" />
</rule>
```

> ตัวอย่าง rule นี้วางใน `web.config` ของ IIS Application `/Example` และต้องอยู่ก่อน SPA fallback rule ต้องเปิดใช้ IIS URL Rewrite และ ARR proxy ให้ถูกต้อง การจับคู่ URL ขึ้นกับขอบเขตของ IIS Application และ web.config จริง จึงต้องทดสอบก่อนเปิดใช้งาน

แนวทางการเรียก API:

```text
Browser: https://10.2.0.13:3001/Example/api/status
       -> IIS rewrite/proxy
Gateway: http://127.0.0.1:3002/api/Example/status
       -> Example Router: GET /status
```

**ห้ามให้ Frontend เปิด URL `http://...:3002` โดยตรงจากหน้า HTTPS** เพราะเสี่ยง Mixed Content และไม่ตรงกับแผนที่ให้ IIS เป็นจุดรับ HTTPS

## 6. การเริ่ม Gateway และการดูแล Process

Startup Script ที่ใช้งาน:

`C:\ProgramData\SamchukHospital\Scripts\Start-CentralApiGateway.ps1`

Scheduled Task: `Hospital-Central-API-Gateway`

Gateway ใช้ Node.js พร้อม `--env-file` เพื่อโหลดค่าจาก ENV ขณะเริ่ม Process และมี Supervisor คอยเปิดใหม่หาก Process หยุด

**ตรวจสถานะ (ไม่แก้ไขระบบ):**

```powershell
Get-ScheduledTask -TaskName 'Hospital-Central-API-Gateway' |
    Select-Object TaskName, State

Get-NetTCPConnection -LocalPort 3002 -State Listen |
    Select-Object LocalAddress, LocalPort, OwningProcess

Invoke-RestMethod 'http://127.0.0.1:3002/api/health' |
    ConvertTo-Json -Depth 6
```

**เมื่อแก้ ENV หรือ Router แล้ว:** ต้อง Restart Gateway จึงจะโหลดการตั้งค่าใหม่ อย่าใช้ `taskkill /F /IM node.exe` เพราะอาจปิด Node ของระบบอื่น ให้ระบุ PID/CommandLine ของ Gateway ให้ชัดเจนและดำเนินการในช่วงเวลาที่อนุญาตเท่านั้น

## 7. Checklist ก่อนเปิดระบบใหม่

- [ ] Backup Source, ENV, IIS Configuration และ Startup Script
- [ ] Router ของระบบใหม่ไม่มี `.listen()` / `createServer()`
- [ ] Dependencies ของ Router โหลดได้จริง
- [ ] Adapter ตรวจสอบและโหลด Router ได้
- [ ] Registry mount prefix ที่ถูกต้อง
- [ ] Module อื่นคงสถานะเดิม ไม่ได้รับผลกระทบ
- [ ] Gateway health `UP` และ Port 3002 มีเจ้าของเพียง Process เดียว
- [ ] IIS HTTPS 3001 เปิดหน้าเว็บและ reverse proxy API ได้
- [ ] Database authentication ผ่าน โดยไม่เปลี่ยน schema/data โดยไม่จำเป็น
- [ ] Login, Token, Role และสิทธิ์ API ทำงานถูกต้อง
- [ ] Dashboard แสดงข้อมูลจริง
- [ ] CRUD ทดสอบด้วยข้อมูลทดสอบที่ได้รับอนุญาต
- [ ] Refresh / Logout / Session expiry ผ่าน
- [ ] มีแผน Rollback และทดสอบกู้คืนได้
- [ ] ผู้ใช้งานจริงยืนยันผลทดสอบ

## 8. ปัญหาที่เคยพบและวิธีแยกสาเหตุ

| อาการ | จุดตรวจหลัก |
|---|---|
| Gateway health `UP` แต่ Login ไม่ได้ | ตรวจ Response ของ `POST /api/<system>/login` และ Database connection |
| `GET /login` ได้ `ROUTE_NOT_FOUND` | ตรวจ HTTP method: Procurement ใช้ **POST** ไม่ใช่ GET |
| API ได้ `401` เมื่อไม่มี Token | อาจเป็นการปฏิเสธตามสิทธิ์ปกติ ตรวจ Bearer Token ก่อนสรุปว่า API เสีย |
| Login ได้ `500` | ตรวจ Backend error และ Database authentication โดยไม่เปิดเผย Secret |
| MySQL `ER_ACCESS_DENIED_ERROR` | ตรวจชื่อผู้ใช้, Host, Password ที่ Node โหลดจริง และรูปแบบ ENV |
| Password มี `#` | ครอบค่าด้วย Double Quote ใน ENV แล้ว Restart Gateway |
| TCP 3002 เปิด แต่ Health timeout | TCP LISTEN ไม่ยืนยันว่า Express ตอบได้ ต้องตรวจ Process และ Runtime Error |
| `MODULE_*` เป็น `DISABLED` | ตรวจ Flag, Adapter และ Registry ก่อนเปิด Module |
| หน้าเว็บโหลดได้แต่ API 404 | ตรวจ Frontend API Base URL, IIS Rewrite และ Gateway Prefix ให้ตรงกัน |

## 9. ข้อจำกัดและข้อควรระวัง

1. Procurement Login และ Database Connection ผ่านแล้ว แต่ยังรอผล User Acceptance Test ของเมนูต่าง ๆ
2. Sam_Att และ Cash_Cheque ยังไม่ได้เชื่อมใช้งานจริงผ่าน Gateway ปัจจุบัน และไม่ควรถูกแก้ไขโดยไม่มีแผนแยก
3. อย่าย้าย Gateway หรือ Procurement Source ออกจากโฟลเดอร์ staging เดิมจนกว่าจะอัปเดต reference ทุกจุดและทดสอบเสร็จ
4. อย่าแก้ไข schema, account grants หรือรหัสผ่านของฐานข้อมูลส่วนกลางโดยไม่ประสานผู้ดูแล
5. เมื่อ Gateway เป็นจุดรวมระบบ ควรทดสอบผลกระทบต่อทุกระบบก่อน Restart/Cutover ในอนาคต

---

**สรุป:** การเชื่อมระบบใหม่ทำโดย **Export Express Router → สร้าง Gateway Adapter → ลงทะเบียน Module → กำหนด ENV → ตั้งค่า IIS Reverse Proxy → ทดสอบ Health/Login/ข้อมูล/สิทธิ์** โดยใช้ **IIS HTTPS 3001 และ Central API Gateway HTTP 3002 เท่านั้น**
