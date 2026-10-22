-- =========================================================================
-- ฐานข้อมูลระบบลงเวลาและตารางเวร โรงพยาบาลสามชุก (samchuk_attendance)
-- เวอร์ชันล่าสุด (Latest Schema) รวมตาราง attendance_personnel ครบถ้วน 100%
-- รองรับภาษาไทย UTF-8 (utf8mb4_unicode_ci) ป้องกันสระจม วรรณยุกต์เพี้ยน
-- =========================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET CHARACTER SET utf8mb4;

-- 1. สร้างฐานข้อมูล samchuk_attendance
CREATE DATABASE IF NOT EXISTS `samchuk_attendance` 
DEFAULT CHARACTER SET utf8mb4 
DEFAULT COLLATE utf8mb4_unicode_ci;

USE `samchuk_attendance`;

-- =========================================================================
-- 2. ตารางบุคลากรของระบบลงเวลา (attendance_personnel)
-- เก็บรายชื่อบุคลากรที่ซิงค์มาจาก HOSOffice (hr_person)
-- ยึด HOSOffice เป็นหลัก หากไม่มีหรือลาออก สถานะจะเป็น 'INACTIVE' (ไม่ได้ใช้งาน)
-- =========================================================================
CREATE TABLE IF NOT EXISTS `attendance_personnel` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `person_id` INT NOT NULL COMMENT 'รหัสบุคคลจาก hosoffice.hr_person.ID',
    `fingle_id` INT NOT NULL COMMENT 'รหัสลายนิ้วมือ FINGLE_ID',
    `hr_cid` VARCHAR(20) NULL COMMENT 'เลขบัตรประชาชน 13 หลัก',
    `hr_fullname` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'คำนำหน้า ชื่อ นามสกุล',
    `hr_position_name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'ตำแหน่งสายงาน',
    `hr_level_name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'ระดับตำแหน่ง',
    `hr_dep_name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'กลุ่มงาน / ฝ่ายหลัก',
    `hr_dep_sub_name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'งานย่อย / แผนกย่อย',
    `hr_person_type_name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'ข้าราชการ' COMMENT 'ประเภทบุคลากร',
    `hr_person_type_id` INT NULL COMMENT 'รหัสประเภทบุคลากร',
    `hr_department_id` INT NULL COMMENT 'รหัสฝ่ายหลัก',
    `hr_department_sub_id` INT NULL COMMENT 'รหัสแผนกย่อย',
    `hr_status_id` INT NULL COMMENT 'สถานะจาก HOSOffice (1=ปฏิบัติงาน)',
    `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE=ใช้งานอยู่, INACTIVE=ไม่ได้ใช้งาน',
    `synced_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'เวลาซิงค์ข้อมูลล่าสุด',
    UNIQUE KEY `uq_person_id` (`person_id`),
    KEY `idx_fingle_id` (`fingle_id`),
    KEY `idx_status` (`status`),
    KEY `idx_dep` (`hr_dep_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ทำเนียบบุคลากรระบบลงเวลา ซิงค์จาก HOSOffice';

