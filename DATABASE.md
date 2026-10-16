# สถาปัตยกรรมและการออกแบบฐานข้อมูล (DATABASE.md)
## ระบบจัดการเวลาปฏิบัติงานและเครื่องสแกนนิ้ว โรงพยาบาลสามชุก (v2)

เอกสารฉบับนี้อธิบายโครงสร้างฐานข้อมูล ความสัมพันธ์ของตาราง (Schema & Data Dictionary), คำสั่ง DDL SQL ทั้งหมด, และนโยบายการควบคุมสิทธิ์เพื่อความปลอดภัยสูงสุดของฐานข้อมูลโรงพยาบาล

---

## 1. สถาปัตยกรรมสองฐานข้อมูล (Two-Database Architecture Model)

เพื่อป้องกันไม่ให้การคำนวณเวลาการทำงานที่ซับซ้อน หรือการดึงข้อมูล Log สแกนนิ้วปริมาณมากกระทบต่อประสิทธิภาพของระบบบริการผู้ป่วยหลักของโรงพยาบาล ระบบจึงใช้รูปแบบสถาปัตยกรรมแยก 2 ฐานข้อมูล:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Attendance Database: samchuk_attendance (Staging & Rules DB)       │
│    - ติดตั้งบน: เซิร์ฟเวอร์ฐานข้อมูล 10.2.0.201 (MySQL Port 3306)        │
│    - สิทธิ์: Full Control (CREATE, ALTER, SELECT, INSERT, UPDATE)      │
│    - หน้าที่: พักข้อมูลสแกนดิบ, ตารางกะ, ตารางเวร, ผลการคำนวณเวลา, Log   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    │ Sync & Push Process
                                    │ (อ่าน HR / ส่ง fingle_scan)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. Hospital Production Database: hosoffice @ 10.2.0.201                │
│    - ติดตั้งบน: เซิร์ฟเวอร์ฐานข้อมูลกลางโรงพยาบาลสามชุก (Port 3306)    │
│    - สิทธิ์: จำกัดเฉพาะทาง (Least Privilege):                          │
│        • hr_person และ Lookups: สิทธิ์อ่านอย่างเดียว (SELECT Only)     │
│        • fingle_scan: สิทธิ์บันทึกและอ่าน (SELECT, INSERT Only)        │
│        • ห้ามมีสิทธิ์ UPDATE หรือ DELETE โดยเด็ดขาด                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. โครงสร้างตารางในฐานข้อมูล `samchuk_attendance` (Data Dictionary)

### 2.1 ตาราง `attendance_raw_scan` (บันทึกสแกนดิบจากเครื่องสแกน)
จัดเก็บข้อมูลดิบที่ดึงมาจากเครื่องสแกนนิ้ว HIP CMiF68S ทุกเครื่อง พร้อม Snapshot ข้อมูลบุคลากร ณ ขณะที่ทำการแมป
- **Primary Key:** `id` (BIGINT AUTO_INCREMENT)
- **Unique Key:** `uq_scan (fingle_id, scan_date_time)` (ป้องกันการบันทึกสแกนซ้ำจากเครื่อง)

