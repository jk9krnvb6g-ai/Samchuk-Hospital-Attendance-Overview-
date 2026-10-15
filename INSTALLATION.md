# คู่มือการติดตั้งระบบอย่างละเอียด (INSTALLATION.md)
## ระบบจัดการเวลาปฏิบัติงานและเครื่องสแกนนิ้ว โรงพยาบาลสามชุก (v2)

เอกสารฉบับนี้อธิบายขั้นตอนการติดตั้งระบบตั้งแต่เริ่มต้นจนถึงพร้อมใช้งานในสภาพแวดล้อมจริง (Production Environment) ครอบคลุมทั้งฝั่งเครื่องแม่ข่าย (Server), ฐานข้อมูล, ไลบรารีเครื่องสแกนนิ้ว (`FK623Attend.dll`), C# Backend Service, และ Web Frontend

---

## 1. ข้อกำหนดของระบบ (System Requirements & Prerequisites)

### 1.1 ความต้องการด้านฮาร์ดแวร์และระบบปฏิบัติการ
- **ระบบปฏิบัติการ:** Windows Server 2019 / 2022 หรือ Windows 10/11 Pro (64-bit)
- **หน่วยประมวลผล (CPU):** 4 Cores ขึ้นไป (Intel Xeon / Core i5 หรือเทียบเท่า)
- **หน่วยความจำ (RAM):** 8 GB ขึ้นไป (แนะนำ 16 GB ขึ้นไป)
- **พื้นที่จัดเก็บข้อมูล (Storage):** SSD พื้นที่ว่างอย่างน้อย 50 GB สำหรับบันทึก Log และฐานข้อมูล Staging
- **ระบบเครือข่าย:** การเชื่อมต่อ LAN ความเร็ว 1 Gbps ภายในวงเครือข่ายโรงพยาบาล

