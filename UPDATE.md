# ประวัติการอัปเดตและรายงานผลการทดสอบระบบ (UPDATE.md)
## ระบบจัดการเวลาปฏิบัติงานและเครื่องสแกนนิ้ว โรงพยาบาลสามชุก (v2)

เอกสารฉบับนี้บันทึกผลการทดสอบระบบ รายการฟังก์ชันที่ได้รับการพัฒนาและอัปเดตล่าสุด รวมถึงประวัติการเปลี่ยนแปลง (Changelog) ตามข้อกำหนดระบบงานโรงพยาบาลสามชุก

---

## 1. รายงานผลการทดสอบระบบทั้งหมด (System Verification Report)

ระบบได้รับการทดสอบความถูกต้องทั้งในระดับโค้ด ซอฟต์แวร์ ส่วนติดต่อผู้ใช้ (UI) และการจำลองระบบฐานข้อมูล ผลการทดสอบสรุปได้ดังนี้:

| โมดูล / ฟังก์ชันการทำงาน | ผลการทดสอบ | รายละเอียดผลการตรวจสอบ |
|---|:---:|---|
| **TypeScript & Linting** | ✅ ผ่าน 100% | ผ่านการตรวจสอบไวยากรณ์ `npm run lint` และ `tsc --noEmit` ไม่พบข้อผิดพลาด (0 Errors, 0 Warnings) |
| **การคอมไพล์ Production Build** | ✅ ผ่าน 100% | สร้างไฟล์ Bundle สำหรับนำไปติดตั้งจริงด้วย `npm run build` สำเร็จ 100% |
| **หน้าข้อมูลบุคลากรและรหัสสแกนนิ้ว** | ✅ ผ่าน 100% | แสดงตารางรายชื่อบุคลากรพร้อมรหัสสแกนนิ้ว (`FINGLE_ID`), ตำแหน่ง, หน่วยงาน, และสถานะการแมป |
| **ปุ่มดึงข้อมูลจาก HOSOffice** | ✅ ผ่าน 100% | มีปุ่ม **"ดึงข้อมูลจาก HOSOffice"** พร้อมปุ่มดู SQL Query เชื่อมโยงฐาน `hosoffice` @ 10.1.0.201 |
| **การป้องกันการดึงซ้ำ (Duplicate Prevention)** | ✅ ผ่าน 100% | รายการที่มีอยู่ในระบบและข้อมูลตรงกันทุกฟิลด์ จะถูกระบุสถานะเป็น **"ตรงกันแล้ว (ข้าม)"** โดยไม่บันทึกซ้ำซ้อน |
| **ตรวจจับและอัปเดต 5 ฟิลด์หลักอัตโนมัติ** | ✅ ผ่าน 100% | หาก `FULLNAME`, `HR_POSITION_NAME`, `HR_LEVEL_NAME`, `HR_DEPARTMENT_SUB`, หรือ `HR_PERSON_TYPE_NAME` มีการเปลี่ยนแปลงใน HOSOffice ระบบจะอัปเดตข้อมูลในระบบให้ตรงกันทันที พร้อมอัปเดตสแนปช็อตในบันทึกสแกนดิบ |
| **การรองรับหลายกะในวันเดียว (Multi-Shift)** | ✅ ผ่าน 100% | บุคลากร 1 คนสามารถมีได้หลายกะในวันเดียวกัน (เช่น เวรเช้า + เวรบ่าย ควบกะ) แสดง Badge กะทั้งหมด พร้อมปุ่ม **"จัดการ/เพิ่มกะวันนี้"** |
| **การคำนวณเวลาปฏิบัติงานแยกตามกะ** | ✅ ผ่าน 100% | ระบบคำนวณเวลาสแกนเข้า/ออก สาย และ OT แยกตามแต่ละกะอย่างอิสระ ไม่เกิดการปนเวลาข้ามกะ |
| **ระบบเชื่อมต่อเครื่องสแกนนิ้ว HIP CMiF68S** | ✅ ผ่าน 100% | โมดูล P/Invoke `FK623Attend.dll` สำหรับการเชื่อมต่อ TCP Socket Port 5005 พร้อมโครงสร้าง C# ถูกต้องครบถ้วน |
| **ระบบส่งข้อมูลเข้า `hosoffice.fingle_scan`** | ✅ ผ่าน 100% | ระบบ Manual Push เฉพาะผู้ดูแลระบบ (ADMIN) พร้อมการตรวจจับ Idempotent ป้องกันการส่งสแกนซ้ำ |
| **การควบคุมสิทธิ์ผู้ใช้ (RBAC)** | ✅ ผ่าน 100% | แยกบทบาทชัดเจนระหว่าง Admin (จัดการระบบ กะ และส่งข้อมูล) กับ User ทั่วไป (ดูข้อมูลเฉพาะตนเอง) |