| ชื่อฟิลด์ | ชนิดข้อมูล | ค่าว่าง (Null) | คำอธิบาย |
|---|---|:---:|---|
| `id` | BIGINT | NO | รหัสรายการอัตโนมัติ (Primary Key) |
| `machine_no` | INT | NO | หมายเลขเครื่องสแกน (1, 2, 3) |
| `device_ip` | VARCHAR(45) | YES | ไอพีเครื่องสแกน (เช่น 10.1.0.101) |
| `fingle_id` | INT | NO | รหัสสแกนนิ้ว (Enroll ID ของ HIP) |
| `scan_date_time` | DATETIME | NO | วันที่และเวลาที่สแกน (ปี ค.ศ.) |
| `verify_mode` | INT | YES | รูปแบบการยืนยัน (1=นิ้ว, 2=ใบหน้า, 3=รหัสผ่าน) |
| `in_out_mode` | INT | YES | โหมดเข้า-ออก (เก็บค่าดิบจากเครื่อง ห้ามตีความ) |
| `person_id` | INT | YES | รหัสบุคคล `ID` ในระบบ HOSOffice |
| `hr_fullname` | VARCHAR(255) | YES | Snapshot ชื่อ-สกุล ณ วันเวลาที่ดึง |
| `hr_position_name` | VARCHAR(255) | YES | Snapshot ตำแหน่ง |
| `hr_leavel_name` | VARCHAR(255) | YES | Snapshot ระดับ |
| `hr_dep_name` | VARCHAR(255) | YES | Snapshot กลุ่มงานหลัก |
| `hr_dep_sub_name` | VARCHAR(255) | YES | Snapshot หน่วยงานย่อย |
| `hr_person_type_name` | VARCHAR(255) | YES | Snapshot ประเภทบุคลากร |
| `hr_person_type_id` | INT | YES | รหัสประเภทบุคลากร |
| `hr_department_id` | INT | YES | รหัสกลุ่มงาน |
| `hr_department_sub_id` | INT | YES | รหัสหน่วยงานย่อย |
| `hr_mapped` | TINYINT(1) | NO | 1 = พบข้อมูลใน HR Person, 0 = ไม่พบ (Unmapped) |
| `push_status` | VARCHAR(20) | NO | สถานะการส่งเข้า HOSOffice: `PENDING`, `PUSHED`, `SKIPPED_EXISTS`, `FAILED` |
| `pushed_at` | DATETIME | YES | วันเวลาที่ส่งเข้า hosoffice สำเร็จ |
| `pushed_by` | INT | YES | รหัสผู้ดูแลระบบที่กดยืนยันส่งข้อมูล |
| `push_batch_id` | BIGINT | YES | อ้างอิงรหัส Batch ใน `attendance_push_batch` |
| `push_error` | TEXT | YES | ข้อความ Error (หากการส่งล้มเหลว) |
| `received_at` | DATETIME | NO | วันเวลาที่ระบบดึงข้อมูลจากเครื่องสแกนเข้ามาเก็บ |

---

### 2.2 ตาราง `attendance_shift` (กะการทำงาน)
- **Primary Key:** `id` (INT AUTO_INCREMENT)
- **Unique Key:** `shift_code` (VARCHAR(20))

| ชื่อฟิลด์ | ชนิดข้อมูล | ค่าว่าง (Null) | คำอธิบาย |
|---|---|:---:|---|
| `id` | INT | NO | รหัสกะ |
| `shift_code` | VARCHAR(20) | NO | รหัสย่อกะ (เช่น M, A, N, DAY) |
| `shift_name` | VARCHAR(100) | NO | ชื่อกะ (เช่น เวรเช้า, เวรบ่าย, เวรดึก) |
| `start_time` | TIME | NO | เวลาเริ่มกะ (เช่น 08:15:00) |
| `end_time` | TIME | NO | เวลาสิ้นสุดกะ (เช่น 16:00:00) |
| `crosses_midnight` | TINYINT(1) | NO | 1 = กะข้ามเที่ยงคืน (เช่น เวรดึก 00:00 - 08:00) |
| `late_grace_minutes` | INT | NO | ระยะเวลาผ่อนผันสาย (นาที) เช่น 0 หรือ 15 นาที |
| `in_window_before_min` | INT | NO | ช่วงเวลาอนุญาตให้สแกนเข้าก่อนเวลาเริ่ม (นาที) |
| `out_window_after_min` | INT | NO | ช่วงเวลาอนุญาตให้สแกนออกหลังเวลาสิ้นสุด (นาที) |
| `color` | VARCHAR(20) | YES | สีของ Badge กะสำหรับแสดงในหน้าเว็บ (HEX Code) |
| `is_active` | TINYINT(1) | NO | 1 = ใช้งาน, 0 = ระงับ |

---

### 2.3 ตาราง `attendance_person_roster` (ตารางเวรปฏิบัติงาน - รองรับหลายกะต่อคน)
- **Primary Key:** `id` (BIGINT AUTO_INCREMENT)
- **Unique Key:** `uq_roster (person_id, work_date, shift_id)`
- **จุดเด่น:** รองรับให้บุคลากร 1 คนสามารถมีหลายกะในวันเดียวกันได้ (เช่น เช้า + บ่าย ควบเวร) โดยระบบจะสร้างรายการแยกตาม `shift_id`