### 1.2 ซอฟต์แวร์ที่ต้องติดตั้งล่วงหน้า (Prerequisites Software)
| ซอฟต์แวร์ | เวอร์ชันที่รองรับ | ลิงก์ดาวน์โหลด / แหล่งที่มา | วัตถุประสงค์ |
|---|---|---|---|
| **.NET SDK / Runtime** | .NET 10.0 (หรือ .NET 8.0 LTS) | [Microsoft .NET Download](https://dotnet.microsoft.com/download) | สำหรับรัน C# Backend Service & Worker |
| **Node.js** | v20.x หรือ v22.x LTS | [Node.js Official](https://nodejs.org/) | สำหรับคอมไพล์และรัน Web Frontend |
| **MySQL Server** | MySQL 8.0+ หรือ MariaDB 10.5+ | [MySQL Community](https://dev.mysql.com/downloads/) | จัดเก็บฐานข้อมูล Staging (`samchuk_attendance`) |
| **VC++ Redistributable** | 2013 (x86) และ 2015–2022 (x86) | [Microsoft Visual C++](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) | จำเป็นสำหรับ `FK623Attend.dll` (ห้ามข้าม) |

---

## 2. การจัดการไฟล์ไดรเวอร์เครื่องสแกนนิ้ว `FK623Attend.dll`

### 2.1 ไฟล์ที่ได้จากการแตก zip SDK ของเครื่อง HIP CMiF68S
เมื่อแตกไฟล์ zip จะพบไฟล์ไลบรารีดังนี้:
1. `FK623Attend.dll` - ไฟล์ไลบรารีหลักสำหรับต่อ Socket Port 5005
2. `FKAttend.dll` หรือ `RealandAttend.dll` - โมดูลถอดรหัสแพ็กเก็ตข้อมูล
3. `msvcr120.dll` / `msvcp120.dll` - ไฟล์ C++ Runtime (หากมีใน zip ให้วางไว้คู่กัน)

### 2.2 การจัดการสถาปัตยกรรม (x86 vs x64)
เครื่องสแกน HIP CMiF68S ใช้ DLL ที่คอมไพล์แบบ **32-bit (x86)** เป็นมาตรฐาน หากนำไปรันบนกระบวนการแบบ 64-bit จะเกิดข้อผิดพลาด:
```text
System.BadImageFormatException: An attempt was made to load a program with an incorrect format. (Exception from HRESULT: 0x8007000B)
```

**วิธีแก้ไข:**
กำหนดให้โปรเจกต์ `SamchukAttendance.Api.csproj` คอมไพล์ในโหมด x86:
```xml
<PropertyGroup>
  <TargetFramework>net10.0</TargetFramework>
  <PlatformTarget>x86</PlatformTarget>
  <Nullable>enable</Nullable>
  <ImplicitUsings>enable</ImplicitUsings>
</PropertyGroup>
```

### 2.3 ตำแหน่งการวางไฟล์ DLL
- **ตำแหน่งแนะนำ:** วางไฟล์ `FK623Attend.dll` (และไฟล์ `.dll` ที่ติดมาใน zip) ไว้ในโฟลเดอร์เดียวกันกับไฟล์ `.exe` ของ Backend Service หลัง Publish เช่น:
  ```text
  C:\SamchukAttendance\Api\FK623Attend.dll
  C:\SamchukAttendance\Api\SamchukAttendance.Api.exe
  ```
- **ตำแหน่งระดับระบบ (System-wide):** หากต้องการให้ระบบมองเห็นในทุกที่:
  - บน Windows 64-bit: คัดลอกไปวางที่ `C:\Windows\SysWOW64\` (สำหรับ 32-bit DLL)
  - บน Windows 32-bit: คัดลอกไปวางที่ `C:\Windows\System32\`

---

## 3. ขั้นตอนการติดตั้งฐานข้อมูล (Database Setup)

ระบบแบ่งออกเป็น 2 ฐานข้อมูล โดยติดตั้งตามขั้นตอนต่อไปนี้ (ดูรายละเอียดเพิ่มเติมใน [DATABASE.md](DATABASE.md)):

### 3.1 การสร้างฐานข้อมูล Staging (`samchuk_attendance`)
เข้าสู่ MySQL Server บนเครื่องเซิร์ฟเวอร์ระบบลงเวลา แล้วรันไฟล์สคริปต์ (ระบุ `--default-character-set=utf8mb4` เพื่อรับรองภาษาไทย 100%):
```bash
mysql -u root -p --default-character-set=utf8mb4 < backend/SamchukAttendance.Database/Migrations/001_create_attendance_db.sql
```
คำสั่งนี้จะสร้าง Database `samchuk_attendance` ด้วย Character Set `utf8mb4` และ Collation `utf8mb4_unicode_ci` พร้อมตารางที่เกี่ยวข้องครบถ้วน

### 3.2 การกำหนดสิทธิ์บนฐานข้อมูล HOSOffice (`hosoffice` @ 10.1.0.201)
เข้าสู่เซิร์ฟเวอร์ฐานข้อมูล HOSOffice แล้วรันคำสั่งกำหนดสิทธิ์ตามหลักความปลอดภัย:
```sql
-- 1. สร้างผู้ใช้สำหรับระบบสแกนเวลา (หากยังไม่มี)
CREATE USER IF NOT EXISTS 'samchuk_app'@'10.1.0.%' IDENTIFIED BY 'StrongPassword123#';

-- 2. กำหนดสิทธิ์อ่านข้อมูลบุคลากร (Read-Only บนตาราง HR)
GRANT SELECT ON hosoffice.hr_person TO 'samchuk_app'@'10.1.0.%';
GRANT SELECT ON hosoffice.hr_prefix TO 'samchuk_app'@'10.1.0.%';
GRANT SELECT ON hosoffice.hr_position TO 'samchuk_app'@'10.1.0.%';
GRANT SELECT ON hosoffice.hr_level TO 'samchuk_app'@'10.1.0.%';
GRANT SELECT ON hosoffice.hr_department TO 'samchuk_app'@'10.1.0.%';
GRANT SELECT ON hosoffice.hr_department_sub TO 'samchuk_app'@'10.1.0.%';
GRANT SELECT ON hosoffice.hr_person_type TO 'samchuk_app'@'10.1.0.%';

-- 3. กำหนดสิทธิ์ส่งข้อมูลเข้าตารางสแกนนิ้ว (เฉพาะ SELECT และ INSERT เท่านั้น ห้าม UPDATE หรือ DELETE)
GRANT SELECT, INSERT ON hosoffice.fingle_scan TO 'samchuk_app'@'10.1.0.%';

-- 4. นำสิทธิ์ไปใช้งาน
FLUSH PRIVILEGES;
```

---

## 4. การติดตั้งและตั้งค่า Backend Service (C# .NET 10)

### 4.1 ปรับแต่งไฟล์ `appsettings.json`
เข้าไปที่โฟลเดอร์ `backend/SamchukAttendance.Api/appsettings.json` และกำหนดค่าการเชื่อมต่อ (ระบุ `CharSet=utf8mb4;` เพื่อให้ภาษาไทยถูกต้อง 100%):
```json
{
  "ConnectionStrings": {
    "AttendanceDb": "Server=localhost;Port=3306;Database=samchuk_attendance;User ID=attendance_app;Password=YOUR_ATTENDANCE_DB_PASSWORD;CharSet=utf8mb4;TreatTinyAsBoolean=false;SslMode=Preferred;",
    "HosOffice": "Server=10.1.0.201;Port=3306;Database=hosoffice;User ID=samchuk_sync;Password=YOUR_HOSOFFICE_PASSWORD;CharSet=utf8mb4;TreatTinyAsBoolean=false;AllowUserVariables=True;"
  },
  "ScannerSettings": {
    "Port": 5005,
    "TimeoutMs": 3000,
    "Devices": [
      { "MachineNo": 1, "IpAddress": "10.1.0.101", "Name": "เครื่องสแกน OPD ประตูหน้า" },
      { "MachineNo": 2, "IpAddress": "10.1.0.102", "Name": "เครื่องสแกน IPD อาคารผู้ป่วยใน" },
      { "MachineNo": 3, "IpAddress": "10.1.0.103", "Name": "เครื่องสแกน ฝ่ายบริหาร" }
    ],
    "PollingIntervalSeconds": 60
  },
  "Kestrel": {
    "Endpoints": {
      "Http": {
        "Url": "http://0.0.0.0:5000"
      }
    }
  }
}
```

### 4.2 คอมไพล์และ Publish โปรเจกต์
เปิด PowerShell หรือ Terminal และรันคำสั่ง:
```powershell
cd backend\SamchukAttendance.Api
dotnet restore
dotnet publish -c Release -r win-x86 --self-contained false -o C:\SamchukAttendance\Api
```

### 4.3 นำไฟล์ `FK623Attend.dll` ไปวาง
คัดลอกไฟล์ `FK623Attend.dll` และไฟล์เสริมจาก SDK ไปวางไว้ใน `C:\SamchukAttendance\Api\`

### 4.4 ติดตั้งเป็น Windows Service (ทำงานอัตโนมัติเมื่อเปิดเครื่อง)
เปิด Command Prompt หรือ PowerShell ในสิทธิ์ Administrator:
```powershell
# สร้าง Service
sc.exe create SamchukAttendanceService binPath= "C:\SamchukAttendance\Api\SamchukAttendance.Api.exe" start= auto DisplayName= "Samchuk Attendance & Biometric Service"

# ตั้งค่าให้รีสตาร์ทตัวเองอัตโนมัติกรณีพบข้อผิดพลาด
sc.exe failure SamchukAttendanceService reset= 86400 actions= restart/60000/restart/60000/restart/60000

# เริ่มต้นการทำงานของ Service
sc.exe start SamchukAttendanceService
```

---

## 5. การติดตั้งและ Build Web Frontend

### 5.1 คอมไพล์แอปพลิเคชัน Frontend
```bash
# ติดตั้งไลบรารี
npm install

# ตรวจสอบโค้ด
npm run lint

# สร้าง Production Bundle
npm run build
```
เมื่อคำสั่งทำงานเสร็จสิ้น ไฟล์หน้าเว็บที่คอมไพล์แล้วจะอยู่ในโฟลเดอร์ `dist/`

### 5.2 การนำไป Host บน Web Server (IIS หรือ Nginx)
- **กรณีใช้ IIS:**
  1. สร้าง Website ใหม่ใน IIS ชี้ทางกายภาพไปยังโฟลเดอร์ `C:\SamchukAttendance\dist`
  2. ติดตั้งโมดูล `URL Rewrite`
  3. ใส่ไฟล์ `web.config` สำหรับรองรับ Single Page Application (SPA Routing)
- **กรณีใช้ Node.js Serve:**
  ```bash
  npm run preview -- --host 0.0.0.0 --port 3000
  ```

---

## 6. การตั้งค่าระบบเครือข่ายและไฟร์วอลล์ (Network & Firewall)

รันคำสั่ง PowerShell บน Windows Server เพื่อเปิดพอร์ตที่จำเป็น:
```powershell
# 1. อนุญาตให้ติดต่อเครื่องสแกนนิ้วภายนอก (TCP Port 5005)
New-NetFirewallRule -DisplayName "HIP Scanner Outbound Port 5005" -Direction Outbound -LocalPort Any -Protocol TCP -RemotePort 5005 -Action Allow

# 2. อนุญาตให้เครื่องลูกข่ายเข้าใช้งาน Web Frontend (Port 3000)
New-NetFirewallRule -DisplayName "Attendance Web HTTP Port 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow

# 3. อนุญาตให้เชื่อมต่อ Backend API (Port 5000)
New-NetFirewallRule -DisplayName "Attendance API HTTP Port 5000" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow
```

---

## 7. ตรวจสอบความถูกต้องหลังการติดตั้ง (Post-Installation Health Check)

1. **ทดสอบเครื่องสแกน:** เข้าเมนู **"สถานะเครื่องสแกน"** และกดปุ่ม "ทดสอบการเชื่อมต่อ" ระบบต้องขึ้นสถานะ **ONLINE** ทั้ง 3 เครื่อง
2. **ทดสอบการดึงข้อมูล HOSOffice:** เข้าเมนู **"ข้อมูลบุคลากรและรหัสสแกนนิ้ว"** และกดปุ่ม **"ดึงข้อมูลจาก HOSOffice"** ตรวจสอบว่ามีข้อมูลบุคลากรขึ้นครบถ้วน
3. **ทดสอบการบันทึกกะ:** ตรวจสอบการเพิ่มกะหลายกะในวันเดียวว่าบันทึกได้สำเร็จ
4. **ทดสอบส่งข้อมูลเข้า `hosoffice.fingle_scan`:** ทดสอบกดส่งข้อมูล 1 รายการ และตรวจสอบในตาราง `fingle_scan` ของ HOSOffice ว่าข้อมูลเข้าครบ 22 ฟิลด์
