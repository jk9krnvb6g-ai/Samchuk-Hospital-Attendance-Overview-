# สถาปัตยกรรม Backend ระบบจัดการเวลาปฏิบัติงานและเครื่องสแกนนิ้ว โรงพยาบาลสามชุก (v2)

โครงสร้างโฟลเดอร์ Backend นี้ถูกจัดเตรียมไว้อย่างเป็นระเบียบตามมาตรฐาน ASP.NET Core 10 (C#) สำหรับนำไป Deploy บน Windows Server และเชื่อมต่อกับเครื่องสแกน HIP CMiF68S

```text
backend/
├── SamchukAttendance.Api/                 # Web API Service หลัก
│   ├── Controllers/                      # REST API Endpoints ตามสเปกข้อ 29
│   │   ├── AttendanceController.cs       # คำนวณเวลา, Daily, Monthly Attendance
│   │   ├── PushController.cs             # ปุ่มส่งข้อมูลเข้า hosoffice (ADMIN Only)
│   │   ├── ScannersController.cs         # จัดการเครื่องสแกน 1-3, ทดสอบ ConnectNet
│   │   └── ShiftsController.cs           # จัดการกะ, กลุ่มบุคลากร, Roster
│   ├── Services/                         # Business Logic
│   │   ├── AttendanceCalculator.cs       # ⚡ ประมวลผลเวลาทันทีเมื่อดึงข้อมูล (Option 1)
│   │   ├── ShiftService.cs               # Resolution Order 4 ลำดับ
│   │   └── PushService.cs                # Idempotent Push ไปยัง hosoffice
│   ├── BackgroundServices/
│   │   └── ScannerBackgroundService.cs   # ดึง Log อัตโนมัติทุก 1 นาที + Auto Calculate
│   └── Scanner/HIP/
│       └── ScannerReader.cs              # P/Invoke เชื่อมต่อ FK623Attend.dll (TCP 5005)
└── SamchukAttendance.Database/           # ฐานข้อมูลและ Script DDL
    └── Migrations/
        ├── 001_create_attendance_db.sql  # สร้างฐานข้อมูล Attendance DB (Staging + Config)
        └── 002_hosoffice_integration.sql # คำสั่ง Query บน hosoffice (hr_person & fingle_scan)
```

---

## จุดเด่นของ Backend ตามแนวทางที่ 1 (Auto-Calculate upon Sync)

1. **ดึงข้อมูลแล้วประมวลผลทันที:**
   เมื่อ `ScannerBackgroundService` เชื่อมต่อเครื่องสแกนและดึงข้อมูลลง `attendance_raw_scan` สำเร็จ ระบบจะเรียก `AttendanceCalculator.CalculateDailyAttendanceAsync()` ทันที ทำให้ผลการเข้างาน/สาย ปรากฏบนหน้าจอ Real-time โดยไม่ต้องรอกดปุ่มคำนวณ

2. **ความปลอดภัยของฐานข้อมูล hosoffice:**
   การประมวลผลเวลาทำงานทั้งหมดเกิดขึ้นใน `Attendance DB` ของระบบเท่านั้น **ไม่มีการเขียนลง MySQL hosoffice อัตโนมัติเด็ดขาด** (ต้องรอ ADMIN กดปุ่มในหน้าเว็บเท่านั้น ตามข้อกำหนด v2)

3. **Client ไม่ต้องติดตั้งโปรแกรม:**
   Backend เป็นตัวกลางในการสื่อสารกับ Native DLL (`FK623Attend.dll`) และ Database ทั้งหมด ผู้ใช้งานโรงพยาบาลสามชุกเข้าใช้งานผ่าน Web Browser (Chrome / Edge) เท่านั้น