-- =========================================================================
-- 3. ตารางกะการทำงาน (attendance_shift)
-- กำหนดช่วงเวลาเข้า-ออกงาน เกณฑ์สาย และกรอบเวลาสแกน
-- =========================================================================
CREATE TABLE IF NOT EXISTS `attendance_shift` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `shift_code` VARCHAR(20) NOT NULL UNIQUE COMMENT 'รหัสกะ เช่น M, A, N, MA',
    `shift_name` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ชื่อกะภาษาไทย',
    `start_time` TIME NOT NULL COMMENT 'เวลาเริ่มกะ',
    `end_time` TIME NOT NULL COMMENT 'เวลาสิ้นสุดกะ',
    `crosses_midnight` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=กะข้ามเที่ยงคืน (เช่น กะดึก)',
    `work_date_basis` VARCHAR(10) NOT NULL DEFAULT 'START_DATE' COMMENT 'ยึดวันเริ่มต้น START_DATE',
    `late_grace_minutes` INT NOT NULL DEFAULT 0 COMMENT 'นาทีผ่อนปรนสาย',
    `in_window_before_min` INT NOT NULL DEFAULT 120 COMMENT 'เปิดรับสแกนเข้าก่อนเวลากี่นาที',
    `out_window_after_min` INT NOT NULL DEFAULT 120 COMMENT 'เปิดรับสแกนออกหลังเวลากี่นาที',
    `early_leave_min` INT NOT NULL DEFAULT 0 COMMENT 'เกณฑ์ออกก่อนเวลา',
    `duplicate_scan_min` INT NOT NULL DEFAULT 5 COMMENT 'กรองสแกนซ้ำภายในกี่นาที',
    `color` VARCHAR(20) NULL DEFAULT '#0ea5e9' COMMENT 'สีแสดงผลในปฏิทิน',
    `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=เปิดใช้งาน',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ตารางกำหนดกะการทำงาน';

-- =========================================================================
-- 4. ตารางกะและเงื่อนไขเวลาตามประเภทบุคลากร (attendance_personnel_type_shift)
-- รองรับเวลาทำงานแยกตามประเภท เช่น ข้าราชการ, พกส., ลูกจ้างรายวัน
-- =========================================================================
CREATE TABLE IF NOT EXISTS `attendance_personnel_type_shift` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(150) NOT NULL COMMENT 'ชื่อประเภทบุคลากร',
    `code` VARCHAR(50) NULL COMMENT 'รหัสย่อ',
    `description` VARCHAR(255) NULL COMMENT 'คำอธิบาย',
    `morning_start` VARCHAR(10) NOT NULL DEFAULT '08:15' COMMENT 'เวลาเริ่มกะเช้า',
    `morning_end` VARCHAR(10) NOT NULL DEFAULT '16:00' COMMENT 'เวลาเลิกกะเช้า',
    `morning_grace` INT NOT NULL DEFAULT 0 COMMENT 'ผ่อนปรนสายกะเช้า (นาที)',
    `afternoon_start` VARCHAR(10) NOT NULL DEFAULT '16:00' COMMENT 'เวลาเริ่มกะบ่าย',
    `afternoon_end` VARCHAR(10) NOT NULL DEFAULT '24:00' COMMENT 'เวลาเลิกกะบ่าย',
    `afternoon_grace` INT NOT NULL DEFAULT 0 COMMENT 'ผ่อนปรนสายกะบ่าย (นาที)',
    `night_start` VARCHAR(10) NOT NULL DEFAULT '00:00' COMMENT 'เวลาเริ่มกะดึก',
    `night_end` VARCHAR(10) NOT NULL DEFAULT '08:00' COMMENT 'เวลาเลิกกะดึก',
    `night_grace` INT NOT NULL DEFAULT 0 COMMENT 'ผ่อนปรนสายกะดึก (นาที)',
    `is_active` TINYINT NOT NULL DEFAULT 1,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_personnel_type_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ตารางตั้งค่าเวลากะตามประเภทบุคลากร';

-- =========================================================================
-- 5. ตารางบันทึกสแกนดิบ (attendance_raw_scan)
-- Staging เก็บข้อมูลสแกนจริงจากเครื่อง HIP CMiF68S พร้อมประวัติ Push
-- =========================================================================
CREATE TABLE IF NOT EXISTS `attendance_raw_scan` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `machine_no` INT NOT NULL COMMENT 'หมายเลขเครื่องสแกน',
    `device_ip` VARCHAR(45) NULL COMMENT 'IP เครื่องสแกน เช่น 192.168.111.163',
    `fingle_id` INT NOT NULL COMMENT 'รหัสลายนิ้วมือบนเครื่อง',
    `scan_date_time` DATETIME NOT NULL COMMENT 'วันเวลาสแกนจริง (ค.ศ.)',
    `verify_mode` INT NULL COMMENT '1=ลายนิ้วมือ, 2=รหัสผ่าน, 3=การ์ด',
    `in_out_mode` INT NULL COMMENT '0=เข้า, 1=ออก (เก็บค่าดิบ)',
    `person_id` INT NULL COMMENT 'ID จากตารางบุคลากร',
    `hr_fullname` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `hr_position_name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `hr_leavel_name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `hr_dep_name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `hr_dep_sub_name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `hr_person_type_name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `hr_person_type_id` INT NULL,
    `hr_department_id` INT NULL,
    `hr_department_sub_id` INT NULL,
    `hr_mapped` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=จับคู่กับบุคลากรสำเร็จ',
    `push_status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING, PUSHED, FAILED',
    `pushed_at` DATETIME NULL COMMENT 'วันเวลาที่ส่งเข้า hosoffice.fingle_scan',
    `pushed_by` INT NULL COMMENT 'ผู้กดสั่งส่งข้อมูล',
    `push_batch_id` BIGINT NULL,
    `push_error` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `received_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'เวลาที่ดึงจากเครื่องสแกน',
    UNIQUE KEY `uq_scan` (`fingle_id`, `scan_date_time`),
    KEY `idx_push_status` (`push_status`),
    KEY `idx_scan_date` (`scan_date_time`),
    KEY `idx_person` (`person_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='บันทึกสแกนดิบจากเครื่องสแกนนิ้วมือ';

-- =========================================================================
-- 6. ตารางกลุ่มบุคลากร (attendance_personnel_group)
-- =========================================================================
CREATE TABLE IF NOT EXISTS `attendance_personnel_group` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `group_name` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `group_kind` VARCHAR(20) NOT NULL DEFAULT 'CUSTOM',
    `priority` INT NOT NULL DEFAULT 100,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `note` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ตารางกลุ่มบุคลากร';

-- =========================================================================
-- 7. ตารางมอบหมายตารางเวร (attendance_person_roster)
-- =========================================================================
CREATE TABLE IF NOT EXISTS `attendance_person_roster` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `person_id` INT NOT NULL,
    `work_date` DATE NOT NULL,
    `shift_id` INT NOT NULL,
    `note` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `created_by` INT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_roster` (`person_id`, `work_date`, `shift_id`),
    KEY `idx_work_date` (`work_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ตารางเวรการปฏิบัติงาน';

-- =========================================================================
-- 8. ตาราง Override เวลากะเฉพาะบุคคล (attendance_person_shift)
-- =========================================================================
CREATE TABLE IF NOT EXISTS `attendance_person_shift` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `person_id` INT NOT NULL,
    `shift_id` INT NOT NULL,
    `start_time` TIME NOT NULL,
    `end_time` TIME NOT NULL,
    `effective_from` DATE NOT NULL,
    `effective_to` DATE NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    KEY `idx_person_effective` (`person_id`, `effective_from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ตารางปรับเวลากะเฉพาะบุคคล';

-- =========================================================================
-- 9. ตารางผลการคำนวณเวลาปฏิบัติงานประจำวัน (attendance_daily_result)
-- =========================================================================
CREATE TABLE IF NOT EXISTS `attendance_daily_result` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `work_date` DATE NOT NULL,
    `person_id` INT NOT NULL,
    `fingle_id` INT NOT NULL DEFAULT 0,
    `fullname` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `department` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `position` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `shift_id` INT NULL,
    `shift_name` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `scheduled_in` VARCHAR(10) NULL,
    `scheduled_out` VARCHAR(10) NULL,
    `first_scan` VARCHAR(25) NULL,
    `last_scan` VARCHAR(25) NULL,
    `check_in` VARCHAR(10) NULL,
    `check_out` VARCHAR(10) NULL,
    `status` VARCHAR(50) NOT NULL COMMENT 'ON_TIME, LATE, EARLY_LEAVE, NO_SCAN',
    `status_label` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ไม่พบสแกน',
    `late_minutes` INT NOT NULL DEFAULT 0,
    `early_minutes` INT NOT NULL DEFAULT 0,
    `total_scans` INT NOT NULL DEFAULT 0,
    `calculated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_daily_person_shift` (`work_date`, `person_id`, `shift_id`),
    KEY `idx_daily_date` (`work_date`),
    KEY `idx_daily_person` (`person_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ผลการประมวลผลเวลาเข้าออกและสายประจำวัน';

-- =========================================================================
-- 10. ข้อมูลเริ่มต้น (Seed Initial Master Data)
-- =========================================================================

-- 10.1 กะมาตรฐาน รพ.สามชุก (4 กะหลัก)
INSERT INTO `attendance_shift` 
(`id`, `shift_code`, `shift_name`, `start_time`, `end_time`, `crosses_midnight`, `work_date_basis`, `late_grace_minutes`, `in_window_before_min`, `out_window_after_min`, `early_leave_min`, `duplicate_scan_min`, `color`, `is_active`)
VALUES
(1, 'M', 'เช้า (ปกติ)', '08:15:00', '16:00:00', 0, 'START_DATE', 0, 120, 120, 0, 5, '#0ea5e9', 1),
(2, 'A', 'บ่าย', '16:00:00', '24:00:00', 0, 'START_DATE', 0, 120, 120, 0, 5, '#f59e0b', 1),
(3, 'N', 'ดึก', '00:00:00', '08:00:00', 0, 'START_DATE', 0, 120, 120, 0, 5, '#8b5cf6', 1),
(4, 'MA', 'เช้าควบบ่าย (16 ชม.)', '08:15:00', '24:00:00', 0, 'START_DATE', 0, 120, 120, 0, 5, '#10b981', 1)
ON DUPLICATE KEY UPDATE 
    `shift_name` = VALUES(`shift_name`),
    `start_time` = VALUES(`start_time`),
    `end_time` = VALUES(`end_time`),
    `color` = VALUES(`color`);

-- 10.2 ประเภทบุคลากรและเวลากะเริ่มต้น รพ.สามชุก (5 ประเภทหลัก)
INSERT INTO `attendance_personnel_type_shift` 
(`name`, `code`, `description`, `morning_start`, `morning_end`, `morning_grace`, `afternoon_start`, `afternoon_end`, `afternoon_grace`, `night_start`, `night_end`, `night_grace`, `is_active`)
VALUES
('ข้าราชการ', 'GOV', 'ข้าราชการพลเรือนสามัญ กระทรวงสาธารณสุข', '08:15', '16:00', 0, '16:00', '24:00', 0, '00:00', '08:00', 0, 1),
('พนักงานกระทรวงสาธารณสุข', 'MOPH', 'พนักงานกระทรวงสาธารณสุข (พกส.)', '08:15', '16:00', 0, '16:00', '24:00', 0, '00:00', '08:00', 0, 1),
('พนักงานราชการ', 'GOV_EMP', 'พนักงานราชการทั่วไป', '08:15', '16:00', 0, '16:00', '24:00', 0, '00:00', '08:00', 0, 1),
('ลูกจ้างประจำ/ลูกจ้างชั่วคราว', 'TEMP', 'ลูกจ้างประจำและลูกจ้างชั่วคราวเงินบำรุง', '08:15', '16:00', 0, '16:00', '24:00', 0, '00:00', '08:00', 0, 1),
('ลูกจ้างรายวัน', 'DAILY', 'ลูกจ้างจ้างเหมาบริการ / รายวัน', '08:00', '16:00', 0, '16:00', '24:00', 0, '00:00', '08:00', 0, 1)
ON DUPLICATE KEY UPDATE 
    `code` = VALUES(`code`),
    `description` = VALUES(`description`),
    `morning_start` = VALUES(`morning_start`),
    `morning_end` = VALUES(`morning_end`);

-- หมายเหตุ: ตาราง attendance_personnel และ attendance_raw_scan จะเริ่มต้นด้วย 0 รายการ
-- เพื่อให้ผู้ดูแลระบบกด "ซิงค์รายชื่อจาก HOSOffice" ด้วยตนเองเมื่อต้องการ