| ชื่อฟิลด์ | ชนิดข้อมูล | ค่าว่าง (Null) | คำอธิบาย |
|---|---|:---:|---|
| `id` | BIGINT | NO | รหัสตารางเวร |
| `person_id` | INT | NO | รหัสบุคลากร |
| `work_date` | DATE | NO | วันที่ปฏิบัติงาน (YYYY-MM-DD) |
| `shift_id` | INT | NO | รหัสกะที่ปฏิบัติงาน |
| `note` | VARCHAR(255) | YES | หมายเหตุเพิ่มเติม (เช่น เวรแทน, เวรเสริมพิเศษ) |
| `created_by` | INT | YES | รหัสผู้จัดเวร |

---

### 2.4 ตาราง `attendance_daily_result` (ผลการประมวลผลการลงเวลารายกะ)
- **Primary Key:** `id` (BIGINT AUTO_INCREMENT)
- **Unique Key:** `uq_day (person_id, work_date, shift_id)`

| ชื่อฟิลด์ | ชนิดข้อมูล | ค่าว่าง (Null) | คำอธิบาย |
|---|---|:---:|---|
| `id` | BIGINT | NO | รหัสผลการคำนวณ |
| `person_id` | INT | NO | รหัสบุคลากร |
| `work_date` | DATE | NO | วันที่ปฏิบัติงาน |
| `shift_id` | INT | YES | รหัสกะที่ประมวลผล |
| `in_time` | DATETIME | YES | เวลาสแกนเข้างานที่ตรงตามเงื่อนไขของกะ |
| `out_time` | DATETIME | YES | เวลาสแกนออกงานที่ตรงตามเงื่อนไขของกะ |
| `status` | VARCHAR(30) | YES | สถานะ: `ON_TIME`, `LATE`, `EARLY_LEAVE`, `NO_SCAN`, `NO_OUT` |
| `late_minutes` | INT | YES | จำนวนนาทีที่มาสาย |
| `ot_minutes` | INT | YES | จำนวนนาทีที่ทำล่วงเวลา |
| `calculated_at` | DATETIME | NO | วันเวลาที่ทำการคำนวณ |

---

### 2.5 ตาราง `attendance_push_batch` (ประวัติการส่งข้อมูลเข้า HOSOffice)
- **Primary Key:** `id` (BIGINT AUTO_INCREMENT)

| ชื่อฟิลด์ | ชนิดข้อมูล | ค่าว่าง (Null) | คำอธิบาย |
|---|---|:---:|---|
| `id` | BIGINT | NO | รหัสชุดการส่งข้อมูล (Batch ID) |
| `requested_by` | VARCHAR(100) | NO | ผู้ดูแลระบบที่กดยืนยันการส่ง |
| `requested_at` | DATETIME | NO | วันเวลาที่สั่งส่งข้อมูล |
| `filter_date_from` | DATE | YES | กรองตั้งแต่วันที่ |
| `filter_date_to` | DATE | YES | กรองถึงวันที่ |
| `filter_machine_no` | INT | YES | กรองตามหมายเลขเครื่อง |
| `total_selected` | INT | NO | จำนวนรายการสแกนทั้งหมดที่ถูกเลือก |
| `success_count` | INT | NO | จำนวนรายการที่ส่งเข้า `fingle_scan` สำเร็จ |
| `skipped_count` | INT | NO | จำนวนรายการที่ข้าม (เนื่องจากมีใน HOSOffice แล้ว) |
| `failed_count` | INT | NO | จำนวนรายการที่เกิดข้อผิดพลาด |
| `status` | VARCHAR(20) | NO | สถานะ Batch: `COMPLETED`, `PARTIAL`, `FAILED` |

---

## 3. โครงสร้างตารางในฐานข้อมูล HOSOffice (`hosoffice` @ 10.2.0.201)

### 3.1 ตาราง `fingle_scan` (ตารางรับข้อมูลสแกนนิ้วกลางของโรงพยาบาล)
ตารางนี้คือตารางเป้าหมายที่ระบบจะส่งข้อมูลเข้าไป โดยมีสเปกฟิลด์สำคัญดังนี้:

