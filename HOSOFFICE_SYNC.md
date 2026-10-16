# การเชื่อมต่อ ซิงค์บุคลากร และส่งข้อมูลเข้า HOSOffice (HOSOFFICE_SYNC.md)
## ระบบจัดการเวลาปฏิบัติงานและเครื่องสแกนนิ้ว โรงพยาบาลสามชุก (v2)

เอกสารฉบับนี้อธิบายกระบวนการแลกเปลี่ยนข้อมูลระหว่างระบบลงเวลากับฐานข้อมูลหลักของโรงพยาบาล `hosoffice` @ 10.2.0.201 ทั้ง 2 ทิศทางอย่างละเอียด:
1. **ขาเข้า (Inbound):** การดึงและตรวจสอบข้อมูลบุคลากรจาก HOSOffice พร้อมระบบตรวจจับความเปลี่ยนแปลง 5 ฟิลด์หลัก
2. **ขาออก (Outbound):** การส่งข้อมูลเวลาสแกนนิ้วเข้าตาราง `fingle_scan` แบบ Idempotent พร้อมบันทึกประวัติการส่ง

---

## 1. ภาพรวมสถาปัตยกรรมการเชื่อมต่อ (Integration Flow)

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        HOSOFFICE @ 10.2.0.201                          │
│                                                                        │
│   [ตารางข้อมูลบุคลากร: hr_*]                 [ตารางสแกนนิ้วกลาง]        │
│    - hr_person, hr_position                 - fingle_scan              │
│    - hr_department, hr_department_sub       (เป้าหมายการส่งข้อมูล)      │
│    - hr_person_type, hr_level                                          │
└──────────────┬─────────────────────────────────────────▲───────────────┘
               │                                         │
     [ขาเข้า: ดึงบุคลากร]                        [ขาออก: ส่งสแกนนิ้ว]
     SELECT คิวรี่บุคลากร                        INSERT เฉพาะสิทธิ์ ADMIN
     เปรียบเทียบ 5 ฟิลด์หลัก                     ตรวจสอบ Idempotent ป้องกันซ้ำ
               │                                         │
┌──────────────▼─────────────────────────────────────────┴───────────────┐
│              ระบบลงเวลาโรงพยาบาลสามชุก (SAMCHUK ATTENDANCE)             │
│                                                                        │
│  - Personnel Directory: อัปเดตข้อมูลให้ตรงกับ HOSOffice ทันที          │
│  - Multi-Shift Roster: รองรับบุคลากร 1 คนปฏิบัติงานได้หลายกะในวันเดียว │
│  - Raw Scans & Results: จัดเก็บประวัติสแกนดิบและผลการคำนวณรายกะ        │
│  - Push Manager: หน้าต่างกรองวันที่/เครื่อง และสรุปผลการส่งข้อมูล       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. ขาเข้า: การดึงและซิงค์ข้อมูลบุคลากร (HR Personnel Reconciliation)

### 2.1 คำสั่ง SQL Query ดึงบุคลากรจาก HOSOffice
ระบบส่งคำสั่ง SQL ไปยัง `hosoffice` ผ่านพอร์ต 3306 เพื่อดึงข้อมูลบุคลากรพร้อมชื่อเต็มจากตาราง Lookups:

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

---

### 2.2 กฎการตรวจสอบข้อมูล (Reconciliation & Duplicate Prevention Rules)

เมื่อผู้ดูแลระบบกดปุ่ม **"ดึงข้อมูลจาก HOSOffice"** ระบบจะทำงานตามขั้นตอนดังนี้:

```text
วนลูปข้อมูลบุคลากรแต่ละคนจาก HOSOffice
   │
   ├─► พบบุคลากรนี้ในระบบลงเวลาหรือไม่?
   │     ├─► [ไม่พบ]: บันทึกเป็น "บุคลากรใหม่" (New Insert)
   │     │
   │     └─► [พบแล้ว]: ตรวจสอบ 5 ฟิลด์หลัก
   │           │
   │           ├─► [ฟิลด์ใดฟิลด์หนึ่งเปลี่ยนไป]:
   │           │     1. ปรับปรุงฐานข้อมูลเราให้ตรงกับ HOSOffice ทันที
   │           │     2. อัปเดต HR Snapshot ในตารางสแกนดิบ (attendance_raw_scan)
   │           │     3. บันทึกลง Audit Log
   │           │     4. นับเข้ากลุ่ม "อัปเดตข้อมูล (Updated)"
   │           │
   │           └─► [ตรงกันทั้งหมดทุกฟิลด์]:
   │                 1. ไม่ต้องทำอะไร (Skip)
   │                 2. นับเข้ากลุ่ม "ตรงกันแล้ว (ข้าม)" เพื่อประหยัดทรัพยากร
```

