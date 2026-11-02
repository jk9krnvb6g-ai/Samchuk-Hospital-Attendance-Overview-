# คู่มือการเชื่อมต่อระบบ Sam_Att เข้ากับ Samchuk Hospital Central API Gateway

เอกสารฉบับนี้จัดทำขึ้นสำหรับทีมวิศวกรผู้ดูแลระบบ **Central API Gateway (พอร์ต 3002)** ของโรงพยาบาลสามชุก เพื่อนำโมดูลระบบลงเวลา **Sam_Att** ไปติดตั้ง (Mount) และให้บริการร่วมกับระบบอื่นในโรงพยาบาลได้อย่างปลอดภัยและมีประสิทธิภาพ

---

## 1. ข้อมูลภาพรวมโมดูล (Module Overview)

- **ชื่อโมดูล**: Samchuk Hospital Attendance System (Sam_Att Router Module)
- **จุดนำเข้า (Entry Point)**: 
  - `backend/modules/sam_att/index.cjs` (โมดูลหลัก)
  - `backend/samAttRouter.cjs` (Root Alias สำหรับเรียกใช้สะดวก)
- **ฟังก์ชันหลัก**: `createSamAttRouter(dependencies)` คืนค่าเป็น Express Router Instance
- **เส้นทางที่ต้อง Mount บน Gateway**: `/api/Sam_Att/`
- **พอร์ตที่ให้บริการ**: **HTTP พอร์ต 3002** (Central Gateway เป็นผู้เปิด Listener เพียงตัวเดียว)
- **พอร์ตของระบบอื่น**: โมดูล Sam_Att **ไม่มีการเปิดหรือเรียกพอร์ต 3003 หรือ 3004** อย่างเด็ดขาด

---

## 2. ตัวอย่างการ Mount เข้ากับ Central API Gateway

ในไฟล์หลักของ Central Gateway (เช่น `gateway.js` หรือ `server.js` บนพอร์ต 3002):

```javascript
const express = require('express');
const cors = require('cors');

// 1. นำเข้า createSamAttRouter จาก Sam_Att Module
const { createSamAttRouter } = require('./Sam_Att/backend/modules/sam_att/index.cjs');
// หรือ require('./Sam_Att/backend/samAttRouter.cjs');

const gateway = express();
gateway.use(cors());
gateway.use(express.json({ limit: '10mb' }));

// 2. (ทางเลือก) เตรียม Database Pools หากต้องการให้ใช้ Pool ร่วมกับ Gateway
// หากไม่ระบุ dependencies ตัวโมดูลจะใช้ Connection Pool ภายในตามไฟล์ .env อัตโนมัติ
const dependencies = {
  // dbPool: mySharedAttendancePool,       // mysql2 pool สำหรับ samchuk_attendance
  // hosofficePool: mySharedHosofficePool, // mysql2 pool สำหรับ hosoffice
  // config: { ... },                      // ค่าคอนฟิกเพิ่มเติม
  // logger: console                       // ระบบบันทึก Log
};

// 3. Mount Sam_Att Router ที่ Prefix /api/Sam_Att
const samAttRouter = createSamAttRouter(dependencies);
gateway.use('/api/Sam_Att', samAttRouter);

// 4. Central Gateway เปิด Listener พอร์ต 3002 เพียงจุดเดียว
const GATEWAY_PORT = process.env.GATEWAY_PORT || 3002;
gateway.listen(GATEWAY_PORT, '0.0.0.0', () => {
  console.log(`🚀 Central API Gateway กำลังทำงานบนพอร์ต ${GATEWAY_PORT}`);
  console.log(`🏥 Sam_Att Service พร้อมใช้งานที่: http://10.2.0.13:${GATEWAY_PORT}/api/Sam_Att/`);
});
```

---

## 3. สถาปัตยกรรมการส่งต่อคำขอผ่าน IIS (Reverse Proxy Flow)

Frontend ของ Sam_Att ทำงานบน **HTTPS พอร์ต 3001** ภายใต้ Sub-path `/Sam_Att/` และเรียก API แบบ Same-Origin:

```
[ผู้ใช้งาน Browser] 
       │ 
       ▼ HTTPS https://10.2.0.13:3001/Sam_Att/api/shifts
┌─────────────────────────────────────────────────────────────┐
│ IIS 10 (Web Server พอร์ต 3001)                                │
│ กฎ Reverse Proxy ใน web.config:                               │
│ Match: ^Sam_Att/api/(.*) หรือ .*api/(.*)                      │
│ Action: Rewrite -> http://127.0.0.1:3002/api/Sam_Att/{R:1}   │
└─────────────────────────────────────────────────────────────┘
       │
       ▼ HTTP http://127.0.0.1:3002/api/Sam_Att/shifts
