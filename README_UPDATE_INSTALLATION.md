# สารบัญคู่มือระบบจัดการเวลาปฏิบัติงาน โรงพยาบาลสามชุก (v2)

> ℹ️ **หมายเหตุ:** ตามโครงสร้างการจัดการเอกสารระบบ ไฟล์ `README_UPDATE_INSTALLATION.md` ได้ถูกจัดหมวดหมู่และแยกออกเป็น 5 เอกสารหลัก เพื่อความชัดเจนและสะดวกในการนำไปใช้งาน ติดตั้ง และดูแลรักษา:

---

### 📚 เอกสารคู่มือทั้ง 5 ส่วน:

1. **[1. README.md](README.md)**
   - ภาพรวมของระบบ สถาปัตยกรรม (System Architecture)
   - แผนผังเครือข่ายและการไหลของข้อมูล
   - เทคโนโลยีที่ใช้ (React, TypeScript, C# .NET, MySQL)
   - โครงสร้างโปรเจกต์และคำสั่ง Quick Start

2. **[2. UPDATE.md](UPDATE.md)**
   - บันทึกประวัติการพัฒนาและอัปเดตระบบ (Changelog)
   - รายงานผลการทดสอบระบบทั้งหมด (System Verification Report) ผ่าน 100%
   - รายละเอียดฟังก์ชันดึงข้อมูลบุคลากร และการตรวจจับ 5 ฟิลด์หลักอัตโนมัติ
   - การรองรับกะปฏิบัติงานหลายกะในวันเดียว (Multi-Shift) สำหรับบุคลากรทางการแพทย์

3. **[3. INSTALLATION.md](INSTALLATION.md)**
   - ข้อกำหนดของระบบและฮาร์ดแวร์ (Prerequisites: Node.js, .NET 10, MySQL, VC++ Redistributable)
   - การจัดการไฟล์ `FK623Attend.dll` จาก zip SDK และการคอมไพล์โหมด 32-bit (x86)
   - การติดตั้ง C# Backend Service, Windows Service (sc.exe) และการตั้งค่าบน IIS
   - การ Build Web Frontend และการเปิดพอร์ต Firewall (Port 5005, 3306, 3000, 5000)

4. **[4. DATABASE.md (ฐานข้อมูล)](DATABASE.md)**
   - สถาปัตยกรรมแยก 2 ฐานข้อมูล (Two-Database Architecture):
     - `samchuk_attendance` (Local Staging DB)
     - `hosoffice` @ 10.1.0.201 (Hospital Core DB)
   - มาตรฐานการรองรับภาษาไทย 100% (UTF8MB4, utf8mb4_unicode_ci, utf8mb4_thai_520_w2 ป้องกันสระลอย/ตัวอักษรต่างดาว)
   - Data Dictionary และโครงสร้าง Schema รายตาราง
   - คำสั่ง DDL SQL ฉบับเต็มสำหรับสร้างฐานข้อมูลและตารางทั้งหมด
   - นโยบายความปลอดภัยและคำสั่งกำหนดสิทธิ์ (Least Privilege Grants)

5. **[5. HOSOFFICE_SYNC.md (ส่งข้อมูล เข้า hosoffice)](HOSOFFICE_SYNC.md)**
   - **ขาเข้า (Inbound):** คำสั่ง SQL Query ดึงบุคลากรจาก `hr_person` และการตรวจสอบความซ้ำซ้อน ไม่ดึงซ้ำ
   - การตรวจจับและปรับปรุง 5 ฟิลด์หลัก (`FULLNAME`, `HR_POSITION_NAME`, `HR_LEVEL_NAME`, `HR_DEPARTMENT_SUB`, `HR_PERSON_TYPE_NAME`)
   - **ขาออก (Outbound):** คำสั่ง INSERT และสเปก 22 ฟิลด์เข้าตาราง `hosoffice.fingle_scan`
   - ระบบตรวจสอบความซ้ำซ้อนระดับ Idempotent ป้องกันการบันทึกสแกนซ้ำ
   - ขั้นตอนการทำงานแบบ Manual Push เฉพาะผู้ดูแลระบบ (ADMIN) และการเก็บประวัติ Batch Log