### 2.3 รายละเอียด 5 ฟิลด์หลักที่ตรวจสอบความเปลี่ยนแปลง
1. **`FULLNAME` (ชื่อ - สกุล):** ตรวจจับการเปลี่ยนคำนำหน้าชื่อ เปลี่ยนชื่อตัว หรือเปลี่ยนนามสกุล
2. **`HR_POSITION_NAME` (ตำแหน่ง):** ตรวจจับการเลื่อนขั้น ย้ายตำแหน่ง หรือเปลี่ยนสายงาน
3. **`HR_LEVEL_NAME` (ระดับ):** ตรวจจับการปรับระดับ เช่น ชำนาญการ, เชี่ยวชาญ
4. **`HR_DEPARTMENT_SUB` (กลุ่มงานหลัก / หน่วยงานย่อย):** ตรวจจับการย้ายแผนก/วอร์ด
5. **`HR_PERSON_TYPE_NAME` (ประเภทบุคลากร):** ตรวจจับการเปลี่ยนสถานะ เช่น จากลูกจ้างชั่วคราวเป็นพนักงานกระทรวง หรือข้าราชการ

---

### 2.4 การจัดการกะปฏิบัติงานวันนี้ (รองรับหลายกะต่อคน)
ในการซิงค์ข้อมูลบุคลากร ระบบจะเชื่อมโยงเข้ากับระบบตารางเวร (Roster) ประจำวัน:
- บุคลากร 1 คนสามารถมีกะปฏิบัติงานได้มากกว่า 1 กะในวันเดียวกัน (เช่น เช้า + บ่าย)
- ผู้ดูแลระบบสามารถกดปุ่ม **"จัดการ/เพิ่มกะวันนี้"** ได้โดยตรงจากหน้าทำเนียบบุคลากร
- ตารางจะแสดง Badge กะทั้งหมด เช่น `[M] 08:15-16:00` และ `[A] 16:00-00:00` พร้อมสถานะการขึ้นเวร

---

## 3. ขาออก: การส่งข้อมูลเข้า `hosoffice.fingle_scan` (Manual Push)

### 3.1 ทำไมต้องส่งข้อมูลแบบ Manual Push โดย Admin เท่านั้น?
ตามข้อกำหนดด้านความปลอดภัยและความถูกต้องทางเวชระเบียนของโรงพยาบาล:
1. ป้องกันไม่ให้รายการสแกนที่ยังไม่สมบูรณ์ หรือสแกนผิดพลาดถูกบันทึกเข้าฐานข้อมูลกลางทันที
2. เปิดโอกาสให้ผู้รับผิดชอบงานทรัพยากรบุคคล (HR) ได้ตรวจสอบความถูกต้องและจัดการกรณีพิเศษ (เช่น ลืมสแกน, ขอลา) ก่อนส่งข้อมูล
3. ไม่ส่งผลกระทบต่อภาระการทำงาน (Locking/Deadlock) ของฐานข้อมูลหลักในชั่วโมงเร่งด่วน

---

### 3.2 สเปกคำสั่ง INSERT และการแมปฟิลด์เข้า `fingle_scan`

คำสั่ง SQL ที่ระบบใช้ส่งข้อมูลไปยัง `hosoffice.fingle_scan`:

```sql
INSERT INTO hosoffice.fingle_scan (
    PERSON_ID, FINGLE_ID, SCAN_DATE_TIME, SCAN_DATE, SCAN_TIME,
    DAY_TYPE_ID, DAY_TYPE_NAME,
    HR_FULLNAME, HR_POSITION_NAME, HR_LEAVEL_NAME, HR_DEP_NAME, HR_DEP_SUB_NAME, HR_PERSON_TYPE_NAME,
    HR_PERSON_TYPE_ID, HR_DEPARTMENT_ID, HR_DEPARTMENT_SUB_ID,
    MACHIN_ID,
    APP_TYPE_SAVE, SCAN_SOURCE,
    ISCONFIRM, ISINPUT,
    DATE_TIME_SAVE, CREATE_BY
) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?,
    'SCAN', 'FINGER',
    1, 'SIGN',
    NOW(), 'SCAN_PUSH'
);
```