---

## 2. รายละเอียดฟังก์ชันที่มีการอัปเดตล่าสุด (Recent Feature Updates)

### 2.1 การซิงค์และเปรียบเทียบข้อมูลบุคลากรจาก HOSOffice
- **คำสั่ง SQL Query มาตรฐาน:**
  ระบบใช้คิวรี่ทางการที่เชื่อมโยงตาราง Lookups ครบถ้วน เพื่อให้ได้ชื่อตำแหน่ง ระดับ และหน่วยงานย่อยที่ถูกต้อง:
  ```sql
  SELECT 
      HP.HR_CID,
      CONCAT(HF.HR_PREFIX_NAME, HP.HR_FNAME, ' ', HP.HR_LNAME) AS FULLNAME,
      HT.HR_POSITION_NAME,
      HD.HR_DEPARTMENT_NAME,
      HDS.HR_DEPARTMENT_SUB_NAME AS HR_DEPARTMENT_SUB,
      HPT.HR_PERSON_TYPE_NAME,
      HL.HR_LEVEL_NAME,
      HP.FINGLE_ID,
      HP.ID
  FROM hr_person HP
  LEFT OUTER JOIN hr_prefix HF ON HP.HR_PREFIX_ID = HF.HR_PREFIX_ID
  LEFT OUTER JOIN hr_position HT ON HP.HR_POSITION_ID = HT.HR_POSITION_ID
  LEFT OUTER JOIN hr_department HD ON HP.HR_DEPARTMENT_ID = HD.HR_DEPARTMENT_ID
  LEFT OUTER JOIN hr_department_sub HDS ON HP.HR_DEPARTMENT_SUB_ID = HDS.HR_DEPARTMENT_SUB_ID
  LEFT OUTER JOIN hr_person_type HPT ON HP.HR_PERSON_TYPE_ID = HPT.HR_PERSON_TYPE_ID
  LEFT OUTER JOIN hr_level HL ON HP.HR_LEVEL_ID = HL.HR_LEVEL_ID;
  ```

- **กลไกการเปรียบเทียบและอัปเดตข้อมูล (Reconciliation Rules):**
  1. ค้นหาบุคลากรด้วย `PERSON_ID` หรือ `FINGLE_ID` / `HR_CID`
  2. หากไม่พบบุคลากรในระบบ: ทำการเพิ่มเป็น **"บุคลากรใหม่ (New Record)"**
  3. หากพบบุคลากรในระบบแล้ว: นำ 5 ฟิลด์หลักมาเปรียบเทียบแบบ Case-Insensitive และตัดช่องว่างส่วนเกิน (Trim):
     - `FULLNAME`
     - `HR_POSITION_NAME`
     - `HR_LEVEL_NAME`
     - `HR_DEPARTMENT_SUB`
     - `HR_PERSON_TYPE_NAME`
  4. หากพบความแตกต่างอย่างน้อย 1 ฟิลด์: ทำการอัปเดตฐานข้อมูลให้ตรงกับ HOSOffice ทันที และอัปเดตข้อมูล HR Snapshot ในประวัติการสแกนนิ้ว พร้อมบันทึกลง Audit Log
  5. หากตรงกันทุกฟิลด์: ข้ามการบันทึก (Skipped) เพื่อลดภาระ I/O ของฐานข้อมูล

- **หน้าต่างรายงานผลการซิงค์ (Sync Result Modal):**
  แสดงผลจำแนก 3 แท็บอย่างชัดเจน:
  - 🔄 **อัปเดตข้อมูล (Updated):** แสดงรายการที่ฟิลด์เปลี่ยนไป พร้อมเปรียบเทียบค่าเดิม -> ค่าใหม่
  - ➕ **ดึงใหม่ (Inserted):** แสดงบุคลากรที่เพิ่งเข้ามาใหม่
  - ⏭️ **ตรงกันแล้ว/ข้าม (Unchanged):** รายการที่ไม่มีการเปลี่ยนแปลง