| ชื่อฟิลด์ใน fingle_scan | ชนิดข้อมูล | แหล่งที่มา / ค่าที่ส่งเข้า |
|---|---|---|
| `PERSON_ID` | INT | รหัสบุคลากรจาก `hr_person.ID` |
| `FINGLE_ID` | INT | รหัสสแกนนิ้วจากเครื่องสแกน |
| `SCAN_DATE_TIME` | DATETIME | วันที่และเวลาที่สแกนจริง |
| `SCAN_DATE` | DATE | วันที่สแกน (ตัดเฉพาะวันที่) |
| `SCAN_TIME` | TIME | เวลาสแกน (ตัดเฉพาะเวลา) |
| `DAY_TYPE_ID` | INT | 1 (วันทำงานปกติ) หรือ 2 (วันหยุด/วันหยุดนักขัตฤกษ์) |
| `DAY_TYPE_NAME` | VARCHAR(50) | 'วันปกติ' หรือ 'วันหยุด' |
| `HR_FULLNAME` | VARCHAR(255) | คำนำหน้า + ชื่อ + นามสกุล |
| `HR_POSITION_NAME` | VARCHAR(255) | ตำแหน่ง |
| `HR_LEAVEL_NAME` | VARCHAR(255) | ระดับ |
| `HR_DEP_NAME` | VARCHAR(255) | กลุ่มงานหลัก |
| `HR_DEP_SUB_NAME` | VARCHAR(255) | หน่วยงานย่อย |
| `HR_PERSON_TYPE_NAME` | VARCHAR(255) | ประเภทบุคลากร (เช่น ข้าราชการ, พนักงานกระทรวง) |
| `HR_PERSON_TYPE_ID` | INT | รหัสประเภทบุคลากร |
| `HR_DEPARTMENT_ID` | INT | รหัสกลุ่มงาน |
| `HR_DEPARTMENT_SUB_ID` | INT | รหัสหน่วยงานย่อย |
| `MACHIN_ID` | INT | หมายเลขเครื่องสแกน (1, 2, 3) |
| `APP_TYPE_SAVE` | VARCHAR(20) | **'SCAN'** (ค่าคงที่ตามมาตรฐานระบบ) |
| `SCAN_SOURCE` | VARCHAR(20) | **'FINGER'** (ค่าคงที่) |
| `ISCONFIRM` | INT | **1** (ยืนยันแล้ว) |
| `ISINPUT` | VARCHAR(20) | **'SIGN'** (ค่าคงที่ตามระบบ HOSOffice) |
| `DATE_TIME_SAVE` | DATETIME | `NOW()` (เวลาที่ส่งข้อมูลเข้า) |
| `CREATE_BY` | VARCHAR(50) | **'SCAN_PUSH'** (หรือรหัสผู้ส่งข้อมูล) |

---

## 4. คำสั่ง DDL SQL ฉบับเต็มสำหรับสร้างฐานข้อมูล (UTF-8 / UTF8MB4 ภาษาไทย 100%)