┌─────────────────────────────────────────────────────────────┐
│ Central API Gateway (พอร์ต 3002)                             │
│ app.use('/api/Sam_Att', samAttRouter)                       │
│ └── router.get('/shifts', ...) -> ส่งผลลัพธ์ JSON HTTP 200    │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. รายการ API Routes ทั้งหมดของ Sam_Att (API Route Catalog)

โมดูล Sam_Att รองรับ URL ทั้ง 2 รูปแบบอย่างโปร่งใส (ทั้งแบบมีและไม่มี `/api`):

### 4.1 สถานะระบบและการตรวจสอบสุขภาพ (Health & Status)
- `GET /api/Sam_Att/health` — ตรวจสอบสถานะการทำงานของบริการ Sam_Att
- `GET /api/Sam_Att/status` — สรุปสถานะการเชื่อมต่อฐานข้อมูลและเครื่องสแกน

### 4.2 ระบบยืนยันตัวตนและผู้ใช้งาน (Auth & User Management)
- `POST /api/Sam_Att/auth/login` — เข้าสู่ระบบผ่านฐานข้อมูล `attendance_user` (PBKDF2 Hash)
- `GET /api/Sam_Att/auth/me` — ตรวจสอบข้อมูลผู้ใช้งานและสิทธิ์ปัจจุบันจาก Token
- `POST /api/Sam_Att/auth/logout` — ออกจากระบบและยกเลิก Token
- `POST /api/Sam_Att/auth/change-password` — เปลี่ยนรหัสผ่านของผู้ใช้งาน
- `GET /api/Sam_Att/users` — รายชื่อผู้ใช้งานระบบ (ต้องการสิทธิ์ ADMIN)
- `POST /api/Sam_Att/users` — สร้างผู้ใช้งานใหม่
- `PUT /api/Sam_Att/users/:id/status` — ระงับหรือเปิดใช้งานบัญชีผู้ใช้
- `POST /api/Sam_Att/users/:id/reset-password` — รีเซ็ตรหัสผ่านผู้ใช้

### 4.3 กะเวลาและประเภทบุคลากร (Shifts & Personnel Types)
- `GET /api/Sam_Att/shifts` — ดึงรายการกะเวลาทำงานทั้งหมดจาก `attendance_shift`
- `POST /api/Sam_Att/shifts` — เพิ่มกะเวลาใหม่
- `PUT /api/Sam_Att/shifts/:id` — แก้ไขช่วงเวลากะ
- `DELETE /api/Sam_Att/shifts/:id` — ลบกะเวลา
- `POST /api/Sam_Att/shifts/repair-thai` — ซ่อมแซมชื่อภาษาไทยของกะเวลา (UTF-8)
- `POST /api/Sam_Att/shifts/sync-all` — บันทึกกะเวลาทั้งหมดพร้อมกัน
- `GET /api/Sam_Att/personnel-types` — รายการประเภทบุคลากรและการผูกกะเวลา
- `POST /api/Sam_Att/personnel-types` — เพิ่มประเภทบุคลากร
- `PUT /api/Sam_Att/personnel-types/:id` — แก้ไขประเภทบุคลากร
- `DELETE /api/Sam_Att/personnel-types/:id` — ลบประเภทบุคลากร
- `POST /api/Sam_Att/personnel-types/reset-default` — รีเซ็ตประเภทบุคลากรเป็นค่าเริ่มต้นโรงพยาบาล

### 4.4 ทะเบียนบุคลากรและการซิงค์ HOSOffice (Personnel & Sync)
- `GET /api/Sam_Att/personnel` — ดึงข้อมูลบุคลากรจาก `samchuk_attendance.attendance_personnel`
- `ALL /api/Sam_Att/personnel/sync-from-hosoffice` — **(สำคัญ)** ซิงค์ข้อมูลบุคลากรจาก `hosoffice.hr_person` แบบ Upsert โดยไม่ลบข้อมูลเดิม และไม่เปลี่ยนสถานะเป็น INACTIVE
- `DELETE /api/Sam_Att/personnel/clear` — ล้างข้อมูลบุคลากร (เฉพาะสภาพแวดล้อมทดสอบ)
- `GET /api/Sam_Att/hosoffice/personnel` — ตรวจสอบรายชื่อบุคลากรสดจากตาราง HOSOffice
- `POST /api/Sam_Att/hosoffice/personnel/refresh-mapping` — อัปเดตตารางแมปปิ้งรหัสสแกนนิ้ว

### 4.5 ข้อมูลการลงเวลาและการคำนวณผล (Attendance & Calculations)
- `GET /api/Sam_Att/attendance?date=YYYY-MM-DD` — ดึงผลการลงเวลารายวัน
- `POST /api/Sam_Att/attendance/recalculate` — สั่งคำนวณผลการลงเวลาใหม่ตามช่วงวันที่
- `POST /api/Sam_Att/attendance/daily/batch` — บันทึกผลการประมวลผลรายวันแบบกลุ่ม
- `DELETE /api/Sam_Att/attendance/daily/clear` — ล้างผลสรุปรายวัน
- `POST /api/Sam_Att/attendance/seed-month` — สร้างข้อมูลตัวอย่างเพื่อการทดสอบ