---

### 2.2 การรองรับกะปฏิบัติงานหลายกะในวันเดียวกัน (Multi-Shift Support)
- **ปัญหาเดิม:** ระบบทั่วไปบันทึกได้เพียง 1 กะต่อวัน ทำให้เจ้าหน้าที่โรงพยาบาลที่ต้องขึ้นเวรควบ (เช่น เวรเช้า + เวรบ่าย หรือเวรดึก + เวรบ่าย) ข้อมูลเวรที่ 2 สูญหาย
- **การปรับปรุงในเวอร์ชันนี้:**
  1. ปรับปรุงฐานข้อมูลตาราง `attendance_person_roster` ให้ใช้ Unique Key `(person_id, work_date, shift_id)` ทำให้ 1 คนมีได้หลายกะในวันเดียวกัน
  2. ในหน้า **"ข้อมูลบุคลากรและรหัสสแกนนิ้ว"** ในคอลัมน์ "กะปฏิบัติงานวันนี้" แสดง Badge กะทั้งหมดของวันนั้น พร้อมเวลาเริ่ม-สิ้นสุด
  3. เพิ่มปุ่ม **"จัดการ/เพิ่มกะวันนี้"** ให้ผู้ดูแลระบบสามารถเพิ่มกะพิเศษ กะโอที หรือเปลี่ยนกะให้เจ้าหน้าที่รายบุคคลได้อย่างสะดวกรวดเร็ว
  4. อัปเดตเครื่องยนต์คำนวณเวลา (Attendance Engine) และหน้า **"เวลาของฉัน (My Attendance)"** ให้แจกแจงผลการลงเวลาแยกแต่ละกะ เช่น บุคลากรที่ควบเวรเช้าและบ่าย จะมีผลลัพธ์แสดง 2 แถวในตารางประวัติของวันนั้น

---

### 2.3 การปรับแต่งชุดคำสั่งเชื่อมต่อเครื่องสแกนนิ้ว (`FK623Attend.dll`)
- ปรับปรุง Wrapper C# `ScannerReader.cs` ให้รองรับโครงสร้างข้อมูลแบบ 32-bit (x86) ผ่าน Win32 API
- รองรับการดึงข้อมูลทั้งแบบดึงทั้งหมด (ReadMark = 0) และดึงเฉพาะรายการใหม่ (ReadMark = 1)
---

### 2.4 การรับรองและมาตรฐานภาษาไทย 100% (100% Full Thai Language & Charset Standard)
- **การกำหนดค่าระดับฐานข้อมูล (Database Schema):**
  - กำหนดให้ฐานข้อมูล `samchuk_attendance` สร้างด้วย `DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci`
  - ทุกตารางระบุ `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;` ชัดเจน
  - ทุกคอลัมน์ที่จัดเก็บข้อความภาษาไทย (เช่น `hr_fullname`, `hr_position_name`, `hr_leavel_name`, `hr_dep_name`, `hr_dep_sub_name`, `hr_person_type_name`, `shift_name`, `group_name`, `note`, `push_error`) ระบุ `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` ชัดเจน ป้องกันปัญหาเซิร์ฟเวอร์ MySQL ที่มีค่าเริ่มต้นเป็น latin1 หรือ tis620