```sql
-- กำหนด Character Set สำหรับ Session ในการรันสคริปต์
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET CHARACTER SET utf8mb4;

-- สร้างฐานข้อมูล samchuk_attendance
CREATE DATABASE IF NOT EXISTS samchuk_attendance 
DEFAULT CHARACTER SET utf8mb4 
DEFAULT COLLATE utf8mb4_unicode_ci;

USE samchuk_attendance;

-- 1. ตารางสแกนดิบ (Staging)
CREATE TABLE IF NOT EXISTS attendance_raw_scan (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    machine_no INT NOT NULL,
    device_ip VARCHAR(45) NULL,
    fingle_id INT NOT NULL,
    scan_date_time DATETIME NOT NULL,
    verify_mode INT NULL,
    in_out_mode INT NULL,
    person_id INT NULL,
    hr_fullname VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    hr_position_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    hr_leavel_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    hr_dep_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    hr_dep_sub_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    hr_person_type_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    hr_person_type_id INT NULL,
    hr_department_id INT NULL,
    hr_department_sub_id INT NULL,
    hr_mapped TINYINT(1) NOT NULL DEFAULT 0,
    push_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    pushed_at DATETIME NULL,
    pushed_by INT NULL,
    push_batch_id BIGINT NULL,
    push_error TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    received_at DATETIME NOT NULL,
    UNIQUE KEY uq_scan (fingle_id, scan_date_time),
    KEY idx_push_status (push_status),
    KEY idx_scan_date (scan_date_time),
    KEY idx_person (person_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. ตารางกะการทำงาน
CREATE TABLE IF NOT EXISTS attendance_shift (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shift_code VARCHAR(20) NOT NULL UNIQUE,
    shift_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    crosses_midnight TINYINT(1) NOT NULL DEFAULT 0,
    work_date_basis VARCHAR(10) NOT NULL DEFAULT 'START_DATE',
    late_grace_minutes INT NOT NULL DEFAULT 0,
    in_window_before_min INT NOT NULL DEFAULT 120,
    out_window_after_min INT NOT NULL DEFAULT 120,
    early_leave_min INT NOT NULL DEFAULT 0,
    duplicate_scan_min INT NOT NULL DEFAULT 5,
    color VARCHAR(20) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. ตารางกลุ่มบุคลากร
CREATE TABLE IF NOT EXISTS attendance_personnel_group (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    group_kind VARCHAR(20) NOT NULL,
    priority INT NOT NULL DEFAULT 100,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    note VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. ตารางตารางเวร (Multi-Shift Supported)
CREATE TABLE IF NOT EXISTS attendance_person_roster (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    person_id INT NOT NULL,
    work_date DATE NOT NULL,
    shift_id INT NOT NULL,
    note VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    created_by INT NULL,
    UNIQUE KEY uq_roster (person_id, work_date, shift_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. ตารางผลการคำนวณเวลา
CREATE TABLE IF NOT EXISTS attendance_daily_result (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    person_id INT NOT NULL,
    work_date DATE NOT NULL,
    shift_id INT NULL,
    in_time DATETIME NULL,
    out_time DATETIME NULL,
    status VARCHAR(30) NULL,
    late_minutes INT NULL,
    ot_minutes INT NULL,
    calculated_at DATETIME NOT NULL,
    UNIQUE KEY uq_day (person_id, work_date, shift_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. ตารางประวัติการส่งข้อมูลเข้า HOSOffice
CREATE TABLE IF NOT EXISTS attendance_push_batch (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    requested_by VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    requested_at DATETIME NOT NULL,
    filter_date_from DATE NULL,
    filter_date_to DATE NULL,
    filter_machine_no INT NULL,
    total_selected INT NOT NULL DEFAULT 0,
    total_inserted INT NOT NULL DEFAULT 0,
    total_skipped_exists INT NOT NULL DEFAULT 0,
    total_failed INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    finished_at DATETIME NULL,
    error_message TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 5. มาตรฐานและการกำหนดค่าให้ฐานข้อมูลรองรับภาษาไทย 100% (100% Thai Language Compatibility Architecture)

เพื่อให้ระบบฐานข้อมูลจัดเก็บ ค้นหา จัดเรียง และแลกเปลี่ยนข้อมูลภาษาไทยร่วมกับ HOSOffice / HOSxP ได้อย่างถูกต้องสมบูรณ์แบบ โดยไม่มีปัญหาตัวอักษรเพี้ยนเป็นภาษาต่างดาว (`???` หรือ `à¸ªà¸²à¸¡à¸Šà¸¸à¸`), สระจม, สระลอย หรือสระซ้อน ระบบได้วางมาตรฐาน 5 ประการดังนี้:

### 5.1 การเลือกใช้ชุดอักขระ (Character Set) และ Collation
- **Database Character Set:** เลือกใช้ `utf8mb4` ซึ่งเป็น Unicode UTF-8 เต็มรูปแบบ (รองรับ 4 Bytes) รองรับอักขระภาษาไทยทุกตัว ทั้งพยัญชนะ สระ วรรณยุกต์ (ไม้เอก ไม้โท ไม้ตรี ไม้จัตวา สระอำ สระอึ สระอุ สระอู) รวมถึงเครื่องหมายวรรคตอนและสัญลักษณ์พิเศษ
- **Database Collation:**
  - ค่าเริ่มต้น: `utf8mb4_unicode_ci` (มาตรฐานสากล ทำงานได้กับ MySQL 5.7, 8.0, 8.4 และ MariaDB ทุกรุ่น)
  - ตัวเลือกขั้นสูง: `utf8mb4_thai_520_w2` (สำหรับ MySQL 8.0+ ที่ต้องการจัดเรียง ก-ฮ ตามพจนานุกรมฉบับราชบัณฑิตยสภาอย่างแม่นยำ 100%)
- **Table & Column Level:** ทุกตารางระบุ `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;` อย่างชัดเจน เพื่อป้องกันการที่ MySQL Server ใช้ค่า Default เป็น `latin1` หรือ `tis620` เมื่อสร้างตารางใหม่

### 5.2 การกำหนดค่า Connection Strings ใน .NET / C# Web API
ในไฟล์ `appsettings.json` หรือ Environment Variables ต้องระบุพารามิเตอร์ `CharSet=utf8mb4;` เสมอ:

```json
{
  "ConnectionStrings": {
    "AttendanceDb": "Server=10.2.0.201;Port=3306;Database=samchuk_attendance;User ID=attendance_app;Password=YOUR_ATTENDANCE_DB_PASSWORD;CharSet=utf8mb4;TreatTinyAsBoolean=false;SslMode=Preferred;",
    "HosOffice": "Server=10.2.0.201;Port=3306;Database=hosoffice;User ID=samchuk_sync;Password=YOUR_HOSOFFICE_PASSWORD;CharSet=utf8mb4;TreatTinyAsBoolean=false;AllowUserVariables=True;"
  }
}
```

> **หมายเหตุสำหรับฐานข้อมูล HOSxP / HOSOffice เดิมที่เป็น TIS-620:**  
> หากเซิร์ฟเวอร์ฐานข้อมูลหลักของโรงพยาบาลเดิมติดตั้งด้วย Charset `tis620` (เช่น HOSxP V3 เดิม) ให้ตั้งค่าการเชื่อมต่อของ HOSOffice เป็น:  
> `CharSet=tis620;` หรือ `CharSet=utf8;`  
> โดยตัวไดรเวอร์ ADO.NET (MySqlConnector) จะแปลงรหัสอักขระ (Transcoding) ระหว่าง TIS-620 ของฐานข้อมูล และ UTF-8 ของระบบ Web Application ให้อัตโนมัติ ทำให้ภาษาไทยไม่ผิดเพี้ยน

### 5.3 การตั้งค่า MySQL Server Configuration (`my.cnf` หรือ `my.ini`)
สำหรับเซิร์ฟเวอร์ MySQL/MariaDB ของระบบลงเวลา แนะนำให้ตั้งค่าในไฟล์คอนฟิกดังนี้:

```ini
[client]
default-character-set = utf8mb4

