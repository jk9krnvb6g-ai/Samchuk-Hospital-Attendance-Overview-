-- =========================================================================
-- ฐานข้อมูลที่ 1: Attendance DB (samchuk_attendance) - สำหรับ Staging & Config
-- สเปกข้อ 21: Attendance DB — ตารางของระบบ
-- มาตรฐานการรองรับภาษาไทย 100% (Full Thai Unicode Support - UTF8MB4)
-- =========================================================================

-- กำหนด Character Set สำหรับ Session ในการรันสคริปต์
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET CHARACTER SET utf8mb4;

-- สร้างฐานข้อมูล samchuk_attendance ด้วย utf8mb4 และ Collation ภาษาไทย
CREATE DATABASE IF NOT EXISTS samchuk_attendance 
DEFAULT CHARACTER SET utf8mb4 
DEFAULT COLLATE utf8mb4_unicode_ci;

USE samchuk_attendance;

-- 21.1 attendance_raw_scan (Staging ของข้อมูลจากเครื่องสแกน)
CREATE TABLE IF NOT EXISTS attendance_raw_scan (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    machine_no INT NOT NULL,
    device_ip VARCHAR(45) NULL,
    fingle_id INT NOT NULL,
    scan_date_time DATETIME NOT NULL,          -- ค.ศ.
    verify_mode INT NULL,
    in_out_mode INT NULL,                      -- เก็บค่าดิบ ห้ามตีความ
    -- HR snapshot (รองรับภาษาไทย 100% - ชื่อ-สกุล, ตำแหน่ง, สังกัด)
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
    hr_mapped TINYINT(1) NOT NULL DEFAULT 0,   -- map FINGLE_ID เจอหรือไม่
    -- สถานะการส่งเข้า hosoffice
    push_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        -- PENDING | PUSHED | SKIPPED_EXISTS | FAILED | EXCLUDED
    pushed_at DATETIME NULL,
    pushed_by INT NULL,
    push_batch_id BIGINT NULL,
    push_error TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    received_at DATETIME NOT NULL,             -- เวลาที่ดึงจากเครื่องสแกน
    UNIQUE KEY uq_scan (fingle_id, scan_date_time),
    KEY idx_push_status (push_status),
    KEY idx_scan_date (scan_date_time),
    KEY idx_person (person_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21.2 กลุ่มบุคลากรและกะ
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

CREATE TABLE IF NOT EXISTS attendance_personnel_group (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    group_kind VARCHAR(20) NOT NULL,           -- PERSON_TYPE | CUSTOM
    priority INT NOT NULL DEFAULT 100,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    note VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- สมาชิกกลุ่มแบบ ตามประเภทบุคลากร
CREATE TABLE IF NOT EXISTS attendance_group_person_type (
    group_id INT NOT NULL,
    hr_person_type_id INT NOT NULL,
    PRIMARY KEY (group_id, hr_person_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- สมาชิกกลุ่มแบบ กำหนดเอง
CREATE TABLE IF NOT EXISTS attendance_group_member (
    group_id INT NOT NULL,
    person_id INT NOT NULL,
    PRIMARY KEY (group_id, person_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- เวลากะของแต่ละกลุ่ม (Override เวลาจากกะมาตรฐาน)
CREATE TABLE IF NOT EXISTS attendance_group_shift (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    shift_id INT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    late_grace_minutes INT NULL,               -- NULL = ใช้ค่าจาก attendance_shift
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- กะประจำรายบุคคล (Override)
CREATE TABLE IF NOT EXISTS attendance_person_shift (
    id INT AUTO_INCREMENT PRIMARY KEY,
    person_id INT NOT NULL,
    shift_id INT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Roster รายวัน (สนับสนุนการมีหลายกะในวันเดียวกัน)
CREATE TABLE IF NOT EXISTS attendance_person_roster (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    person_id INT NOT NULL,
    work_date DATE NOT NULL,
    shift_id INT NOT NULL,
    note VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    created_by INT NULL,
    UNIQUE KEY uq_roster (person_id, work_date, shift_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ผลประมวลผลรายวัน
CREATE TABLE IF NOT EXISTS attendance_daily_result (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    work_date DATE NOT NULL,
    person_id INT NOT NULL,
    fingle_id INT NOT NULL DEFAULT 0,
    fullname VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    department VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    position VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    shift_id INT NULL,
    shift_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    scheduled_in VARCHAR(10) NULL,
    scheduled_out VARCHAR(10) NULL,
    first_scan VARCHAR(25) NULL,
    last_scan VARCHAR(25) NULL,
    check_in VARCHAR(10) NULL,
    check_out VARCHAR(10) NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'NO_SCAN',
    status_label VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ไม่พบสแกน',
    late_minutes INT NOT NULL DEFAULT 0,
    early_minutes INT NOT NULL DEFAULT 0,
    total_scans INT NOT NULL DEFAULT 0,
    calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_day (person_id, work_date, shift_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21.3 Push Log
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
    status VARCHAR(20) NOT NULL,               -- RUNNING | SUCCESS | PARTIAL | FAILED
    finished_at DATETIME NULL,
    error_message TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- คืนค่า Character Set Session
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