#### รายละเอียดค่าคงที่และมาตรฐานที่กำหนด:
- `APP_TYPE_SAVE` = **'SCAN'** (ระบุว่ามาจากระบบสแกนเวลา)
- `SCAN_SOURCE` = **'FINGER'** (ระบุประเภทเครื่องสแกนชีวมิติ)
- `ISCONFIRM` = **1** (สถานะยืนยันข้อมูลแล้ว)
- `ISINPUT` = **'SIGN'** (ประเภทการลงเวลาทำงาน)
- `CREATE_BY` = **'SCAN_PUSH'** (หรือระบุ Username ของผู้ดูแลระบบที่กดส่ง)
- `DATE_TIME_SAVE` = วันเวลาที่ส่งคำสั่ง (`NOW()`)

---

### 3.3 ระบบป้องกันการส่งข้อมูลซ้ำ (Idempotency Check)

ก่อนที่ระบบจะยิงคำสั่ง `INSERT` รายการสแกนใดๆ ระบบจะทำการตรวจสอบล่วงหน้าเสมอ:

```sql
SELECT COUNT(*) 
FROM hosoffice.fingle_scan 
WHERE (PERSON_ID = ? OR FINGLE_ID = ?) 
  AND SCAN_DATE_TIME = ?;
```

- **หากผลลัพธ์ > 0:** แสดงว่ารายการสแกนนี้มีอยู่ใน `fingle_scan` แล้ว
  - ระบบจะ **ไม่ส่งซ้ำ**
  - ปรับสถานะใน `attendance_raw_scan` เป็น `SKIPPED_EXISTS`
  - เพิ่มตัวเลขนับในช่อง "ข้าม (ส่งแล้ว)" ใน Batch Summary
- **หากผลลัพธ์ = 0:**
  - ยิงคำสั่ง `INSERT`
  - เมื่อบันทึกสำเร็จ ปรับสถานะเป็น `PUSHED` พร้อมบันทึก `pushed_at` และ `push_batch_id`

---

## 4. ขั้นตอนการใช้งานฟังก์ชันส่งข้อมูลบนหน้าจอระบบ (UI Steps)

1. เข้าสู่ระบบด้วยสิทธิ์ **ADMIN**
2. เลือกเมนู **"ส่งข้อมูลเข้า HOSOffice"** (`/push-to-hosoffice`)
3. **กำหนดเงื่อนไขการส่งข้อมูล:**
   - เลือกช่วงวันที่ (เช่น วันนี้, ย้อนหลัง 7 วัน หรือระบุวันที่เอง)
   - เลือกเครื่องสแกน (ทั้งหมด หรือระบุเครื่อง 1, 2, 3)
   - เลือกตัวกรองสถานะ (แนะนำ: เฉพาะรายการที่ยังไม่ได้ส่ง - `PENDING`)
4. กดปุ่ม **"ตรวจสอบข้อมูลก่อนส่ง (Preview)"**
   - ระบบจะแสดงจำนวนรายการทั้งหมด, รายการที่ส่งได้ทันที, และรายการที่ส่งไปแล้ว
5. กดปุ่ม **"ยืนยันส่งข้อมูลเข้า HOSOffice (Push Data)"**
   - ระบบจะประมวลผลเป็นชุด (Batch Processing)
   - แสดงแถบความคืบหน้า (Progress Bar) และรายงานผลแบบเรียลไทม์
6. เมื่อการส่งเสร็จสมบูรณ์ ระบบจะสร้างรายการบันทึกในตาราง **"ประวัติการส่งข้อมูล (Push History)"** เพื่อใช้ตรวจสอบย้อนหลัง

---

## 5. การตั้งค่าสิทธิ์และความปลอดภัยบนเซิร์ฟเวอร์ MySQL HOSOffice

เพื่อความปลอดภัยสูงสุดของฐานข้อมูลโรงพยาบาลสามชุก ผู้ดูแลระบบฐานข้อมูลควรให้สิทธิ์เฉพาะเจาะจงแก่ระบบลงเวลาเท่านั้น:

