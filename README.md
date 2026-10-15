# ระบบจัดการเวลาปฏิบัติงานและเครื่องสแกนนิ้ว โรงพยาบาลสามชุก (v2)
**Samchuk Hospital Attendance & Biometric Fingerprint Management System**

ระบบจัดการเวลาปฏิบัติงานและเครื่องสแกนนิ้วสำหรับโรงพยาบาลสามชุก ออกแบบเพื่อรองรับงานบริการสุขภาพที่มีความซับซ้อน รองรับการขึ้นเวรหลายกะในวันเดียว (Multi-Shift), การเชื่อมต่อเครื่องสแกนนิ้ว HIP CMiF68S ผ่าน TCP Socket ด้วย `FK623Attend.dll`, และการเชื่อมต่อสองฐานข้อมูล (Staging Database `samchuk_attendance` และระบบฐานข้อมูลกลาง `hosoffice` @ 10.1.0.201)

---

## 📑 สารบัญเอกสารคู่มือระบบ (Documentation Index)

เพื่อความสะดวกในการติดตั้ง พัฒนา และดูแลรักษาระบบ เอกสารได้ถูกแยกเป็น 5 หมวดหมู่หลักตามมาตรฐาน:

1. **[README.md](README.md)** : ภาพรวมระบบ สถาปัตยกรรม ฟังก์ชันเด่น และการเริ่มต้นใช้งานอย่างรวดเร็ว (Quick Start)
2. **[UPDATE.md](UPDATE.md)** : บันทึกการอัปเดตระบบ (Changelog & System Verification) รายละเอียดฟังก์ชันใหม่ การซิงค์บุคลากร 5 ฟิลด์ และการรองรับหลายกะ
3. **[INSTALLATION.md](INSTALLATION.md)** : คู่มือการติดตั้งระบบอย่างละเอียดทีละขั้นตอน (Prerequisites, Web App, C# Backend Service, Windows Service, IIS, Docker, FK623Attend.dll x86/x64 และ Firewall)
4. **[DATABASE.md](DATABASE.md)** : โครงสร้างฐานข้อมูลสมบูรณ์ (Database Architecture, DDL SQL, ตารางทั้งหมดใน `samchuk_attendance`, การกำหนดสิทธิ์บน `hosoffice`, Data Dictionary)
5. **[HOSOFFICE_SYNC.md](HOSOFFICE_SYNC.md)** : ระบบเชื่อมต่อและส่งข้อมูลเข้า `hosoffice` (HR Personnel Pull, ตรวจจับ 5 ฟิลด์, Manual Push เข้าตาราง `fingle_scan`, Idempotent Duplicate Check, Audit Log)

---

## 🏛️ สถาปัตยกรรมระบบ (System Architecture)

ระบบถูกออกแบบแยกส่วน (Decoupled Architecture) เพื่อความปลอดภัยสูงสุดของฐานข้อมูลโรงพยาบาล:

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           1. CLIENT / USER INTERFACE                            │
│  - Web Browser: React 18 + TypeScript + Vite + Tailwind CSS                      │
│  - Role-Based Access Control: ADMIN (Full Control) / USER (Personal Attendance) │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ HTTP / REST API (Port 3000 / 5000)
┌──────────────────────────────────────▼──────────────────────────────────────────┐
│                     2. APPLICATION & BACKEND API LAYER                          │
│  - C# ASP.NET Core 10 / Node.js Express Controller                              │
│  - Biometric Reader Worker: P/Invoke FK623Attend.dll (Win32 TCP Socket 5005)    │
│  - Attendance Engine: Multi-Shift Evaluation, Grace Period, Overtime Rules      │
│  - Sync & Push Manager: Personnel Reconciliation & Idempotent Push              │
└──────────────────────┬──────────────────────────────────┬───────────────────────┘
                       │                                  │
       TCP Socket 5005 │                  MySQL Connection│ (Port 3306)
┌──────────────────────▼──────────────┐  ┌────────────────▼───────────────────────┐
│     3. HARDWARE SCANNER LAYER       │  │          4. DATABASE LAYER             │
│  HIP CMiF68S #1: 10.1.0.101 (OPD)   │  │ [Database 1: Local Staging DB]         │
│  HIP CMiF68S #2: 10.1.0.102 (IPD)   │  │  - Database: samchuk_attendance        │
│  HIP CMiF68S #3: 10.1.0.103 (Admin) │  │  - Raw Scans, Shifts, Rosters, Results │
└─────────────────────────────────────┘  │                                        │
                                         │ [Database 2: HOSOffice @ 10.1.0.201]   │
                                         │  - hr_person, hr_position (SELECT Only)│
                                         │  - fingle_scan (INSERT Only via Push)  │
                                         └────────────────────────────────────────┘
```

---

## ⭐ จุดเด่นและฟังก์ชันสำคัญของระบบ

1. **ดึงข้อมูลบุคลากรจาก HOSOffice พร้อมระบบตรวจจับอัจฉริยะ (Personnel Directory & Reconciliation)**
   - ดึงข้อมูลอัตโนมัติจากฐานข้อมูล HOSOffice (`hr_person` และตาราง Lookups)
   - ป้องกันการดึงซ้ำ: ข้อมูลที่ตรงกันอยู่แล้วจะไม่ถูกเขียนทับให้เปลืองทรัพยากร
   - ตรวจจับความเปลี่ยนแปลง 5 ฟิลด์หลัก (`FULLNAME`, `HR_POSITION_NAME`, `HR_LEVEL_NAME`, `HR_DEPARTMENT_SUB`, `HR_PERSON_TYPE_NAME`) หากใน HOSOffice เปลี่ยน ระบบจะปรับปรุงฐานข้อมูลระบบสแกนนิ้วให้ตรงกันทันทีพร้อมอัปเดตสแนปช็อตในสแกนดิบ

2. **รองรับกะการทำงานหลายกะในวันเดียวกัน (Multi-Shift / Roster Support)**
   - บุคลากรทางการแพทย์สามารถขึ้นเวรได้หลายกะในวันเดียวกัน เช่น เวรเช้า (08:15 - 16:00) และเวรบ่าย (16:00 - 00:00)
   - มีระบบจัดตารางเวร (Roster Grid) และปุ่ม "จัดการ/เพิ่มกะวันนี้" ในหน้าทำเนียบบุคลากร
   - คำนวณเวลาเข้า-ออก สาย และ OT แยกอิสระตามแต่ละกะอย่างถูกต้อง

3. **เชื่อมต่อเครื่องสแกนนิ้ว HIP CMiF68S ผ่าน `FK623Attend.dll`**
   - รองรับการเชื่อมต่อเครื่องสแกน 3 จุดผ่าน TCP Port 5005
   - ใช้โมเดลตัวเลข Enroll ID (เช่น 57, 102) จับคู่กับ `FINGLE_ID` ในฐานข้อมูล
   - ดึง Log สแกนแบบ Background Worker และจัดเก็บใน Staging Database

4. **การส่งข้อมูลเข้า `hosoffice.fingle_scan` (Manual Push)**
   - ส่งข้อมูลเฉพาะสิทธิ์ ADMIN ป้องกันการส่งข้อมูลโดยไม่ได้ตรวจสอบ
   - ตรวจสอบความซ้ำซ้อนแบบ Idempotent (ไม่ส่งรายการสแกนซ้ำหากมีอยู่ใน HOSOffice แล้ว)
   - รองรับการกรองตามช่วงวันที่ หรือหมายเลขเครื่องสแกน พร้อมบันทึก Audit Log ชัดเจน

5. **ระบบความปลอดภัยและการควบคุมสิทธิ์ (Security & RBAC)**
   - บัญชี Admin: จัดการข้อมูลบุคลากร กะการทำงาน ตารางเวร ดึง/ส่งข้อมูล HOSOffice
   - บัญชี User: ดูสถิติการลงเวลา ประวัติสแกน และรายงานของตนเองเท่านั้น
   - ฐานข้อมูล HOSOffice ได้รับการคุ้มครองด้วยหลักการ Least Privilege (SELECT เฉพาะตาราง HR และ INSERT ได้เฉพาะตาราง `fingle_scan` ห้าม UPDATE/DELETE)

6. **รองรับภาษาไทย 100% ทั้งระบบและฐานข้อมูล (Full Thai Unicode & Charset Standard)**
   - ฐานข้อมูลใช้ `utf8mb4` และ Collation `utf8mb4_unicode_ci` (หรือ `utf8mb4_thai_520_w2` สำหรับการเรียง ก-ฮ ตามพจนานุกรมไทย)
   - จัดเก็บและแสดงผลชื่อ-สกุล ตำแหน่ง สังกัด สระบน สระล่าง และวรรณยุกต์ (ไม้เอก ไม้โท สระอำ สระอึ สระอุ สระอู) ครบถ้วน ไม่จม ไม่ลอย ไม่เพี้ยนเป็นภาษาต่างดาว (`???`)
   - รองรับการแลกเปลี่ยนข้อมูลกับฐานข้อมูล HOSOffice/HOSxP ทั้งแบบ UTF-8 และ TIS-620 (CP874) ได้อย่างราบรื่นไร้รอยต่อ

---

## 🚀 เริ่มต้นใช้งานและติดตั้งผ่าน GitHub (GitHub Quickstart & Installation)

### วิธีที่ 1: ติดตั้งอัตโนมัติด้วย One-Click Script บน Windows (แนะนำ)
เมื่อโคลนโปรเจกต์จาก GitHub มาแล้ว สามารถติดตั้งได้ทันทีใน 3 ขั้นตอน:
```bash
# 1. โคลน Repository จาก GitHub
git clone https://github.com/your-hospital-org/samchuk-attendance.git
cd samchuk-attendance

# 2. คลิกขวาที่ไฟล์ install.bat เลือก "Run as administrator"
# สคริปต์จะตรวจสอบ Git, Node.js, .NET SDK, คัดลอก .env, ติดตั้ง npm dependencies, และคอมไพล์โปรเจกต์อัตโนมัติ

# 3. นำเข้าฐานข้อมูลภาษาไทย 100% ด้วยสคริปต์
# ดับเบิลคลิก setup-database.bat เพื่อสร้างฐานข้อมูล samchuk_attendance (utf8mb4)
```

### วิธีที่ 2: ติดตั้งแบบ Manual ทีละขั้นตอน
```bash
# 1. โคลนและเข้าโฟลเดอร์
git clone https://github.com/your-hospital-org/samchuk-attendance.git
cd samchuk-attendance

# 2. คัดลอก Environment Variables
copy .env.example .env

# 3. ติดตั้งไลบรารี Node.js
npm install

# 4. นำเข้าฐานข้อมูล Staging (utf8mb4 รองรับภาษาไทย 100%)
mysql -u root -p --default-character-set=utf8mb4 < backend/SamchukAttendance.Database/Migrations/001_create_attendance_db.sql

# 5. วางไฟล์ FK623Attend.dll จาก SDK ของเครื่อง HIP CMiF68S ในโฟลเดอร์โปรเจกต์

# 6. รันเซิร์ฟเวอร์บนเครื่องเซิร์ฟเวอร์โรงพยาบาลสามชุก (IP: 10.2.0.13)
# 6.1 รัน Web Frontend (พอร์ต 3001 โฟลเดอร์ /Sam_Att/):
npm run serve:hospital

# 6.2 รัน Backend API Service (พอร์ต 3002):
dotnet run --project backend/SamchukAttendance.Api
```

### 🌐 ที่อยู่การเข้าถึงระบบจริงของโรงพยาบาลสามชุก (Hospital Production URLs)
- **Web User Interface (Frontend):** `https://10.2.0.13:3001/Sam_Att/`
  - ทำงานบนพอร์ต **3001** ผ่านโปรโตคอล **HTTPS**
  - จัดเก็บไฟล์และ Assets ใต้โฟลเดอร์ **`Sam_Att`** (`base: '/Sam_Att/'`)
- **API Gateway Service (Backend):** `https://10.2.0.13:3002`
  - ทำงานบนพอร์ต **3002** เป็นศูนย์กลางรับ-ส่งข้อมูลเวลา
  - ส่งข้อมูลเข้า `hosoffice.fingle_scan` ผ่าน `POST /api/push/batch`
  - ตรวจสอบสถานะการเชื่อมต่อผ่าน `GET /api/health`
  - สั่งอ่านและเชื่อมต่อเครื่องสแกน HIP CMiF68S (พอร์ต 5005) ผ่าน SDK `FK623Attend.dll`
- **สคริปต์เปิดระบบพร้อมกัน 1 คลิก:** ดับเบิลคลิก `start-hospital.bat` เพื่อรันทั้งหน้าเว็บและ API อัตโนมัติ

### การอัปเดตระบบในอนาคตผ่าน GitHub
```bash
# อัปเดตผ่านสคริปต์คลิกเดียว
update.bat

# หรือพิมพ์คำสั่ง Git
git pull origin main
npm install
npm run build
```

---

## 📂 โครงสร้างไดเรกทอรีโครงการ (Project Structure)

```text
├── README.md                          # [เอกสาร 1] ภาพรวมและสถาปัตยกรรมระบบ
├── UPDATE.md                          # [เอกสาร 2] บันทึกการอัปเดตและผลการทดสอบระบบ
├── INSTALLATION.md                    # [เอกสาร 3] คู่มือการติดตั้งระบบและไดรเวอร์สแกนนิ้ว
├── DATABASE.md                        # [เอกสาร 4] โครงสร้างฐานข้อมูล DDL และ Security
├── HOSOFFICE_SYNC.md                  # [เอกสาร 5] ระบบเชื่อมต่อและส่งข้อมูลเข้า hosoffice
│
├── backend/                           # โค้ด Backend API และ Worker (.NET 10 / C#)
│   ├── SamchukAttendance.Api/         # Web API และ Controller
│   │   ├── Controllers/               # Attendance, Personnel, Devices, Push Controllers
│   │   ├── Scanner/HIP/               # P/Invoke FK623Attend.dll Wrapper (ScannerReader.cs)
│   │   ├── Services/                  # Business Logic, Attendance Evaluation, Sync Engine
│   │   └── appsettings.json           # การตั้งค่า Connection Strings และ IP เครื่องสแกน
│   └── SamchukAttendance.Database/    # Database Scripts & Migrations
│       └── Migrations/
│           ├── 001_create_attendance_db.sql    # DDL Staging Database
│           └── 002_hosoffice_integration.sql   # SQL Integration & Grants
│
├── src/ / frontend/src/               # โค้ด Web Frontend (React + TypeScript)
│   ├── components/                    # คอมโพเนนต์ UI (Header, Navigation, Modals)
│   ├── pages/                         # หน้าจอหลักของระบบ
│   │   ├── AttendancePage.tsx         # หน้าบันทึกเวลาและการคำนวณรายวัน
│   │   ├── PersonnelPage.tsx          # หน้าทำเนียบบุคลากรและดึงข้อมูล HOSOffice
│   │   ├── ShiftsAndRosterPage.tsx    # หน้าจัดการกะและตารางเวร (Multi-Shift)
│   │   ├── PushToHosofficePage.tsx    # หน้าส่งข้อมูลเข้า fingle_scan
│   │   ├── DevicesPage.tsx            # หน้าตรวจสอบสถานะเครื่องสแกนนิ้ว 3 เครื่อง
│   │   └── MyAttendancePage.tsx       # หน้ารายงานเวลาปฏิบัติงานส่วนบุคคล
│   ├── services/                      # Data Stores & Business Calculation
│   └── types/                         # TypeScript Interface Definitions
```
