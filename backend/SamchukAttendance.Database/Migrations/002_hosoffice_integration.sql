-- =========================================================================
-- ฐานข้อมูลที่ 2: hosoffice @ 10.1.0.201 (ระบบเดิม / HOSxP)
-- สเปกข้อ 3, 11, 12: การอ่าน hr_* และการ INSERT ลง fingle_scan
-- มาตรฐานการรองรับภาษาไทย 100% (Thai Encoding & Interoperability)
-- =========================================================================

-- กำหนด Character Set สำหรับ Session
-- กรณี MySQL hosoffice ใช้ UTF-8 หรือ UTF8MB4:
SET NAMES utf8mb4;

-- (หมายเหตุ: หากเซิร์ฟเวอร์ MySQL HOSxP เดิมติดตั้งด้วย TIS-620 / Windows-874 
--  การเชื่อมต่อผ่าน ADO.NET / C# จะใช้ CharSet=tis620; เพื่อแปลงเป็น UTF-8 ในตัวแอปพลิเคชันโดยอัตโนมัติ
--  ทำให้ภาษาไทยแสดงผลและจัดเก็บได้อย่างถูกต้อง 100% โดยไม่มีปัญหาตัวอักษรต่างดาว)

-- 1. สิทธิ์ที่ระบบต้องการบน hosoffice:
-- GRANT SELECT ON hosoffice.hr_person TO 'samchuk_app'@'%';
-- GRANT SELECT ON hosoffice.hr_prefix TO 'samchuk_app'@'%';
-- GRANT SELECT ON hosoffice.hr_position TO 'samchuk_app'@'%';
-- GRANT SELECT ON hosoffice.hr_level TO 'samchuk_app'@'%';
-- GRANT SELECT ON hosoffice.hr_department TO 'samchuk_app'@'%';
-- GRANT SELECT ON hosoffice.hr_department_sub TO 'samchuk_app'@'%';
-- GRANT SELECT ON hosoffice.hr_person_type TO 'samchuk_app'@'%';
-- GRANT SELECT, INSERT ON hosoffice.fingle_scan TO 'samchuk_app'@'%';
-- **ห้ามให้สิทธิ์ UPDATE หรือ DELETE บน fingle_scan เด็ดขาด**

-- 2. Query ดึงข้อมูลบุคลากรและรหัสสแกนนิ้ว (Personnel Directory) จาก hosoffice @ 10.1.0.201:
-- รองรับตัวอักษรภาษาไทย สระ วรรณยุกต์ และการเชื่อมคำนำหน้า ชื่อ นามสกุล อย่างสมบูรณ์
/*
SELECT 
    HP.HR_CID,
    TRIM(CONCAT(COALESCE(HF.HR_PREFIX_NAME, ''), HP.HR_FNAME, ' ', HP.HR_LNAME)) AS FULLNAME,
    COALESCE(HT.HR_POSITION_NAME, '') AS HR_POSITION_NAME,
    COALESCE(HD.HR_DEPARTMENT_NAME, '') AS HR_DEPARTMENT_NAME,
    COALESCE(HDS.HR_DEPARTMENT_SUB_NAME, '') AS HR_DEPARTMENT_SUB,
    COALESCE(HPT.HR_PERSON_TYPE_NAME, '') AS HR_PERSON_TYPE_NAME,
    COALESCE(HL.HR_LEVEL_NAME, '') AS HR_LEVEL_NAME,
    HP.FINGLE_ID,
    HP.ID
FROM hr_person HP
LEFT OUTER JOIN hr_prefix HF ON HP.HR_PREFIX_ID = HF.HR_PREFIX_ID
LEFT OUTER JOIN hr_position HT ON HP.HR_POSITION_ID = HT.HR_POSITION_ID
LEFT OUTER JOIN hr_department HD ON HP.HR_DEPARTMENT_ID = HD.HR_DEPARTMENT_ID
LEFT OUTER JOIN hr_department_sub HDS ON HP.HR_DEPARTMENT_SUB_ID = HDS.HR_DEPARTMENT_SUB_ID
LEFT OUTER JOIN hr_person_type HPT ON HP.HR_PERSON_TYPE_ID = HPT.HR_PERSON_TYPE_ID
LEFT OUTER JOIN hr_level HL ON HP.HR_LEVEL_ID = HL.HR_LEVEL_ID
ORDER BY HP.ID ASC;
*/

-- 3. คำสั่ง INSERT ลง fingle_scan เมื่อ ADMIN กดปุ่มส่งข้อมูล (สเปกข้อ 12-14):
-- ทุกฟิลด์ที่เป็นข้อความภาษาไทย (HR_FULLNAME, HR_POSITION_NAME, DAY_TYPE_NAME ฯลฯ) 
-- ถูกส่งผ่าน Parameter แบบ Unicode UTF-8 ป้องกัน SQL Injection และคงความถูกต้องของภาษาไทย 100%
/*
INSERT INTO fingle_scan (
    PERSON_ID, FINGLE_ID, SCAN_DATE_TIME, SCAN_DATE, SCAN_TIME,
    DAY_TYPE_ID, DAY_TYPE_NAME,
    HR_FULLNAME, HR_POSITION_NAME, HR_LEAVEL_NAME, HR_DEP_NAME, HR_DEP_SUB_NAME, HR_PERSON_TYPE_NAME,
    HR_PERSON_TYPE_ID, HR_DEPARTMENT_ID, HR_DEPARTMENT_SUB_ID,
    MACHIN_ID,
    APP_TYPE_SAVE, SCAN_SOURCE,
    ISCONFIRM, ISINPUT,
    DATE_TIME_SAVE, CREATE_BY
) VALUES (
    @PersonId, @FingleId, @ScanDateTime, @ScanDate, @ScanTime,
    @DayTypeId, @DayTypeName,
    @HrFullname, @HrPositionName, @HrLeavelName, @HrDepName, @HrDepSubName, @HrPersonTypeName,
    @HrPersonTypeId, @HrDepartmentId, @HrDepartmentSubId,
    @MachineId,
    'SCAN', 'FINGER',
    1, 'SIGN',
    NOW(), 'SCAN_PUSH'
);
*/