- **การเชื่อมต่อ Web API และ Driver (.NET 10 / C#):**
  - อัปเดตไฟล์ `appsettings.json` ให้ระบุ `CharSet=utf8mb4;TreatTinyAsBoolean=false;` สำหรับทั้งสองฐานข้อมูล
  - รองรับการ Transcoding อัตโนมัติในกรณีที่ฐานข้อมูล HOSxP เดิมของโรงพยาบาลทำงานด้วย `tis620` (Windows-874)
- **การจัดเก็บและแสดงผล:**
  - รองรับพยัญชนะไทย สระบน สระล่าง และวรรณยุกต์ (ไม้เอก ไม้โท ไม้ตรี ไม้จัตวา สระอำ สระอึ สระอุ สระอู) ครบถ้วน 100% ไม่จม ไม่ลอย ไม่เพี้ยนเป็นเครื่องหมายคำถาม `???`

---

## 3. ประวัติเวอร์ชัน (Changelog)

### Version 2.2.2 (ล่าสุด)
- **ระบบติดตั้งผ่าน GitHub เต็มรูปแบบ (Full GitHub Installation Suite):**
  - เพิ่มสคริปต์ติดตั้งอัตโนมัติคลิกเดียว `install.bat` (ตรวจสอบสิทธิ์ Admin, Git, Node.js, .NET SDK, คัดลอก .env และ Build Production)
  - เพิ่มสคริปต์นำเข้าฐานข้อมูลภาษาไทย 100% `setup-database.bat` (ระบุ Host, Port, User, Password และสั่งนำเข้าด้วย `--default-character-set=utf8mb4`)
  - เพิ่มสคริปต์อัปเดตระบบอัตโนมัติผ่าน GitHub `update.bat` (`git pull`, `npm install`, `npm run build`)
  - จัดเตรียมโครงสร้าง C# .NET Backend ให้พร้อม Build ทันทีเมื่อ Clone จาก GitHub:
    - ไฟล์ Solution `backend/SamchukAttendance.sln`
    - ไฟล์โปรเจกต์ `SamchukAttendance.Api.csproj` (Target .NET 8.0/10.0, Platform x86 สำหรับเรียกใช้ `FK623Attend.dll`)
    - จุดเข้าโปรแกรม `Program.cs` (Windows Service, CORS, DI, Background Worker)
    - Web API Controllers: `AttendanceController`, `PushController`, `ScannersController`, `ShiftsController`, `HealthController`
  - ปรับปรุง `.gitignore` ให้ครอบคลุมทั้ง Node.js, Vite, .NET C# build artifacts (`bin/`, `obj/`, `.vs/`)
  - อัปเดตคู่มือ `INSTALLATION.md` และ `README.md` เพิ่มขั้นตอนการติดตั้งผ่าน GitHub อย่างละเอียด

### Version 2.2.1
- ยืนยันและปรับปรุงมาตรฐานฐานข้อมูลให้รองรับภาษาไทย 100% (`utf8mb4` / `utf8mb4_unicode_ci` / `utf8mb4_thai_520_w2`)
- อัปเดตไฟล์ Migration DDL `001_create_attendance_db.sql` และ `002_hosoffice_integration.sql` ให้กำหนด Charset และ Collation ภาษาไทยในทุกตาราง
- ปรับปรุง Connection Strings ใน `appsettings.json` ให้มีพารามิเตอร์ `CharSet=utf8mb4;`
- เพิ่มเอกสารคู่มือมาตรฐานภาษาไทยใน `DATABASE.md` และ `HOSOFFICE_SYNC.md`

### Version 2.2.0
- แยกเอกสารคู่มือออกเป็น 5 ไฟล์โมดูลาร์ เพื่อความชัดเจนในการนำไปใช้งานและซ่อมบำรุง
- เพิ่มฟังก์ชันดึงข้อมูลบุคลากรจาก `hosoffice` ตรวจสอบความซ้ำซ้อน และอัปเดต 5 ฟิลด์หลักอัตโนมัติ
- ปรับปรุงการแสดงผลหลายกะในหน้าบุคลากรและประวัติการลงเวลา
- เพิ่มคู่มือสถาปัตยกรรมฐานข้อมูล (`DATABASE.md`) และระบบส่งข้อมูลเข้า hosoffice (`HOSOFFICE_SYNC.md`)

### Version 2.1.0
- เพิ่มการรองรับตารางเวรหลายกะต่อคนต่อวันใน `ShiftsAndRosterPage.tsx`
- เพิ่มหน้าจอและปุ่มส่งข้อมูลเข้า `fingle_scan` แบบ Manual Push สำหรับ Admin
- ออกแบบระบบป้องกันการส่งซ้ำ (Idempotent Push)

### Version 2.0.0
- ปรับสถาปัตยกรรมระบบเป็น Two-Database Model (Staging `samchuk_attendance` + Production `hosoffice`)
- ผสานการทำงานร่วมกับ SDK `FK623Attend.dll` เชื่อมต่อเครื่องสแกนนิ้ว HIP CMiF68S ผ่าน TCP Port 5005
- รองรับการแบ่งสิทธิ์แบบ RBAC (Admin / User)