[mysql]
default-character-set = utf8mb4

[mysqld]
character-set-client-handshake = FALSE
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
init_connect='SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci'
```

### 5.4 คำสั่งตรวจสอบสถานะการรองรับภาษาไทยใน MySQL (Health Check Query)
สามารถรันคำสั่ง SQL ต่อไปนี้เพื่อตรวจสอบว่าฐานข้อมูลทำงานด้วย UTF-8 / UTF8MB4 ถูกต้อง 100%:

```sql
-- 1. ตรวจสอบ Character Set ของ Server, Database และ Client Connection
SHOW VARIABLES LIKE 'character_set%';

-- ค่าที่ควรได้:
-- character_set_client     | utf8mb4
-- character_set_connection | utf8mb4
-- character_set_database   | utf8mb4
-- character_set_results    | utf8mb4
-- character_set_server     | utf8mb4

-- 2. ตรวจสอบ Collation
SHOW VARIABLES LIKE 'collation%';

-- 3. ทดสอบการบันทึกและอ่านสระ วรรณยุกต์ ภาษาไทย (Sanity Check)
SELECT 'โรงพยาบาลสามชุก ทดสอบภาษาไทย ๑๒๓๔๕๖๗๘๙๐ สระอำ สระอึ สระอุ สระอู ไม้เอก ไม้โท ไม้ตรี ไม้จัตวา' AS thai_test;
```

### 5.5 สรุปข้อดีของการรองรับภาษาไทย 100%
1. **ชื่อ-สกุล บุคลากรถูกต้องทุกตำแหน่ง:** ตัวอักษรพิเศษ เช่น `ณ`, `ญ`, `ฎ`, `ฏ`, ฐ, ฑ, ฒ, ณ, สระ `อำ`, `อุ`, `อู` และวรรณยุกต์ ไม่ตกหล่น
2. **การค้นหาและกรองข้อมูลแม่นยำ:** สามารถพิมพ์ค้นหาชื่อบุคลากรหรือสังกัดภาษาไทยในหน้าเว็บได้ทันที โดยไม่มีปัญหา Case-sensitivity หรือ Diacritics
3. **การส่งข้อมูลเข้า HOSOffice ไร้รอยต่อ:** ฟิลด์ `HR_FULLNAME`, `HR_POSITION_NAME`, `HR_DEP_NAME`, `DAY_TYPE_NAME` เข้าสู่ตาราง `fingle_scan` อย่างสมบูรณ์พร้อมนำไปใช้ออกรายงานของโรงพยาบาลได้ทันที