```sql
-- กำหนดสิทธิ์ให้ผู้ใช้ระบบสแกน
REVOKE ALL PRIVILEGES ON hosoffice.* FROM 'samchuk_app'@'10.1.0.%';

-- อนุญาตเฉพาะ SELECT ตาราง HR
GRANT SELECT ON hosoffice.hr_person TO 'samchuk_app'@'10.1.0.%';
GRANT SELECT ON hosoffice.hr_prefix TO 'samchuk_app'@'10.1.0.%';
GRANT SELECT ON hosoffice.hr_position TO 'samchuk_app'@'10.1.0.%';
GRANT SELECT ON hosoffice.hr_level TO 'samchuk_app'@'10.1.0.%';
GRANT SELECT ON hosoffice.hr_department TO 'samchuk_app'@'10.1.0.%';
GRANT SELECT ON hosoffice.hr_department_sub TO 'samchuk_app'@'10.1.0.%';
GRANT SELECT ON hosoffice.hr_person_type TO 'samchuk_app'@'10.1.0.%';

-- อนุญาตเฉพาะ SELECT และ INSERT บน fingle_scan (ห้าม UPDATE, DELETE เด็ดขาด)
GRANT SELECT, INSERT ON hosoffice.fingle_scan TO 'samchuk_app'@'10.1.0.%';

FLUSH PRIVILEGES;
```

> ⚠️ **ข้อควรระวัง:** การไม่ให้สิทธิ์ `UPDATE` หรือ `DELETE` บน `hosoffice.fingle_scan` จะช่วยรับประกันได้ 100% ว่าข้อมูลในระบบเดิมจะไม่ถูกลบหรือแก้ไขโดยไม่ตั้งใจ

---

## 6. การจัดการและทดสอบความถูกต้องของภาษาไทย 100% ระหว่างการซิงค์ (Thai Character Encoding Integrity)

เพื่อให้การแลกเปลี่ยนข้อมูลภาษาไทย (เช่น ชื่อ-นามสกุล, ตำแหน่ง, กลุ่มงานหลัก, หน่วยงานย่อย, ประเภทบุคลากร) เป็นไปอย่างราบรื่น ถูกต้อง 100% โดยไม่มีปัญหาตัวอักษรต่างดาว (`???` หรือ `à¸ªà¸²à¸¡à¸Šà¸¸à¸`), สระจม, หรือสระลอย:

### 6.1 กลไกการรักษาความถูกต้องของอักขระภาษาไทย
1. **การดึงข้อมูล (Inbound Query):**
   - คำสั่ง `TRIM(CONCAT(COALESCE(HF.HR_PREFIX_NAME, ''), HP.HR_FNAME, ' ', HP.HR_LNAME))` ดำเนินการที่ฝั่ง SQL Server เพื่อให้ชื่อเต็มภาษาไทยเรียงตัวอย่างถูกต้อง ไร้ช่องว่างส่วนเกิน
   - ไดรเวอร์เชื่อมต่อ ADO.NET / Web API ระบุ `CharSet=utf8mb4;` ใน Connection String เพื่อรับข้อมูลด้วย Encoding Unicode 4-Bytes สมบูรณ์แบบ
2. **การส่งข้อมูล (Outbound Insert):**
   - ข้อมูลภาษาไทยทุกฟิลด์ในคำสั่ง `INSERT INTO fingle_scan` ถูกส่งผ่าน Parameters (Parameterized Query) เช่น `@HrFullname`, `@HrPositionName`, `@HrDepName`, `@DayTypeName`
   - ป้องกันปัญหาข้อความภาษาไทยถูก Escape จนสระและวรรณยุกต์เสียหาย หรือเกิดความเสี่ยงจาก SQL Injection
3. **กรณีฐานข้อมูล HOSxP เดิมใช้งาน TIS-620 (CP874):**
   - สามารถระบุ `CharSet=tis620;` ใน Connection String ของ HOSOffice
   - ระบบจะทำหน้าที่ถอดรหัส (Decoding) จาก TIS-620 เป็น UTF-8 ภายในตัวแอปพลิเคชันอย่างโปร่งใส และแปลงกลับเมื่อทำการส่งข้อมูลเข้าตาราง `fingle_scan` ทำให้ระบบสามารถทำงานร่วมกับ HOSxP ได้ทุกเวอร์ชันโดยที่ข้อมูลภาษาไทยไม่ผิดเพี้ยนแม้แต่อักขระเดียว