### 4.6 ข้อมูลสแกนดิบ (Raw Scans)
- `GET /api/Sam_Att/raw-scans?limit=100` — ดึงประวัติการสแกนดิบจาก Staging (`attendance_raw_scan`)
- `POST /api/Sam_Att/raw-scans` — รับข้อมูลสแกนเดี่ยว (รองรับ Scanner Machine Token)
- `POST /api/Sam_Att/raw-scans/batch` — รับข้อมูลสแกนดิบแบบกลุ่ม
- `DELETE /api/Sam_Att/raw-scans/:id` — ลบรายการสแกนดิบ
- `POST /api/Sam_Att/raw-scans/:id/exclude` — ยกเว้นรายการสแกนจากการประมวลผล

### 4.7 เครื่องสแกนลายนิ้วมือ/ใบหน้า (CMiF68S Scanners)
- `GET /api/Sam_Att/scanners` — สถานะเครื่องสแกนทั้ง 3 จุด (อำนวยการ, ER, IPD)
- `POST /api/Sam_Att/scanners/test-connection` — ทดสอบการเชื่อมต่อ Socket พอร์ต 5005
- `GET /api/Sam_Att/scanners/test-socket` — ทดสอบการส่งคำสั่งระดับไบนารี
- `POST /api/Sam_Att/scanners/sync` — สั่งอ่านข้อมูลจากเครื่องสแกนผ่าน `ScannerSyncCli.exe`
- `POST /api/Sam_Att/scanners/sync-custom` — สั่งอ่านข้อมูลย้อนหลังตามช่วงวันที่
- `GET /api/Sam_Att/scanners/check-dll` — ตรวจสอบความสมบูรณ์ของ Native DLLs (x86)
- `GET /api/Sam_Att/scanners/sync-logs` — ประวัติการซิงค์ข้อมูลสแกน

### 4.8 การส่งข้อมูลเข้า HOSOffice (Push to HOSOffice)
- `POST /api/Sam_Att/push/batch` — ส่งข้อมูลเวลาที่ผ่านการตรวจแล้วเข้า `hosoffice.fingle_scan`
- `GET /api/Sam_Att/push/batches` — ประวัติการส่งข้อมูลย้อนหลัง

---

## 5. การทดสอบความถูกต้องผ่าน Mock Gateway

สามารถรันชุดทดสอบความเข้ากันได้ของ Central Gateway ได้ทันทีโดยใช้คำสั่ง:

```bash
node backend/mock-gateway.cjs
```

ชุดทดสอบจะจำลอง Central Gateway และทดสอบ Route สำคัญทั้ง 9 รายการ โดยใช้ Mock Pool ในหน่วยความจำ ไม่แตะต้องฐานข้อมูลจริง และยืนยันความถูกต้องของสัญญา API (Status 200, Content-Type: application/json)

---

## 6. รายการงานที่พักไว้และต้องดำเนินการก่อนขึ้น Production (Pre-Production Checklist)

ตามข้อกำหนดใน Phase 2 งานต่อไปนี้ได้รับการพักไว้ชั่วคราวเพื่อความปลอดภัยสูงสุดของระบบจริง:

1. **การยืนยันตัวตนขั้นเข้มงวด (Strict Authentication Enforcer)**:
   - ปัจจุบันยังมี Fallback ให้สิทธิ์ผู้ใช้ Intranet ภายในโรงพยาบาลอัตโนมัติหากไม่มี Token
   - *ก่อนขึ้น Production*: ต้องเปิดโหมด `REQUIRE_STRICT_AUTH=true` ใน `.env` และบังคับใช้ JWT / Session Token ทุกคำขอ
2. **การทดสอบฮาร์ดแวร์เครื่องสแกนจริง**:
   - พักการเรียก `ScannerSyncCli.exe` ไปยังเครื่องสแกนจริงระหว่างทดสอบ
   - *ก่อนขึ้น Production*: ทดสอบรัน `ScannerSyncCli.exe --auto --days 1` บน Windows Server จริงที่ต่อวง LAN เดียวกับเครื่องสแกน (192.168.111.163-165)
3. **การส่งข้อมูลเข้า HOSOffice (fingle_scan)**:
   - พักการส่งข้อมูลจริงเข้าตาราง `fingle_scan` ของโรงพยาบาล
   - *ก่อนขึ้น Production*: ตรวจสอบ Unique Key บน `fingle_scan` เพื่อป้องกันข้อมูลซ้ำ และทดสอบส่งข้อมูล 1 รายการด้วยตนเองผ่านเมนู Manual Push
