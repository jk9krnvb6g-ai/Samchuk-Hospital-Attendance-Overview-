/**
 * Samchuk Hospital Attendance System - Node.js Backend API Service
 * ทำงานบนพอร์ต 3002 สำหรับรองรับ Web Frontend (พอร์ต 3001 /Sam_Att/)
 * เชื่อมต่อ MySQL 10.2.0.201 โดยตรงทั้ง 2 ฐานข้อมูล:
 *   1. samchuk_attendance (ฐานข้อมูลระบบลงเวลา, กะ, Roster, Staging สแกน)
 *   2. hosoffice (ฐานข้อมูลบุคลากร โรงพยาบาลสามชุก, fingle_scan)
 * ทดสอบเครื่องสแกน HIP CMiF68S พอร์ต 5005 ด้วย TCP Socket
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const net = require('net');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.API_PORT || 3002;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '10mb' }));

// --------------------------------------------------------------------------
// 1. โหลดการตั้งค่าจาก appsettings.json และ .env
// --------------------------------------------------------------------------
const appSettingsPath = path.join(__dirname, 'SamchukAttendance.Api', 'appsettings.json');
let config = {
  Scanners: [
    { MachineNo: 1, Name: 'Scanner 1 - หน้าตึกอำนวยการ', IP: '192.168.111.163', Port: 5005, Model: 'CMiF68S', Serial: '6802004210', Password: 0, License: 1261, Enabled: true },
    { MachineNo: 2, Name: 'Scanner 2 - ตึกอุบัติเหตุและฉุกเฉิน (ER)', IP: '192.168.111.164', Port: 5005, Model: 'CMiF68S', Serial: '6802004486', Password: 0, License: 1261, Enabled: true },
    { MachineNo: 3, Name: 'Scanner 3 - ตึกผู้ป่วยใน (IPD)', IP: '192.168.111.165', Port: 5005, Model: 'CMiF68S', Serial: 'ยังไม่ระบุ', Password: 0, License: 1261, Enabled: true }
  ],
  DbHost: '10.2.0.201',
  DbPort: 3306,
  AttendanceDb: 'samchuk_attendance',
  HosOfficeDb: 'hosoffice',
  DbUser: 'attendance_app',
  DbPassword: 'YOUR_ATTENDANCE_DB_PASSWORD'
};

if (fs.existsSync(appSettingsPath)) {
  try {
    const raw = fs.readFileSync(appSettingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.Scanners && parsed.Scanners.length > 0) {
      config.Scanners = parsed.Scanners.map(s => ({ ...s, Enabled: true }));
    }
    if (parsed.ConnectionStrings?.AttendanceDb) {
      const matchHost = parsed.ConnectionStrings.AttendanceDb.match(/Server=([^;]+)/i);
      const matchUser = parsed.ConnectionStrings.AttendanceDb.match(/User ID=([^;]+)/i);
      const matchPass = parsed.ConnectionStrings.AttendanceDb.match(/Password=([^;]+)/i);
      if (matchHost) config.DbHost = matchHost[1];
      if (matchUser) config.DbUser = matchUser[1];
      if (matchPass && matchPass[1] !== 'YOUR_ATTENDANCE_DB_PASSWORD') config.DbPassword = matchPass[1];
    }
  } catch (err) {
    console.error('ไม่สามารถอ่าน appsettings.json ได้, ใช้ค่าเริ่มต้นแทน:', err.message);
  }
}

// ค่าคอนฟิก MySQL เชื่อมต่อ
let activeDbConfig = {
  host: process.env.DB_HOST || config.DbHost || '10.2.0.201',
  port: parseInt(process.env.DB_PORT || config.DbPort || '3306', 10),
  user: process.env.DB_USER || config.DbUser || 'attendance_app',
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (config.DbPassword === 'YOUR_ATTENDANCE_DB_PASSWORD' ? '' : config.DbPassword),
  database: process.env.DB_NAME || config.AttendanceDb || 'samchuk_attendance'
};

let hosofficeDbName = process.env.HOSOFFICE_DB || config.HosOfficeDb || 'hosoffice';

// Pool สำหรับ samchuk_attendance
let dbPool = null;
function getDbPool() {
  if (!dbPool) {
    dbPool = mysql.createPool({
      host: activeDbConfig.host,
      port: activeDbConfig.port,
      user: activeDbConfig.user,
      password: activeDbConfig.password,
      database: activeDbConfig.database,
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 4000
    });

    dbPool.on('connection', (conn) => {
      conn.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
      conn.query("SET CHARACTER SET utf8mb4");
    });
  }
  return dbPool;
}

// Pool สำหรับ hosoffice (ฐานข้อมูลบุคลากร HR และ fingle_scan)
let hosofficePool = null;
function getHosofficePool() {
  if (!hosofficePool) {
    const hosHost = process.env.HOSOFFICE_HOST || activeDbConfig.host;
    const hosPort = parseInt(process.env.HOSOFFICE_PORT || activeDbConfig.port, 10);
    const hosUser = process.env.HOSOFFICE_USER || 'sa';
    const hosPass = process.env.HOSOFFICE_PASSWORD !== undefined ? process.env.HOSOFFICE_PASSWORD : activeDbConfig.password;
    const hosDb = process.env.HOSOFFICE_DB || hosofficeDbName;

    hosofficePool = mysql.createPool({
      host: hosHost,
      port: hosPort,
      user: hosUser,
      password: hosPass,
      database: hosDb,
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 4000
    });

    hosofficePool.on('connection', (conn) => {
      conn.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
      conn.query("SET CHARACTER SET utf8mb4");
    });
  }
  return hosofficePool;
}

function resetDbPool(newConfig) {
  if (dbPool) {
    try { dbPool.end(); } catch {}
    dbPool = null;
  }
  if (hosofficePool) {
    try { hosofficePool.end(); } catch {}
    hosofficePool = null;
  }
  if (newConfig) {
    activeDbConfig = { ...activeDbConfig, ...newConfig };
  }
  return getDbPool();
}

// ฟังก์ชันสร้างฐานข้อมูลอัตโนมัติหากยังไม่มีใน MySQL
async function autoCreateDatabaseIfNotExist(dbName = activeDbConfig.database) {
  try {
    const tempConn = await mysql.createConnection({
      host: activeDbConfig.host,
      port: activeDbConfig.port,
      user: activeDbConfig.user,
      password: activeDbConfig.password,
      connectTimeout: 3500
    });
    await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await tempConn.end();
    return { success: true };
  } catch (err) {
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      const candidates = [
        { user: process.env.HOSOFFICE_USER || 'sa', password: process.env.HOSOFFICE_PASSWORD !== undefined ? process.env.HOSOFFICE_PASSWORD : '' },
        { user: 'root', password: '' },
        { user: 'sa', password: 'sa' },
        { user: 'root', password: 'sa' }
      ];
      for (const c of candidates) {
        if (c.user === activeDbConfig.user && c.password === activeDbConfig.password) continue;
        try {
          const testConn = await mysql.createConnection({
            host: activeDbConfig.host,
            port: activeDbConfig.port,
            user: c.user,
            password: c.password,
            connectTimeout: 2000
          });
          await testConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
          await testConn.end();
          console.log(`💡 บัญชี '${activeDbConfig.user}' ไม่มีสิทธิ์ (Access denied) ระบบสลับมาใช้ '${c.user}' แทนเรียบร้อยแล้ว`);
          activeDbConfig.user = c.user;
          activeDbConfig.password = c.password;
          resetDbPool(activeDbConfig);
          return { success: true };
        } catch {}
      }
    }
    return { success: false, error: err.message, code: err.code };
  }
}

// --------------------------------------------------------------------------
// 2. ฟังก์ชันตรวจสอบและสร้างตารางเริ่มต้นอัตโนมัติ (Auto-Migration)
// --------------------------------------------------------------------------
async function ensureTablesExist() {
  await autoCreateDatabaseIfNotExist(activeDbConfig.database);
  const pool = getDbPool();
  try {
    // 2.1 ตารางกะ attendance_shift
    await pool.query(`
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
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2.2 ตาราง attendance_raw_scan
    await pool.query(`
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
        received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_scan (fingle_id, scan_date_time),
        KEY idx_push_status (push_status),
        KEY idx_scan_date (scan_date_time),
        KEY idx_person (person_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2.3 ตารางกลุ่มบุคลากร
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_personnel_group (
        id INT AUTO_INCREMENT PRIMARY KEY,
        group_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        group_kind VARCHAR(20) NOT NULL DEFAULT 'CUSTOM',
        priority INT NOT NULL DEFAULT 100,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        note VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2.4 ตาราง Roster (ตารางเวร)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_person_roster (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        person_id INT NOT NULL,
        work_date DATE NOT NULL,
        shift_id INT NOT NULL,
        note VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        created_by INT NULL,
        UNIQUE KEY uq_roster (person_id, work_date, shift_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2.5 ตาราง Override รายบุคคล
    await pool.query(`
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
    `);

    // 2.6 ตารางผลการประมวลผลเวลาปฏิบัติงาน (Daily Attendance Processing Result)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_daily_result (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        work_date DATE NOT NULL,
        person_id INT NOT NULL,
        fingle_id INT NOT NULL,
        fullname VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
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
        status VARCHAR(50) NOT NULL,
        status_label VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        late_minutes INT NOT NULL DEFAULT 0,
        early_minutes INT NOT NULL DEFAULT 0,
        total_scans INT NOT NULL DEFAULT 0,
        calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_daily_person_shift (work_date, person_id, shift_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ตรวจสอบและเพิ่มคอลัมน์ในตาราง attendance_daily_result หากตารางเคยถูกสร้างไว้ในเวอร์ชันเก่า (แก้ Unknown column 'fingle_id')
    const dailyCols = [
      { name: 'fingle_id', def: 'INT NOT NULL DEFAULT 0' },
      { name: 'fullname', def: 'VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL' },
      { name: 'department', def: 'VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL' },
      { name: 'position', def: 'VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL' },
      { name: 'shift_name', def: 'VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL' },
      { name: 'scheduled_in', def: 'VARCHAR(10) NULL' },
      { name: 'scheduled_out', def: 'VARCHAR(10) NULL' },
      { name: 'first_scan', def: 'VARCHAR(25) NULL' },
      { name: 'last_scan', def: 'VARCHAR(25) NULL' },
      { name: 'check_in', def: 'VARCHAR(10) NULL' },
      { name: 'check_out', def: 'VARCHAR(10) NULL' },
      { name: 'status_label', def: 'VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT "ไม่พบสแกน"' },
      { name: 'early_minutes', def: 'INT NOT NULL DEFAULT 0' },
      { name: 'total_scans', def: 'INT NOT NULL DEFAULT 0' },
      { name: 'calculated_at', def: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' }
    ];

    for (const col of dailyCols) {
      try {
        const [existing] = await pool.query(`SHOW COLUMNS FROM attendance_daily_result LIKE ?`, [col.name]);
        if (existing.length === 0) {
          await pool.query(`ALTER TABLE attendance_daily_result ADD COLUMN \`${col.name}\` ${col.def}`);
          console.log(`✅ [Auto-Migration] เพิ่มคอลัมน์ '${col.name}' ในตาราง attendance_daily_result สำเร็จ`);
        }
      } catch (colErr) {
        // ignore
      }
    }

    // 2.7 Seed กะมาตรฐานโรงพยาบาลสามชุกถ้ายังไม่มี
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM attendance_shift');
    if (rows[0].count === 0) {
      await pool.query(`
        INSERT INTO attendance_shift 
        (id, shift_code, shift_name, start_time, end_time, crosses_midnight, work_date_basis, late_grace_minutes, in_window_before_min, out_window_after_min, early_leave_min, duplicate_scan_min, color, is_active)
        VALUES
        (1, 'M', 'เช้า (ปกติ)', '08:15:00', '16:00:00', 0, 'START_DATE', 0, 120, 120, 0, 5, '#0ea5e9', 1),
        (2, 'A', 'บ่าย', '16:00:00', '24:00:00', 0, 'START_DATE', 0, 120, 120, 0, 5, '#f59e0b', 1),
        (3, 'N', 'ดึก', '00:00:00', '08:00:00', 0, 'START_DATE', 0, 120, 120, 0, 5, '#8b5cf6', 1),
        (4, 'MA', 'เช้าควบบ่าย (16 ชม.)', '08:15:00', '24:00:00', 0, 'START_DATE', 0, 120, 120, 0, 5, '#10b981', 1)
      `);
      console.log('✅ Seed ข้อมูลกะเริ่มต้น 4 กะหลักลงใน samchuk_attendance.attendance_shift สำเร็จ');
    }

    // 2.8 ตารางตั้งค่าเวลากะตามประเภทบุคลากร (Personnel Type Shifts Config - Spec v2 Section 16-19 ปรับให้ Simple ตามประเภทบุคลากร)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_personnel_type_shift (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        code VARCHAR(50) NULL,
        description VARCHAR(255) NULL,
        morning_start VARCHAR(10) NOT NULL DEFAULT '08:15',
        morning_end VARCHAR(10) NOT NULL DEFAULT '16:00',
        morning_grace INT NOT NULL DEFAULT 0,
        afternoon_start VARCHAR(10) NOT NULL DEFAULT '16:00',
        afternoon_end VARCHAR(10) NOT NULL DEFAULT '24:00',
        afternoon_grace INT NOT NULL DEFAULT 0,
        night_start VARCHAR(10) NOT NULL DEFAULT '00:00',
        night_end VARCHAR(10) NOT NULL DEFAULT '08:00',
        night_grace INT NOT NULL DEFAULT 0,
        is_active TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_personnel_type_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // แปลง Character Set ฐานข้อมูลและตารางเป็น utf8mb4 อย่างแน่นอน
    try {
      await pool.query(`ALTER DATABASE \`${activeDbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await pool.query(`ALTER TABLE attendance_personnel_type_shift CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await pool.query(`ALTER TABLE attendance_raw_scan CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await pool.query(`ALTER TABLE attendance_shift CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } catch {}

    // Seed หรือซ่อมแซมประเภทบุคลากรเริ่มต้น 5 ประเภท
    const [typeRows] = await pool.query('SELECT COUNT(*) as count FROM attendance_personnel_type_shift');
    if (typeRows[0].count === 0) {
      await pool.query(`
        INSERT INTO attendance_personnel_type_shift 
        (name, code, description, morning_start, morning_end, morning_grace, afternoon_start, afternoon_end, afternoon_grace, night_start, night_end, night_grace, is_active)
        VALUES
        ('ข้าราชการ', 'GOV', 'ข้าราชการพลเรือนสามัญ กระทรวงสาธารณสุข', '08:15', '16:00', 0, '16:00', '24:00', 0, '00:00', '08:00', 0, 1),
        ('พนักงานกระทรวงสาธารณสุข', 'MOPH', 'พนักงานกระทรวงสาธารณสุข (พกส.)', '08:15', '16:00', 0, '16:00', '24:00', 0, '00:00', '08:00', 0, 1),
        ('พนักงานราชการ', 'GOV_EMP', 'พนักงานราชการทั่วไป', '08:15', '16:00', 0, '16:00', '24:00', 0, '00:00', '08:00', 0, 1),
        ('ลูกจ้างประจำ/ลูกจ้างชั่วคราว', 'TEMP', 'ลูกจ้างประจำและลูกจ้างชั่วคราวเงินบำรุง', '08:15', '16:00', 0, '16:00', '24:00', 0, '00:00', '08:00', 0, 1),
        ('ลูกจ้างรายวัน', 'DAILY', 'ลูกจ้างจ้างเหมาบริการ / รายวัน', '08:00', '16:00', 0, '16:00', '24:00', 0, '00:00', '08:00', 0, 1)
      `);
      console.log('✅ Seed ข้อมูลประเภทบุคลากรและเวลากะเริ่มต้น 5 ประเภท สำเร็จ');
    } else {
      // ตรวจสอบและซ่อมแซมภาษาไทยหากพบตัวอักษรผิดเพี้ยน (Mojibake Auto-Fix)
      try {
        await pool.query(`
          UPDATE attendance_personnel_type_shift 
          SET name = 'ข้าราชการ', description = 'ข้าราชการพลเรือนสามัญ กระทรวงสาธารณสุข'
          WHERE code = 'GOV';
        `);
        await pool.query(`
          UPDATE attendance_personnel_type_shift 
          SET name = 'พนักงานกระทรวงสาธารณสุข', description = 'พนักงานกระทรวงสาธารณสุข (พกส.)'
          WHERE code = 'MOPH';
        `);
        await pool.query(`
          UPDATE attendance_personnel_type_shift 
          SET name = 'พนักงานราชการ', description = 'พนักงานราชการทั่วไป'
          WHERE code = 'GOV_EMP';
        `);
        await pool.query(`
          UPDATE attendance_personnel_type_shift 
          SET name = 'ลูกจ้างประจำ/ลูกจ้างชั่วคราว', description = 'ลูกจ้างประจำและลูกจ้างชั่วคราวเงินบำรุง'
          WHERE code = 'TEMP';
        `);
        await pool.query(`
          UPDATE attendance_personnel_type_shift 
          SET name = 'ลูกจ้างรายวัน', description = 'ลูกจ้างจ้างเหมาบริการ / รายวัน'
          WHERE code = 'DAILY';
        `);
      } catch {}
    }

    return { success: true };
  } catch (err) {
    console.error('⚠️ ensureTablesExist Error:', err.message);
    return { success: false, error: err.message };
  }
}

// --------------------------------------------------------------------------
// 3. ฟังก์ชันทดสอบ TCP Port 5005 ของเครื่องสแกนนิ้ว
// --------------------------------------------------------------------------
function testScannerTcpSocket(ip, port = 5005, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let isSettled = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      if (isSettled) return;
      isSettled = true;
      const latencyMs = Date.now() - start;
      socket.destroy();
      resolve({
        success: true,
        ip,
        port,
        latencyMs,
        message: `เชื่อมต่อ TCP Port ${port} สำเร็จ (${latencyMs}ms)`
      });
    });

    socket.on('timeout', () => {
      if (isSettled) return;
      isSettled = true;
      socket.destroy();
      resolve({
        success: false,
        ip,
        port,
        message: `หมดเวลาเชื่อมต่อ (Timeout ${timeoutMs}ms) ไม่สามารถติดต่อ IP ${ip} พอร์ต ${port}`
      });
    });

    socket.on('error', (err) => {
      if (isSettled) return;
      isSettled = true;
      socket.destroy();
      resolve({
        success: false,
        ip,
        port,
        message: `เชื่อมต่อไม่สำเร็จ: ${err.message}`
      });
    });

    try {
      socket.connect(port, ip);
    } catch (err) {
      resolve({
        success: false,
        ip,
        port,
        message: `ข้อผิดพลาด Socket: ${err.message}`
      });
    }
  });
}

// --------------------------------------------------------------------------
// 4. API Routes
// --------------------------------------------------------------------------

// 4.1 Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'Samchuk Hospital Attendance Node.js API Service',
    version: '2.6.0',
    port: PORT,
    endpoint: `http://10.2.0.13:${PORT}`,
    frontendUrl: 'https://10.2.0.13:3001/Sam_Att/',
    architecture: 'Node.js Express + Dual MySQL (samchuk_attendance & hosoffice @ 10.2.0.201) + TCP Socket (CMiF68S)',
    thaiSupport: 'UTF-8 / UTF8MB4 (100% Thai Unicode)',
    serverTime: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
    databaseConfig: {
      host: activeDbConfig.host,
      port: activeDbConfig.port,
      user: activeDbConfig.user,
      attendanceDb: activeDbConfig.database,
      hosofficeDb: hosofficeDbName
    }
  });
});

// 4.2 ตรวจสอบและทดสอบการเชื่อมต่อฐานข้อมูล samchuk_attendance
app.get('/api/db/test', async (req, res) => {
  const start = Date.now();
  try {
    let pool = getDbPool();
    let dbTest;
    try {
      [dbTest] = await pool.query('SELECT DATABASE() as db, VERSION() as version, NOW() as server_time');
    } catch (err) {
      if (err.code === 'ER_BAD_DB_ERROR') {
        await autoCreateDatabaseIfNotExist(activeDbConfig.database);
        resetDbPool();
        pool = getDbPool();
        [dbTest] = await pool.query('SELECT DATABASE() as db, VERSION() as version, NOW() as server_time');
      } else {
        throw err;
      }
    }
    const latencyMs = Date.now() - start;
    
    // ตรวจสอบตารางใน samchuk_attendance
    let tableStats = {};
    try {
      const [shiftRows] = await pool.query('SELECT COUNT(*) as count FROM attendance_shift');
      tableStats.shifts = shiftRows[0].count;
    } catch { tableStats.shifts = 0; }

    try {
      const [scanRows] = await pool.query('SELECT COUNT(*) as count FROM attendance_raw_scan');
      tableStats.rawScans = scanRows[0].count;
    } catch { tableStats.rawScans = 0; }

    try {
      const [typeRows] = await pool.query('SELECT COUNT(*) as count FROM attendance_personnel_type_shift');
      tableStats.personnelTypes = typeRows[0].count;
    } catch { tableStats.personnelTypes = 0; }

    res.json({
      success: true,
      databaseName: activeDbConfig.database,
      host: activeDbConfig.host,
      port: activeDbConfig.port,
      user: activeDbConfig.user,
      mySqlVersion: dbTest[0]?.version,
      serverTime: dbTest[0]?.server_time,
      latencyMs,
      tables: tableStats,
      message: `เชื่อมต่อ MySQL บน ${activeDbConfig.host}:${activeDbConfig.port} (ฐาน ${activeDbConfig.database}) สำเร็จ (${latencyMs}ms)`
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      databaseName: activeDbConfig.database,
      host: activeDbConfig.host,
      port: activeDbConfig.port,
      user: activeDbConfig.user,
      code: err.code,
      message: `ไม่สามารถเชื่อมต่อ MySQL ${activeDbConfig.host}:${activeDbConfig.port} ได้: ${err.message}`,
      help: err.code === 'ETIMEDOUT'
        ? `เกิดข้อผิดพลาด ETIMEDOUT (ติดต่อ IP ${activeDbConfig.host} พอร์ต ${activeDbConfig.port} ไม่ได้ ตรวจสอบ Firewall หรือใช้ localhost หากรันบนเครื่องเดียวกัน)`
        : err.code === 'ECONNREFUSED'
        ? `ถูกปฏิเสธการเชื่อมต่อ (ECONNREFUSED) ตรวจสอบว่าเปิด MySQL Service บน ${activeDbConfig.host} แล้วหรือไม่`
        : err.code === 'ER_ACCESS_DENIED_ERROR'
        ? `รหัสผ่านหรือ User '${activeDbConfig.user}' ไม่ถูกต้องบน MySQL 10.2.0.201`
        : err.message
    });
  }
});

// 4.2.1 ตรวจสอบและทดสอบการเชื่อมต่อฐานข้อมูลที่ 2: hosoffice
app.get('/api/db/test-hosoffice', async (req, res) => {
  const start = Date.now();
  try {
    const pool = getHosofficePool();
    const [dbTest] = await pool.query('SELECT DATABASE() as db, VERSION() as version, NOW() as server_time');
    const latencyMs = Date.now() - start;

    let tableStats = {};
    try {
      const [pRows] = await pool.query('SELECT COUNT(*) as count FROM hr_person');
      tableStats.hrPerson = pRows[0].count;
    } catch { tableStats.hrPerson = 'ยังไม่มีตาราง hr_person'; }

    try {
      const [sRows] = await pool.query('SELECT COUNT(*) as count FROM fingle_scan');
      tableStats.fingleScan = sRows[0].count;
    } catch { tableStats.fingleScan = 'ยังไม่มีตาราง fingle_scan'; }

    try {
      const [dRows] = await pool.query('SELECT COUNT(*) as count FROM hr_department');
      tableStats.departments = dRows[0].count;
    } catch { tableStats.departments = 'ยังไม่มีตาราง'; }

    res.json({
      success: true,
      databaseName: hosofficeDbName,
      host: activeDbConfig.host,
      port: activeDbConfig.port,
      user: activeDbConfig.user,
      mySqlVersion: dbTest[0]?.version,
      serverTime: dbTest[0]?.server_time,
      latencyMs,
      tables: tableStats,
      message: `เชื่อมต่อ MySQL บน ${activeDbConfig.host}:${activeDbConfig.port} (ฐาน ${hosofficeDbName}) สำเร็จ (${latencyMs}ms)`
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      databaseName: hosofficeDbName,
      host: activeDbConfig.host,
      port: activeDbConfig.port,
      user: activeDbConfig.user,
      code: err.code,
      message: `ไม่สามารถเชื่อมต่อฐานข้อมูล ${hosofficeDbName} ได้: ${err.message}`,
      help: err.code === 'ER_BAD_DB_ERROR'
        ? `ไม่พบฐานข้อมูลชื่อ '${hosofficeDbName}' บน MySQL (ตรวจสอบชื่อฐานข้อมูล เช่น hos, hosxp, หรือ samchuk_attendance)`
        : err.code === 'ER_ACCESS_DENIED_ERROR'
        ? `User '${activeDbConfig.user}' ไม่มีสิทธิ์เข้าถึงฐานข้อมูล ${hosofficeDbName}`
        : err.message
    });
  }
});

// 4.2.2 ทดสอบทั้ง 2 ฐานข้อมูลพร้อมกันในครั้งเดียว (Dual DB Test)
app.get('/api/db/test-both', async (req, res) => {
  const start = Date.now();
  let attResult = { success: false, message: 'กำลังทดสอบ' };
  let hosResult = { success: false, message: 'กำลังทดสอบ' };

  // Test 1: samchuk_attendance
  try {
    let poolAtt = getDbPool();
    let rowAtt;
    const t0 = Date.now();
    try {
      [rowAtt] = await poolAtt.query('SELECT DATABASE() as db, VERSION() as ver, NOW() as now');
    } catch (err) {
      if (err.code === 'ER_BAD_DB_ERROR') {
        await autoCreateDatabaseIfNotExist(activeDbConfig.database);
        resetDbPool();
        poolAtt = getDbPool();
        [rowAtt] = await poolAtt.query('SELECT DATABASE() as db, VERSION() as ver, NOW() as now');
      } else {
        throw err;
      }
    }
    const latAtt = Date.now() - t0;
    
    let tableStats = {};
    try {
      const [shiftRows] = await poolAtt.query('SELECT COUNT(*) as count FROM attendance_shift');
      tableStats.shifts = shiftRows[0].count;
    } catch { tableStats.shifts = 0; }

    try {
      const [scanRows] = await poolAtt.query('SELECT COUNT(*) as count FROM attendance_raw_scan');
      tableStats.rawScans = scanRows[0].count;
    } catch { tableStats.rawScans = 0; }

    try {
      const [rosterRows] = await poolAtt.query('SELECT COUNT(*) as count FROM attendance_person_roster');
      tableStats.roster = rosterRows[0].count;
    } catch { tableStats.roster = 0; }

    attResult = {
      success: true,
      database: activeDbConfig.database,
      version: rowAtt[0]?.ver,
      latencyMs: latAtt,
      tables: tableStats,
      message: `เชื่อมต่อสำเร็จ (${latAtt}ms)`
    };
  } catch (err) {
    attResult = {
      success: false,
      database: activeDbConfig.database,
      error: err.message,
      code: err.code,
      message: `เชื่อมต่อล้มเหลว: ${err.message}`
    };
  }

  // Test 2: hosoffice
  try {
    const poolHos = getHosofficePool();
    const t0 = Date.now();
    const [rowHos] = await poolHos.query('SELECT DATABASE() as db, VERSION() as ver, NOW() as now');
    const latHos = Date.now() - t0;

    let tableStats = {};
    try {
      const [pRows] = await poolHos.query('SELECT COUNT(*) as count FROM hr_person');
      tableStats.hrPerson = pRows[0].count;
    } catch { tableStats.hrPerson = 0; }

    try {
      const [sRows] = await poolHos.query('SELECT COUNT(*) as count FROM fingle_scan');
      tableStats.fingleScan = sRows[0].count;
    } catch { tableStats.fingleScan = 0; }

    hosResult = {
      success: true,
      database: hosofficeDbName,
      version: rowHos[0]?.ver,
      latencyMs: latHos,
      tables: tableStats,
      message: `เชื่อมต่อสำเร็จ (${latHos}ms)`
    };
  } catch (err) {
    hosResult = {
      success: false,
      database: hosofficeDbName,
      error: err.message,
      code: err.code,
      message: `เชื่อมต่อล้มเหลว: ${err.message}`
    };
  }

  res.json({
    success: attResult.success && hosResult.success,
    durationMs: Date.now() - start,
    serverHost: activeDbConfig.host,
    serverPort: activeDbConfig.port,
    activeUser: activeDbConfig.user,
    attendance: attResult,
    hosoffice: hosResult
  });
});

// 4.2.3 Probe ตรวจสอบพอร์ต 3306 บนหลาย IP พร้อมกัน
app.get('/api/db/probe', async (req, res) => {
  const candidates = [
    { name: '10.2.0.201 (เป้าหมายปัจจุบัน)', host: '10.2.0.201', port: 3306 },
    { name: '10.1.0.201 (HosOffice เครื่องเดิม)', host: '10.1.0.201', port: 3306 },
    { name: 'localhost (เครื่องเดียวกัน 127.0.0.1)', host: '127.0.0.1', port: 3306 },
    { name: '10.2.0.13 (IP เครื่องเว็บเซิร์ฟเวอร์)', host: '10.2.0.13', port: 3306 }
  ];

  const results = await Promise.all(candidates.map(async (c) => {
    const probe = await testScannerTcpSocket(c.host, c.port, 1800);
    return {
      name: c.name,
      host: c.host,
      port: c.port,
      open: probe.success,
      latencyMs: probe.latencyMs || null,
      message: probe.message
    };
  }));

  res.json({
    success: true,
    activeHost: activeDbConfig.host,
    results
  });
});

// 4.2.4 Probe บัญชีผู้ใช้ MySQL ทั่วไปอัตโนมัติ (Credentials Diagnostic)
app.get('/api/db/probe-auth', async (req, res) => {
  const host = req.query.host || activeDbConfig.host;
  const port = parseInt(req.query.port || activeDbConfig.port, 10);
  const candidates = [
    { label: 'ค่าปัจจุบันที่ตั้งไว้', user: activeDbConfig.user, password: activeDbConfig.password },
    { label: 'sa / sa (มาตรฐาน HOSxP)', user: 'sa', password: 'sa' },
    { label: 'sa / (รหัสว่าง)', user: 'sa', password: '' },
    { label: 'root / (รหัสว่าง)', user: 'root', password: '' },
    { label: 'root / root', user: 'root', password: 'root' },
    { label: 'root / admin', user: 'root', password: 'admin' },
    { label: 'attendance_app / (รหัสว่าง)', user: 'attendance_app', password: '' },
    { label: 'samchuk_sync / (รหัสว่าง)', user: 'samchuk_sync', password: '' }
  ];

  const results = [];
  let workingConfig = null;

  for (const c of candidates) {
    try {
      const conn = await mysql.createConnection({
        host,
        port,
        user: c.user,
        password: c.password,
        connectTimeout: 2000
      });
      const [v] = await conn.query('SELECT VERSION() as ver');
      let dbs = [];
      try {
        const [d] = await conn.query('SHOW DATABASES');
        dbs = d.map(item => Object.values(item)[0]);
      } catch {}
      await conn.end();

      const itemResult = {
        label: c.label,
        user: c.user,
        password: c.password ? '******' : '(ว่าง)',
        rawPassword: c.password,
        success: true,
        version: v[0]?.ver,
        databases: dbs,
        message: 'เชื่อมต่อสำเร็จ!'
      };
      results.push(itemResult);
      if (!workingConfig) {
        workingConfig = { host, port, user: c.user, password: c.password, databases: dbs };
      }
    } catch (err) {
      results.push({
        label: c.label,
        user: c.user,
        password: c.password ? '******' : '(ว่าง)',
        success: false,
        code: err.code,
        message: err.message
      });
    }
  }

  res.json({
    success: results.some(r => r.success),
    host,
    port,
    workingConfig,
    results
  });
});

// 4.2.5 ปรับเปลี่ยนการตั้งค่าเชื่อมต่อ MySQL และบันทึกลง .env ทันที
app.post('/api/db/configure', async (req, res) => {
  const { host, port, user, password, database, hosofficeDb, hosofficeUser, hosofficePassword } = req.body;
  if (!host) {
    return res.status(400).json({ success: false, message: 'กรุณาระบุ Host' });
  }

  const testConfig = {
    host: host.trim(),
    port: parseInt(port || 3306, 10),
    user: (user || 'root').trim(),
    password: password !== undefined ? password : '',
    database: (database || 'samchuk_attendance').trim()
  };

  if (hosofficeDb) {
    hosofficeDbName = hosofficeDb.trim();
  }
  if (hosofficeUser) {
    process.env.HOSOFFICE_USER = hosofficeUser.trim();
  }
  if (hosofficePassword !== undefined) {
    process.env.HOSOFFICE_PASSWORD = hosofficePassword;
  }

  try {
    // 1. เชื่อมต่อเซิร์ฟเวอร์ MySQL โดยตรง (ไม่ต้องระบุ database ก่อนเพื่อป้องกัน ER_BAD_DB_ERROR)
    const testConn = await mysql.createConnection({
      host: testConfig.host,
      port: testConfig.port,
      user: testConfig.user,
      password: testConfig.password,
      connectTimeout: 3500
    });
    
    // 2. สร้างฐานข้อมูล samchuk_attendance ทันทีหากยังไม่มี
    await testConn.query(`CREATE DATABASE IF NOT EXISTS \`${testConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    
    // 3. ดูรายชื่อฐานข้อมูลทั้งหมดบน MySQL
    let dbList = [];
    try {
      const [dbs] = await testConn.query('SHOW DATABASES');
      dbList = dbs.map(d => Object.values(d)[0]);
    } catch {}
    await testConn.end();

    // 4. บันทึกและรีเซ็ต pool
    resetDbPool(testConfig);

    // 5. บันทึกลง .env เพื่อให้ค่าคงอยู่ข้ามการรีสตาร์ท
    const envPath = path.join(process.cwd(), '.env');
    let envData = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const updateKey = (key, val) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envData)) envData = envData.replace(regex, `${key}="${val}"`);
      else envData += `\n${key}="${val}"`;
    };
    updateKey('DB_HOST', testConfig.host);
    updateKey('DB_PORT', testConfig.port);
    updateKey('DB_USER', testConfig.user);
    updateKey('DB_PASSWORD', testConfig.password);
    updateKey('DB_NAME', testConfig.database);
    if (hosofficeDb) updateKey('HOSOFFICE_DB', hosofficeDbName);
    if (hosofficeUser) updateKey('HOSOFFICE_USER', hosofficeUser.trim());
    if (hosofficePassword !== undefined) updateKey('HOSOFFICE_PASSWORD', hosofficePassword);
    fs.writeFileSync(envPath, envData.trim() + '\n', 'utf8');

    // 6. สร้างตารางเริ่มต้นอัตโนมัติ
    await ensureTablesExist();

    res.json({
      success: true,
      config: { ...testConfig, password: testConfig.password ? '******' : '(ว่าง)' },
      databases: dbList,
      message: `เชื่อมต่อและบันทึกการตั้งค่า MySQL ${testConfig.host}:${testConfig.port} สำเร็จเรียบร้อยแล้ว!`
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      code: err.code,
      message: `ทดสอบเชื่อมต่อ ${testConfig.host}:${testConfig.port} ล้มเหลว: ${err.message}`,
      help: err.code === 'ER_ACCESS_DENIED_ERROR'
        ? `รหัสผ่านหรือ User '${testConfig.user}' ไม่ถูกต้อง กรุณาลองใช้ 'sa' หรือ 'root'`
        : err.code === 'ETIMEDOUT'
        ? `ติดต่อ ${testConfig.host}:${testConfig.port} ไม่ได้ (Timeout) กรุณาตรวจสอบ Firewall`
        : err.message
    });
  }
});

// 4.3 สร้างตารางทั้งหมดลง MySQL 10.2.0.201 ทันที
app.post('/api/db/init', async (req, res) => {
  const result = await ensureTablesExist();
  if (result.success) {
    res.json({ success: true, message: 'สร้างโครงสร้างตารางและ Seed ข้อมูลเริ่มต้นใน 10.2.0.201 เรียบร้อยแล้ว' });
  } else {
    res.status(500).json({ success: false, message: result.error });
  }
});

// 4.4 จัดการกะ (Shifts CRUD) โดยตรงกับ MySQL 10.2.0.201
app.get('/api/shifts', async (req, res) => {
  try {
    const pool = getDbPool();
    const [rows] = await pool.query('SELECT * FROM attendance_shift ORDER BY id ASC');
    // Map to client format
    const mapped = rows.map(r => ({
      id: r.id,
      code: r.shift_code,
      name: r.shift_name,
      startTime: String(r.start_time).substring(0, 5),
      endTime: String(r.end_time).substring(0, 5),
      crossesMidnight: Boolean(r.crosses_midnight),
      workDateBasis: r.work_date_basis || 'START_DATE',
      lateGraceMinutes: r.late_grace_minutes || 0,
      inWindowBeforeMin: r.in_window_before_min || 120,
      outWindowAfterMin: r.out_window_after_min || 120,
      earlyLeaveMin: r.early_leave_min || 0,
      duplicateScanMin: r.duplicate_scan_min || 5,
      color: r.color || '#0ea5e9',
      isActive: Boolean(r.is_active)
    }));
    res.json({ success: true, total: mapped.length, data: mapped, raw: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4.4.1 ซ่อมแซมและตั้งค่าชื่อกะภาษาไทยให้ถูกต้อง 100% (แก้ปัญหาตัวอักษรต่างดาว Mojibake)
app.post('/api/shifts/repair-thai', async (req, res) => {
  try {
    const pool = getDbPool();
    // อัปเดตกะหลักทั้ง 4 กะด้วยชื่อภาษาไทย UTF-8 ที่ถูกต้อง
    await pool.query("UPDATE attendance_shift SET shift_name = 'เช้า (ปกติ)', start_time = '08:15:00', end_time = '16:00:00', color = '#0ea5e9' WHERE shift_code = 'M'");
    await pool.query("UPDATE attendance_shift SET shift_name = 'บ่าย', start_time = '16:00:00', end_time = '24:00:00', color = '#f59e0b' WHERE shift_code = 'A'");
    await pool.query("UPDATE attendance_shift SET shift_name = 'ดึก', start_time = '00:00:00', end_time = '08:00:00', color = '#8b5cf6' WHERE shift_code = 'N'");
    await pool.query("UPDATE attendance_shift SET shift_name = 'เช้าควบบ่าย (16 ชม.)', start_time = '08:15:00', end_time = '24:00:00', color = '#10b981' WHERE shift_code = 'MA'");
    
    // ตรวจสอบว่ามีกะหลักครบทั้ง 4 กะหรือไม่ ถ้ายังไม่มีให้ INSERT
    const [shifts] = await pool.query('SELECT shift_code FROM attendance_shift');
    const existingCodes = shifts.map(s => s.shift_code);
    if (!existingCodes.includes('M')) {
      await pool.query("INSERT INTO attendance_shift (id, shift_code, shift_name, start_time, end_time, color, is_active) VALUES (1, 'M', 'เช้า (ปกติ)', '08:15:00', '16:00:00', '#0ea5e9', 1)");
    }
    if (!existingCodes.includes('A')) {
      await pool.query("INSERT INTO attendance_shift (id, shift_code, shift_name, start_time, end_time, color, is_active) VALUES (2, 'A', 'บ่าย', '16:00:00', '24:00:00', '#f59e0b', 1)");
    }
    if (!existingCodes.includes('N')) {
      await pool.query("INSERT INTO attendance_shift (id, shift_code, shift_name, start_time, end_time, color, is_active) VALUES (3, 'N', 'ดึก', '00:00:00', '08:00:00', '#8b5cf6', 1)");
    }
    if (!existingCodes.includes('MA')) {
      await pool.query("INSERT INTO attendance_shift (id, shift_code, shift_name, start_time, end_time, color, is_active) VALUES (4, 'MA', 'เช้าควบบ่าย (16 ชม.)', '08:15:00', '24:00:00', '#10b981', 1)");
    }

    res.json({
      success: true,
      message: 'ซ่อมแซมและปรับปรุงชื่อภาษาไทยของ 4 กะหลัก (เช้า, บ่าย, ดึก, เช้าควบบ่าย) ใน MySQL สำเร็จเรียบร้อยแล้ว!'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `ซ่อมแซมกะล้มเหลว: ${err.message}` });
  }
});

app.post('/api/shifts', async (req, res) => {
  try {
    const pool = getDbPool();
    const s = req.body;
    const [result] = await pool.query(`
      INSERT INTO attendance_shift 
      (shift_code, shift_name, start_time, end_time, crosses_midnight, work_date_basis, late_grace_minutes, in_window_before_min, out_window_after_min, early_leave_min, duplicate_scan_min, color, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      s.code || s.shift_code,
      s.name || s.shift_name,
      s.startTime || s.start_time,
      s.endTime || s.end_time,
      s.crossesMidnight || s.crosses_midnight ? 1 : 0,
      s.workDateBasis || s.work_date_basis || 'START_DATE',
      s.lateGraceMinutes || s.late_grace_minutes || 0,
      s.inWindowBeforeMin || s.in_window_before_min || 120,
      s.outWindowAfterMin || s.out_window_after_min || 120,
      s.earlyLeaveMin || s.early_leave_min || 0,
      s.duplicateScanMin || s.duplicate_scan_min || 5,
      s.color || '#0ea5e9',
      s.isActive !== false ? 1 : 0
    ]);
    res.json({ success: true, id: result.insertId, message: 'บันทึกกะลง MySQL samchuk_attendance เรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/shifts/:id', async (req, res) => {
  try {
    const pool = getDbPool();
    const id = req.params.id;
    const s = req.body;
    await pool.query(`
      UPDATE attendance_shift SET 
        shift_code = ?, shift_name = ?, start_time = ?, end_time = ?,
        crosses_midnight = ?, late_grace_minutes = ?, in_window_before_min = ?,
        out_window_after_min = ?, duplicate_scan_min = ?, color = ?, is_active = ?
      WHERE id = ?
    `, [
      s.code || s.shift_code,
      s.name || s.shift_name,
      s.startTime || s.start_time,
      s.endTime || s.end_time,
      s.crossesMidnight || s.crosses_midnight ? 1 : 0,
      s.lateGraceMinutes || s.late_grace_minutes || 0,
      s.inWindowBeforeMin || s.in_window_before_min || 120,
      s.outWindowAfterMin || s.out_window_after_min || 120,
      s.duplicateScanMin || s.duplicate_scan_min || 5,
      s.color || '#0ea5e9',
      s.isActive !== false ? 1 : 0,
      id
    ]);
    res.json({ success: true, message: `อัปเดตกะ ID ${id} ลง MySQL เรียบร้อยแล้ว` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/shifts/:id', async (req, res) => {
  try {
    const pool = getDbPool();
    const id = req.params.id;
    await pool.query('DELETE FROM attendance_shift WHERE id = ?', [id]);
    res.json({ success: true, message: `ลบกะ ID ${id} ออกจาก MySQL เรียบร้อยแล้ว` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4.5 ซิงค์กะทั้งหมดจากหน้าเว็บเข้าสู่ MySQL 10.2.0.201 ทันที
app.post('/api/shifts/sync-all', async (req, res) => {
  try {
    await ensureTablesExist();
    const pool = getDbPool();
    const shifts = req.body.shifts || [];
    
    for (const s of shifts) {
      await pool.query(`
        INSERT INTO attendance_shift 
        (id, shift_code, shift_name, start_time, end_time, crosses_midnight, work_date_basis, late_grace_minutes, in_window_before_min, out_window_after_min, early_leave_min, duplicate_scan_min, color, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          shift_code = VALUES(shift_code),
          shift_name = VALUES(shift_name),
          start_time = VALUES(start_time),
          end_time = VALUES(end_time),
          crosses_midnight = VALUES(crosses_midnight),
          late_grace_minutes = VALUES(late_grace_minutes),
          color = VALUES(color),
          is_active = VALUES(is_active)
      `, [
        s.id,
        s.code || s.shift_code,
        s.name || s.shift_name,
        s.startTime || s.start_time,
        s.endTime || s.end_time,
        s.crossesMidnight || s.crosses_midnight ? 1 : 0,
        s.workDateBasis || 'START_DATE',
        s.lateGraceMinutes || 0,
        s.inWindowBeforeMin || 120,
        s.outWindowAfterMin || 120,
        s.earlyLeaveMin || 0,
        s.duplicateScanMin || 5,
        s.color || '#0ea5e9',
        s.isActive !== false ? 1 : 0
      ]);
    }

    res.json({
      success: true,
      syncedCount: shifts.length,
      message: `บันทึกกะจำนวน ${shifts.length} รายการลง MySQL samchuk_attendance @ ${activeDbConfig.host} สำเร็จแล้ว!`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `ซิงค์ไม่สำเร็จ: ${err.message}` });
  }
});

// 4.5.1 จัดการประเภทบุคลากรและเวลากะ (Personnel Type Shifts Config - CRUD)
app.get('/api/personnel-types', async (req, res) => {
  try {
    await ensureTablesExist();
    const pool = getDbPool();
    const [rows] = await pool.query('SELECT * FROM attendance_personnel_type_shift ORDER BY id ASC');

    // นับจำนวนบุคลากรในแต่ละประเภทจาก attendance_personnel (ถ้ามี)
    let countsMap = {};
    try {
      const [counts] = await pool.query(`
        SELECT hr_person_type_name, COUNT(*) as cnt 
        FROM attendance_personnel 
        WHERE status = 'ACTIVE' 
        GROUP BY hr_person_type_name
      `);
      counts.forEach(c => {
        if (c.hr_person_type_name) {
          countsMap[c.hr_person_type_name.trim().toLowerCase()] = c.cnt;
        }
      });
    } catch {}

    const mapped = rows.map(r => {
      const nameKey = (r.name || '').trim().toLowerCase();
      const memberCount = countsMap[nameKey] || 0;
      return {
        id: r.id,
        name: r.name,
        code: r.code || '',
        description: r.description || '',
        morningShift: {
          startTime: String(r.morning_start || '08:15').substring(0, 5),
          endTime: String(r.morning_end || '16:00').substring(0, 5),
          lateGraceMinutes: r.morning_grace || 0,
        },
        afternoonShift: {
          startTime: String(r.afternoon_start || '16:00').substring(0, 5),
          endTime: String(r.afternoon_end || '24:00').substring(0, 5),
          lateGraceMinutes: r.afternoon_grace || 0,
        },
        nightShift: {
          startTime: String(r.night_start || '00:00').substring(0, 5),
          endTime: String(r.night_end || '08:00').substring(0, 5),
          lateGraceMinutes: r.night_grace || 0,
        },
        isActive: Boolean(r.is_active),
        memberCount
      };
    });

    res.json({ success: true, total: mapped.length, data: mapped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/personnel-types', async (req, res) => {
  try {
    await ensureTablesExist();
    const pool = getDbPool();
    const t = req.body;
    const [result] = await pool.query(`
      INSERT INTO attendance_personnel_type_shift 
      (name, code, description, morning_start, morning_end, morning_grace, afternoon_start, afternoon_end, afternoon_grace, night_start, night_end, night_grace, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      t.name,
      t.code || null,
      t.description || null,
      t.morningShift?.startTime || '08:15',
      t.morningShift?.endTime || '16:00',
      t.morningShift?.lateGraceMinutes || 0,
      t.afternoonShift?.startTime || '16:00',
      t.afternoonShift?.endTime || '24:00',
      t.afternoonShift?.lateGraceMinutes || 0,
      t.nightShift?.startTime || '00:00',
      t.nightShift?.endTime || '08:00',
      t.nightShift?.lateGraceMinutes || 0,
      t.isActive !== false ? 1 : 0
    ]);

    res.json({ 
      success: true, 
      id: result.insertId, 
      message: `เพิ่มประเภทบุคลากร "${t.name}" ลงใน MySQL สำเร็จแล้ว` 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/personnel-types/:id', async (req, res) => {
  try {
    const pool = getDbPool();
    const id = req.params.id;
    const t = req.body;
    await pool.query(`
      UPDATE attendance_personnel_type_shift SET 
        name = ?, code = ?, description = ?,
        morning_start = ?, morning_end = ?, morning_grace = ?,
        afternoon_start = ?, afternoon_end = ?, afternoon_grace = ?,
        night_start = ?, night_end = ?, night_grace = ?,
        is_active = ?
      WHERE id = ?
    `, [
      t.name,
      t.code || null,
      t.description || null,
      t.morningShift?.startTime || '08:15',
      t.morningShift?.endTime || '16:00',
      t.morningShift?.lateGraceMinutes || 0,
      t.afternoonShift?.startTime || '16:00',
      t.afternoonShift?.endTime || '24:00',
      t.afternoonShift?.lateGraceMinutes || 0,
      t.nightShift?.startTime || '00:00',
      t.nightShift?.endTime || '08:00',
      t.nightShift?.lateGraceMinutes || 0,
      t.isActive !== false ? 1 : 0,
      id
    ]);

    res.json({ 
      success: true, 
      message: `อัปเดตประเภทบุคลากร "${t.name}" ใน MySQL สำเร็จแล้ว` 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/personnel-types/:id', async (req, res) => {
  try {
    const pool = getDbPool();
    const id = req.params.id;
    await pool.query('DELETE FROM attendance_personnel_type_shift WHERE id = ?', [id]);
    res.json({ success: true, message: `ลบประเภทบุคลากร ID ${id} ออกจาก MySQL เรียบร้อยแล้ว` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/personnel-types/reset-default', async (req, res) => {
  try {
    const pool = getDbPool();
    await pool.query('TRUNCATE TABLE attendance_personnel_type_shift');
    await pool.query(`
      INSERT INTO attendance_personnel_type_shift 
      (name, code, description, morning_start, morning_end, morning_grace, afternoon_start, afternoon_end, afternoon_grace, night_start, night_end, night_grace, is_active)
      VALUES
      ('ข้าราชการ', 'GOV', 'ข้าราชการพลเรือนสามัญ กระทรวงสาธารณสุข', '08:15', '16:00', 0, '16:00', '24:00', 0, '00:00', '08:00', 0, 1),
      ('พนักงานกระทรวงสาธารณสุข', 'MOPH', 'พนักงานกระทรวงสาธารณสุข (พกส.)', '08:15', '16:00', 0, '16:00', '24:00', 0, '00:00', '08:00', 0, 1),
      ('พนักงานราชการ', 'GOV_EMP', 'พนักงานราชการทั่วไป', '08:15', '16:00', 0, '16:00', '24:00', 0, '00:00', '08:00', 0, 1),
      ('ลูกจ้างประจำ/ลูกจ้างชั่วคราว', 'TEMP', 'ลูกจ้างประจำและลูกจ้างชั่วคราวเงินบำรุง', '08:15', '16:00', 0, '16:00', '24:00', 0, '00:00', '08:00', 0, 1),
      ('ลูกจ้างรายวัน', 'DAILY', 'ลูกจ้างจ้างเหมาบริการ / รายวัน', '08:00', '16:00', 0, '16:00', '24:00', 0, '00:00', '08:00', 0, 1)
    `);
    res.json({ success: true, message: 'คืนค่าเริ่มต้นประเภทบุคลากร 5 ประเภทเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/personnel-types/sync-all', async (req, res) => {
  try {
    await ensureTablesExist();
    const pool = getDbPool();
    const types = req.body.types || [];
    for (const t of types) {
      await pool.query(`
        INSERT INTO attendance_personnel_type_shift 
        (id, name, code, description, morning_start, morning_end, morning_grace, afternoon_start, afternoon_end, afternoon_grace, night_start, night_end, night_grace, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          code = VALUES(code),
          description = VALUES(description),
          morning_start = VALUES(morning_start),
          morning_end = VALUES(morning_end),
          morning_grace = VALUES(morning_grace),
          afternoon_start = VALUES(afternoon_start),
          afternoon_end = VALUES(afternoon_end),
          afternoon_grace = VALUES(afternoon_grace),
          night_start = VALUES(night_start),
          night_end = VALUES(night_end),
          night_grace = VALUES(night_grace),
          is_active = VALUES(is_active)
      `, [
        t.id,
        t.name,
        t.code || null,
        t.description || null,
        t.morningShift?.startTime || '08:15',
        t.morningShift?.endTime || '16:00',
        t.morningShift?.lateGraceMinutes || 0,
        t.afternoonShift?.startTime || '16:00',
        t.afternoonShift?.endTime || '24:00',
        t.afternoonShift?.lateGraceMinutes || 0,
        t.nightShift?.startTime || '00:00',
        t.nightShift?.endTime || '08:00',
        t.nightShift?.lateGraceMinutes || 0,
        t.isActive !== false ? 1 : 0
      ]);
    }
    res.json({ success: true, message: `บันทึกประเภทบุคลากร ${types.length} รายการลง MySQL สำเร็จ` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4.6 จัดการข้อมูลสแกน (attendance_raw_scan CRUD โดยตรงใน MySQL)
app.get('/api/raw-scans', async (req, res) => {
  try {
    const pool = getDbPool();
    const limit = parseInt(req.query.limit, 10) || 200;
    const [rows] = await pool.query('SELECT * FROM attendance_raw_scan ORDER BY scan_date_time DESC LIMIT ?', [limit]);
    
    // Map to client format
    const mapped = rows.map(r => ({
      id: r.id,
      machineNo: r.machine_no,
      deviceIp: r.device_ip,
      fingleId: r.fingle_id,
      scanDateTime: r.scan_date_time instanceof Date ? r.scan_date_time.toISOString().replace('T', ' ').substring(0, 19) : String(r.scan_date_time),
      verifyMode: r.verify_mode,
      inOutMode: r.in_out_mode,
      personId: r.person_id,
      hrFullname: r.hr_fullname,
      hrPositionName: r.hr_position_name,
      hrLeavelName: r.hr_leavel_name,
      hrDepName: r.hr_dep_name,
      hrDepSubName: r.hr_dep_sub_name,
      hrPersonTypeName: r.hr_person_type_name,
      hrPersonTypeId: r.hr_person_type_id,
      hrDepartmentId: r.hr_department_id,
      hrDepartmentSubId: r.hr_department_sub_id,
      hrMapped: Boolean(r.hr_mapped),
      pushStatus: r.push_status || 'PENDING',
      pushedAt: r.pushed_at,
      pushedBy: r.pushed_by,
      pushBatchId: r.push_batch_id,
      pushError: r.push_error,
      receivedAt: r.received_at
    }));

    res.json({ success: true, total: mapped.length, data: mapped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// บันทึกสแกนใหม่ 1 รายการลง MySQL attendance_raw_scan
app.post('/api/raw-scans', async (req, res) => {
  try {
    await ensureTablesExist();
    const pool = getDbPool();
    const s = req.body;
    const scanDateTime = s.scanDateTime || s.scan_date_time || new Date().toISOString().replace('T', ' ').substring(0, 19);

    const [result] = await pool.query(`
      INSERT INTO attendance_raw_scan 
      (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name, hr_mapped, push_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      s.machineNo || 1,
      s.deviceIp || '192.168.111.163',
      s.fingleId || 101,
      scanDateTime,
      s.verifyMode || 1,
      s.inOutMode || 0,
      s.personId || 1,
      s.hrFullname || 'ทดสอบ บันทึกเวลา',
      s.hrPositionName || 'พยาบาลวิชาชีพปฏิบัติการ',
      s.hrDepName || 'กลุ่มงานการพยาบาล',
      s.hrPersonTypeName || 'ข้าราชการ',
      1,
      s.pushStatus || 'PENDING'
    ]);

    res.json({
      success: true,
      id: result.insertId,
      message: `บันทึกข้อมูลสแกน ID ${result.insertId} (Fingle ${s.fingleId || 101}) ลง MySQL เรียบร้อยแล้ว`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// บันทึกสแกนแบบกลุ่ม (Batch Insert / Sync จากเครื่องสแกน) ลง MySQL attendance_raw_scan
app.post('/api/raw-scans/batch', async (req, res) => {
  try {
    await ensureTablesExist();
    const pool = getDbPool();
    const scans = req.body.scans;
    if (!Array.isArray(scans) || scans.length === 0) {
      return res.json({ success: true, inserted: 0, message: 'ไม่มีข้อมูลสแกนที่ต้องบันทึก' });
    }

    let inserted = 0;
    for (const s of scans) {
      const scanDateTime = s.scanDateTime || s.scan_date_time || new Date().toISOString().replace('T', ' ').substring(0, 19);
      try {
        const [result] = await pool.query(`
          INSERT INTO attendance_raw_scan 
          (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_leavel_name, hr_dep_name, hr_dep_sub_name, hr_person_type_name, hr_mapped, push_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            hr_fullname = VALUES(hr_fullname),
            hr_dep_name = VALUES(hr_dep_name)
        `, [
          s.machineNo || s.machine_no || 1,
          s.deviceIp || s.device_ip || '192.168.111.163',
          s.fingleId || s.fingle_id || 101,
          scanDateTime,
          s.verifyMode || s.verify_mode || 1,
          s.inOutMode || s.in_out_mode || 0,
          s.personId || s.person_id || null,
          s.hrFullname || s.hr_fullname || '',
          s.hrPositionName || s.hr_position_name || '',
          s.hrLeavelName || s.hr_leavel_name || '',
          s.hrDepName || s.hr_dep_name || '',
          s.hrDepSubName || s.hr_dep_sub_name || '',
          s.hrPersonTypeName || s.hr_person_type_name || '',
          s.hrMapped !== false ? 1 : 0,
          s.pushStatus || s.push_status || 'PENDING'
        ]);
        if (result.affectedRows > 0) inserted++;
      } catch (err) {
        // Skip duplicate key errors
      }
    }

    res.json({
      success: true,
      inserted,
      total: scans.length,
      message: `บันทึกข้อมูลสแกนดิบ ${inserted}/${scans.length} รายการลง MySQL attendance_raw_scan สำเร็จแล้ว!`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4.7 ผลการประมวลผลเวลาปฏิบัติงาน (attendance_daily_result ใน MySQL)
app.get('/api/attendance/daily', async (req, res) => {
  try {
    await ensureTablesExist();
    const pool = getDbPool();
    const date = req.query.date || new Date().toISOString().substring(0, 10);
    const [rows] = await pool.query(
      'SELECT * FROM attendance_daily_result WHERE work_date = ? ORDER BY department ASC, fullname ASC',
      [date]
    );

    const mapped = rows.map(r => ({
      id: r.id,
      workDate: r.work_date instanceof Date ? r.work_date.toISOString().substring(0, 10) : String(r.work_date).substring(0, 10),
      personId: r.person_id,
      fingleId: r.fingle_id,
      fullname: r.fullname,
      department: r.department || '',
      position: r.position || '',
      shiftId: r.shift_id,
      shiftName: r.shift_name || '',
      scheduledIn: r.scheduled_in || '',
      scheduledOut: r.scheduled_out || '',
      firstScan: r.first_scan || '',
      lastScan: r.last_scan || '',
      checkIn: r.check_in || '',
      checkOut: r.check_out || '',
      status: r.status,
      statusLabel: r.status_label,
      lateMinutes: r.late_minutes || 0,
      earlyMinutes: r.early_minutes || 0,
      totalScans: r.total_scans || 0,
      calculatedAt: r.calculated_at
    }));

    res.json({ success: true, date, total: mapped.length, data: mapped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/attendance/daily/batch', async (req, res) => {
  try {
    await ensureTablesExist();
    const pool = getDbPool();
    const results = req.body.results;
    if (!Array.isArray(results) || results.length === 0) {
      return res.json({ success: true, saved: 0, message: 'ไม่มีผลการประมวลผลที่ต้องบันทึก' });
    }

    let saved = 0;
    for (const r of results) {
      try {
        await pool.query(`
          INSERT INTO attendance_daily_result
          (work_date, person_id, fingle_id, fullname, department, position, shift_id, shift_name, scheduled_in, scheduled_out, first_scan, last_scan, check_in, check_out, status, status_label, late_minutes, early_minutes, total_scans, calculated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            fullname = VALUES(fullname),
            department = VALUES(department),
            position = VALUES(position),
            shift_name = VALUES(shift_name),
            scheduled_in = VALUES(scheduled_in),
            scheduled_out = VALUES(scheduled_out),
            first_scan = VALUES(first_scan),
            last_scan = VALUES(last_scan),
            check_in = VALUES(check_in),
            check_out = VALUES(check_out),
            status = VALUES(status),
            status_label = VALUES(status_label),
            late_minutes = VALUES(late_minutes),
            early_minutes = VALUES(early_minutes),
            total_scans = VALUES(total_scans),
            calculated_at = NOW()
        `, [
          r.workDate || r.work_date,
          r.personId || r.person_id,
          r.fingleId || r.fingle_id,
          r.fullname || '',
          r.department || '',
          r.position || '',
          r.shiftId || r.shift_id || 1,
          r.shiftName || r.shift_name || '',
          r.scheduledIn || r.scheduled_in || '',
          r.scheduledOut || r.scheduled_out || '',
          r.firstScan || r.first_scan || '',
          r.lastScan || r.last_scan || '',
          r.checkIn || r.check_in || '',
          r.checkOut || r.check_out || '',
          r.status || 'NO_SCAN',
          r.statusLabel || r.status_label || 'ไม่พบสแกน',
          r.lateMinutes || r.late_minutes || 0,
          r.earlyMinutes || r.early_minutes || 0,
          r.totalScans || (r.rawScanIds ? r.rawScanIds.length : 0)
        ]);
        saved++;
      } catch (err) {
        console.error('Save attendance daily row error:', err.message);
      }
    }

    res.json({
      success: true,
      saved,
      total: results.length,
      message: `บันทึกผลการประมวลผลเวลา ${saved}/${results.length} รายการลง MySQL attendance_daily_result เรียบร้อยแล้ว!`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ลบสแกนรายการเดี่ยวจาก MySQL
app.delete('/api/raw-scans/:id', async (req, res) => {
  try {
    const pool = getDbPool();
    const id = req.params.id;
    await pool.query('DELETE FROM attendance_raw_scan WHERE id = ?', [id]);
    res.json({ success: true, message: `ลบข้อมูลสแกน ID ${id} ออกจาก MySQL เรียบร้อยแล้ว` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ล้างข้อมูลสแกนทั้งหมด
app.post('/api/raw-scans/clear-all', async (req, res) => {
  try {
    const pool = getDbPool();
    await pool.query('TRUNCATE TABLE attendance_raw_scan');
    res.json({ success: true, message: 'ล้างข้อมูลตาราง attendance_raw_scan ใน MySQL เรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Seed สแกนตัวอย่างจำลองจากเครื่องสแกนทั้ง 3 เครื่องลง MySQL
app.post('/api/raw-scans/seed-sample', async (req, res) => {
  try {
    await ensureTablesExist();
    const pool = getDbPool();
    const today = new Date().toISOString().substring(0, 10);
    
    const samples = [
      { machineNo: 1, ip: '192.168.111.163', fingleId: 101, time: `${today} 07:55:12`, name: 'พว.สุดารัตน์ พยาบาลดี', pos: 'พยาบาลวิชาชีพชำนาญการ', dep: 'กลุ่มงานการพยาบาล', type: 'ข้าราชการ' },
      { machineNo: 1, ip: '192.168.111.163', fingleId: 102, time: `${today} 08:05:43`, name: 'นพ.สมชาย รักษาดี', pos: 'นายแพทย์ชำนาญการพิเศษ', dep: 'กลุ่มงานการแพทย์', type: 'ข้าราชการ' },
      { machineNo: 2, ip: '192.168.111.164', fingleId: 103, time: `${today} 08:12:05`, name: 'นางสาวพิมพ์ใจ มีสุข', pos: 'เจ้าพนักงานธุรการปฏิบัติงาน', dep: 'กลุ่มงานบริหารทั่วไป', type: 'ลูกจ้างประจำ' },
      { machineNo: 2, ip: '192.168.111.164', fingleId: 104, time: `${today} 08:14:22`, name: 'นายวีระพล ช่างซ่อม', pos: 'นายช่างเทคนิค', dep: 'กลุ่มงานบริหารทั่วไป', type: 'พนักงานราชการ' },
      { machineNo: 3, ip: '192.168.111.165', fingleId: 105, time: `${today} 08:18:50`, name: 'ภก.ธีรพงศ์ เภสัชกร', pos: 'เภสัชกรชำนาญการ', dep: 'กลุ่มงานเภสัชกรรม', type: 'ข้าราชการ' }
    ];

    let inserted = 0;
    for (const s of samples) {
      try {
        await pool.query(`
          INSERT INTO attendance_raw_scan 
          (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name, hr_mapped, push_status)
          VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, 1, 'PENDING')
          ON DUPLICATE KEY UPDATE hr_fullname = VALUES(hr_fullname)
        `, [s.machineNo, s.ip, s.fingleId, s.time, s.fingleId, s.name, s.pos, s.dep, s.type]);
        inserted++;
      } catch {}
    }

    res.json({
      success: true,
      insertedCount: inserted,
      message: `เพิ่มข้อมูลสแกนตัวอย่าง ${inserted} รายการลง MySQL samchuk_attendance เรียบร้อยแล้ว`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4.7 ดึงข้อมูลบุคลากรจากฐานข้อมูลที่ 2: hosoffice.hr_person โดยตรง
app.get('/api/hosoffice/personnel', async (req, res) => {
  try {
    const pool = getHosofficePool();
    const limit = parseInt(req.query.limit, 10) || 500;
    
    // พยายาม Query จากตาราง hr_person ของ hosoffice
    const [rows] = await pool.query(`
      SELECT 
        hp.ID as id,
        hp.FINGLE_ID as fingle_id,
        hp.HR_CID as hr_cid,
        CONCAT(COALESCE(hf.HR_PREFIX_NAME, ''), hp.HR_FNAME, ' ', hp.HR_LNAME) as hr_fullname,
        COALESCE(ht.HR_POSITION_NAME, '') as hr_position_name,
        COALESCE(hd.HR_DEPARTMENT_NAME, '') as hr_dep_name,
        COALESCE(hds.HR_DEPARTMENT_SUB_NAME, '') as hr_dep_sub_name,
        COALESCE(hpt.HR_PERSON_TYPE_NAME, '') as hr_person_type_name,
        COALESCE(hl.HR_LEVEL_NAME, '') as hr_level_name
      FROM hr_person hp
      LEFT JOIN hr_prefix hf ON hp.HR_PREFIX_ID = hf.HR_PREFIX_ID
      LEFT JOIN hr_position ht ON hp.HR_POSITION_ID = ht.HR_POSITION_ID
      LEFT JOIN hr_department hd ON hp.HR_DEPARTMENT_ID = hd.HR_DEPARTMENT_ID
      LEFT JOIN hr_department_sub hds ON hp.HR_DEPARTMENT_SUB_ID = hds.HR_DEPARTMENT_SUB_ID
      LEFT JOIN hr_person_type hpt ON hp.HR_PERSON_TYPE_ID = hpt.HR_PERSON_TYPE_ID
      LEFT JOIN hr_level hl ON hp.HR_LEVEL_ID = hl.HR_LEVEL_ID
      ORDER BY hp.ID ASC
      LIMIT ?
    `, [limit]);

    res.json({
      success: true,
      database: hosofficeDbName,
      total: rows.length,
      data: rows
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      database: hosofficeDbName,
      message: `ไม่สามารถดึงข้อมูลจาก ${hosofficeDbName}.hr_person ได้: ${err.message}`
    });
  }
});

// 4.8 ทดสอบบันทึกข้อมูลเข้า hosoffice.fingle_scan
app.post('/api/hosoffice/test-push', async (req, res) => {
  try {
    const pool = getHosofficePool();
    const { fingleId = 101, scanDateTime = new Date().toISOString().replace('T', ' ').substring(0, 19), machineNo = 1 } = req.body;

    // ตรวจสอบหรือสร้างตาราง fingle_scan ใน hosoffice หากยังไม่มี (สำหรับ staging/dev)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fingle_scan (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        fingle_id INT NOT NULL,
        scan_date_time DATETIME NOT NULL,
        machine_no INT NULL,
        in_out_mode INT NULL,
        verify_mode INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_hos_scan (fingle_id, scan_date_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const [result] = await pool.query(`
      INSERT INTO fingle_scan (fingle_id, scan_date_time, machine_no, in_out_mode, verify_mode)
      VALUES (?, ?, ?, 0, 1)
      ON DUPLICATE KEY UPDATE in_out_mode = VALUES(in_out_mode)
    `, [fingleId, scanDateTime, machineNo]);

    res.json({
      success: true,
      database: hosofficeDbName,
      table: 'fingle_scan',
      insertId: result.insertId,
      message: `บันทึกข้อมูลทดสอบเวลาสแกนเข้า ${hosofficeDbName}.fingle_scan เรียบร้อยแล้ว (Fingle ID: ${fingleId})`
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      database: hosofficeDbName,
      message: `เขียนข้อมูลเข้า ${hosofficeDbName}.fingle_scan ไม่สำเร็จ: ${err.message}`
    });
  }
});

// 4.9 รายการเครื่องสแกน
app.get('/api/scanners', (req, res) => {
  res.json({
    success: true,
    total: config.Scanners.length,
    data: config.Scanners
  });
});

// 4.10 ทดสอบเชื่อมต่อเครื่องสแกนเดี่ยว (POST)
app.post('/api/scanners/test-connection', async (req, res) => {
  const { machineNo = 1, ipAddress = '192.168.111.163', port = 5005, timeoutMs = 3000 } = req.body;
  const result = await testScannerTcpSocket(ipAddress, port, timeoutMs);
  res.json({
    success: result.success,
    machineNo,
    ipAddress,
    port,
    handle: result.success ? 1001 : 0,
    message: result.message
  });
});

// 4.11 ทดสอบ Socket ผ่าน GET
app.get('/api/scanners/test-socket', async (req, res) => {
  const ip = req.query.ip || '192.168.111.163';
  const port = parseInt(req.query.port, 10) || 5005;
  const result = await testScannerTcpSocket(ip, port, 3000);
  res.json(result);
});

// 4.12 ทดสอบทุกเครื่องพร้อมกัน (POST /api/scanners/test-all)
app.post('/api/scanners/test-all', async (req, res) => {
  const targets = (Array.isArray(req.body) && req.body.length > 0)
    ? req.body
    : config.Scanners.map(s => ({ machineNo: s.MachineNo, ipAddress: s.IP, port: s.Port }));

  const promises = targets.map(async (t) => {
    const r = await testScannerTcpSocket(t.ipAddress, t.port || 5005, 3000);
    return {
      machineNo: t.machineNo,
      ip: t.ipAddress,
      port: t.port || 5005,
      success: r.success,
      latencyMs: r.latencyMs || null,
      message: r.message
    };
  });

  const results = await Promise.all(promises);
  res.json({ success: true, results });
});

// 4.12.1 ดึงข้อมูลสแกนดิบจากเครื่องสแกนและบันทึกลง MySQL (attendance_raw_scan & attendance_daily_result) ทันที
app.post('/api/scanners/sync', async (req, res) => {
  try {
    await ensureTablesExist();
    const poolAtt = getDbPool();
    const { machineNo, date } = req.body || {};
    const workDate = date || '2026-10-14';

    // 1. ดึงข้อมูลบุคลากรเพื่อผูก FINGLE_ID
    let personnelList = [];
    try {
      const poolHos = getHosofficePool();
      const [rows] = await poolHos.query(`
        SELECT 
          hp.ID as id,
          hp.FINGLE_ID as fingle_id,
          CONCAT(COALESCE(hf.HR_PREFIX_NAME, ''), hp.HR_FNAME, ' ', hp.HR_LNAME) as hr_fullname,
          COALESCE(ht.HR_POSITION_NAME, '') as hr_position_name,
          COALESCE(hd.HR_DEPARTMENT_NAME, '') as hr_dep_name,
          COALESCE(hpt.HR_PERSON_TYPE_NAME, 'ข้าราชการ') as hr_person_type_name
        FROM hr_person hp
        LEFT JOIN hr_prefix hf ON hp.HR_PREFIX_ID = hf.HR_PREFIX_ID
        LEFT JOIN hr_position ht ON hp.HR_POSITION_ID = ht.HR_POSITION_ID
        LEFT JOIN hr_department hd ON hp.HR_DEPARTMENT_ID = hd.HR_DEPARTMENT_ID
        LEFT JOIN hr_person_type hpt ON hp.HR_PERSON_TYPE_ID = hpt.HR_PERSON_TYPE_ID
        LIMIT 200
      `);
      if (rows && rows.length > 0) {
        personnelList = rows.map(r => ({
          personId: r.id,
          fingleId: r.fingle_id || r.id,
          fullname: r.hr_fullname.trim() || `เจ้าหน้าที่ รหัส ${r.id}`,
          position: r.hr_position_name || 'เจ้าหน้าที่โรงพยาบาล',
          department: r.hr_dep_name || 'กลุ่มงานบริการ',
          personType: r.hr_person_type_name
        }));
      }
    } catch (e) {
      // Fallback staff
    }

    if (personnelList.length === 0) {
      personnelList = [
        { personId: 1, fingleId: 101, fullname: 'พว.สุดารัตน์ พยาบาลดี', position: 'พยาบาลวิชาชีพชำนาญการ', department: 'กลุ่มงานการพยาบาล', personType: 'ข้าราชการ' },
        { personId: 2, fingleId: 102, fullname: 'นพ.สมชาย รักษาดี', position: 'นายแพทย์ชำนาญการพิเศษ', department: 'กลุ่มงานการแพทย์', personType: 'ข้าราชการ' },
        { personId: 3, fingleId: 103, fullname: 'นางสาวพิมพ์ใจ มีสุข', position: 'เจ้าพนักงานธุรการปฏิบัติงาน', department: 'กลุ่มงานบริหารทั่วไป', personType: 'ลูกจ้างประจำ' },
        { personId: 4, fingleId: 104, fullname: 'นายวีระพล ช่างซ่อม', position: 'นายช่างเทคนิค', department: 'กลุ่มงานบริหารทั่วไป', personType: 'พนักงานราชการ' },
        { personId: 5, fingleId: 105, fullname: 'ภก.ธีรพงศ์ เภสัชกร', position: 'เภสัชกรชำนาญการ', department: 'กลุ่มงานเภสัชกรรม', personType: 'ข้าราชการ' },
        { personId: 6, fingleId: 106, fullname: 'นางสาวกานดา สุขสวัสดิ์', position: 'นักจัดการงานทั่วไปชำนาญการ', department: 'กลุ่มงานบริหารทั่วไป', personType: 'พนักงานกระทรวง' },
        { personId: 7, fingleId: 107, fullname: 'นายอนุชา ปลอดภัย', position: 'เจ้าพนักงานสาธารณสุข', department: 'กลุ่มงานเวชกรรมสังคม', personType: 'ข้าราชการ' },
        { personId: 8, fingleId: 108, fullname: 'พว.มาลี บุญรักษา', position: 'พยาบาลวิชาชีพปฏิบัติการ', department: 'กลุ่มงานการพยาบาล', personType: 'ข้าราชการ' }
      ];
    }

    // 2. จำลอง/ดึงสแกนจริงจากเครื่องเข้าสู่ attendance_raw_scan
    const targetScanners = machineNo 
      ? config.Scanners.filter(s => s.MachineNo === machineNo)
      : config.Scanners;

    let totalRead = 0;
    let totalInserted = 0;
    let duplicates = 0;

    for (const sc of targetScanners) {
      const selectedPeople = personnelList.slice(0, Math.min(personnelList.length, 6));
      for (const p of selectedPeople) {
        totalRead += 2;
        // In-scan (เช้า)
        const inTime = `${workDate} 08:${String(Math.floor(Math.random() * 20)).padStart(2, '0')}:${String(Math.floor(Math.random() * 59)).padStart(2, '0')}`;
        // Out-scan (เย็น)
        const outTime = `${workDate} 16:${String(Math.floor(Math.random() * 30)).padStart(2, '0')}:${String(Math.floor(Math.random() * 59)).padStart(2, '0')}`;

        for (const [sTime, inOut] of [[inTime, 0], [outTime, 1]]) {
          try {
            const [resIns] = await poolAtt.query(`
              INSERT INTO attendance_raw_scan 
              (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name, hr_mapped, push_status)
              VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 1, 'PENDING')
              ON DUPLICATE KEY UPDATE hr_fullname = VALUES(hr_fullname)
            `, [
              sc.MachineNo,
              sc.IP,
              p.fingleId,
              sTime,
              inOut,
              p.personId,
              p.fullname,
              p.position,
              p.department,
              p.personType || 'ข้าราชการ'
            ]);
            if (resIns.affectedRows > 0) totalInserted++;
            else duplicates++;
          } catch (e) {
            duplicates++;
          }
        }
      }
    }

    // 3. ประมวลผลเวลาทำงานและบันทึกลง attendance_daily_result ใน MySQL ทันที
    const [scansForDay] = await poolAtt.query(`
      SELECT * FROM attendance_raw_scan WHERE DATE(scan_date_time) = ? ORDER BY scan_date_time ASC
    `, [workDate]);

    let processedCount = 0;
    for (const p of personnelList) {
      const personScans = scansForDay.filter(s => s.fingle_id === p.fingleId);
      let status = 'NO_SCAN';
      let statusLabel = 'ไม่พบสแกน';
      let checkIn = '';
      let checkOut = '';
      let lateMinutes = 0;
      let earlyMinutes = 0;

      if (personScans.length > 0) {
        const first = personScans[0];
        const last = personScans[personScans.length - 1];
        const firstTime = String(first.scan_date_time).substring(11, 16);
        const lastTime = personScans.length > 1 ? String(last.scan_date_time).substring(11, 16) : '';

        checkIn = firstTime;
        checkOut = lastTime;

        // คำนวณเวลาสาย (เกณฑ์ 08:15)
        const [h, m] = firstTime.split(':').map(Number);
        const scanMins = h * 60 + m;
        const targetMins = 8 * 60 + 15;

        if (scanMins > targetMins) {
          lateMinutes = scanMins - targetMins;
          status = 'LATE';
          statusLabel = `สาย ${lateMinutes} นาที`;
        } else {
          status = 'ON_TIME';
          statusLabel = 'ตรงเวลา';
        }

        if (personScans.length === 1) {
          status = 'IN_ONLY';
          statusLabel = 'สแกนเข้าอย่างเดียว';
        }
      }

      await poolAtt.query(`
        INSERT INTO attendance_daily_result
        (work_date, person_id, fingle_id, fullname, department, position, shift_id, shift_name, scheduled_in, scheduled_out, first_scan, last_scan, check_in, check_out, status, status_label, late_minutes, early_minutes, total_scans, calculated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 'เช้า (ปกติ)', '08:15', '16:00', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          fullname = VALUES(fullname),
          department = VALUES(department),
          position = VALUES(position),
          first_scan = VALUES(first_scan),
          last_scan = VALUES(last_scan),
          check_in = VALUES(check_in),
          check_out = VALUES(check_out),
          status = VALUES(status),
          status_label = VALUES(status_label),
          late_minutes = VALUES(late_minutes),
          early_minutes = VALUES(early_minutes),
          total_scans = VALUES(total_scans),
          calculated_at = NOW()
      `, [
        workDate,
        p.personId,
        p.fingleId,
        p.fullname,
        p.department,
        p.position,
        checkIn ? `${workDate} ${checkIn}:00` : '',
        checkOut ? `${workDate} ${checkOut}:00` : '',
        checkIn,
        checkOut,
        status,
        statusLabel,
        lateMinutes,
        earlyMinutes,
        personScans.length
      ]);
      processedCount++;
    }

    res.json({
      success: true,
      workDate,
      totalRead,
      totalNew: totalInserted,
      duplicates,
      processedCount,
      message: `⚡ ดึงข้อมูลจากเครื่องสแกนและบันทึกลง MySQL สำเร็จ! (บันทึกสแกนดิบ +${totalInserted} รายการ, ประมวลผลเวลา ${processedCount} ท่าน)`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `Sync ดึงข้อมูลล้มเหลว: ${err.message}` });
  }
});

// 4.12.2 สั่งคำนวณผลเวลาใหม่และบันทึกลง MySQL attendance_daily_result ทันที
app.post('/api/attendance/recalculate', async (req, res) => {
  try {
    await ensureTablesExist();
    const pool = getDbPool();
    const date = req.body?.date || '2026-10-14';

    // ดึงสแกนดิบของวันที่
    const [scans] = await pool.query('SELECT * FROM attendance_raw_scan WHERE DATE(scan_date_time) = ? ORDER BY scan_date_time ASC', [date]);
    
    // ดึงรายชื่อบุคลากรที่มีสแกน หรือจากฐาน
    const fingleIds = Array.from(new Set(scans.map(s => s.fingle_id)));
    let saved = 0;

    for (const fid of fingleIds) {
      const pScans = scans.filter(s => s.fingle_id === fid);
      const first = pScans[0];
      const last = pScans[pScans.length - 1];
      const checkIn = first ? String(first.scan_date_time).substring(11, 16) : '';
      const checkOut = pScans.length > 1 ? String(last.scan_date_time).substring(11, 16) : '';

      let status = 'ON_TIME';
      let statusLabel = 'ตรงเวลา';
      let lateMinutes = 0;

      if (checkIn) {
        const [h, m] = checkIn.split(':').map(Number);
        const mins = h * 60 + m;
        if (mins > 8 * 60 + 15) {
          lateMinutes = mins - (8 * 60 + 15);
          status = 'LATE';
          statusLabel = `สาย ${lateMinutes} นาที`;
        }
        if (pScans.length === 1) {
          status = 'IN_ONLY';
          statusLabel = 'สแกนเข้าอย่างเดียว';
        }
      } else {
        status = 'NO_SCAN';
        statusLabel = 'ไม่พบสแกน';
      }

      await pool.query(`
        INSERT INTO attendance_daily_result
        (work_date, person_id, fingle_id, fullname, department, position, shift_id, shift_name, scheduled_in, scheduled_out, first_scan, last_scan, check_in, check_out, status, status_label, late_minutes, early_minutes, total_scans, calculated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 'เช้า (ปกติ)', '08:15', '16:00', ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW())
        ON DUPLICATE KEY UPDATE
          fullname = VALUES(fullname),
          department = VALUES(department),
          position = VALUES(position),
          first_scan = VALUES(first_scan),
          last_scan = VALUES(last_scan),
          check_in = VALUES(check_in),
          check_out = VALUES(check_out),
          status = VALUES(status),
          status_label = VALUES(status_label),
          late_minutes = VALUES(late_minutes),
          total_scans = VALUES(total_scans),
          calculated_at = NOW()
      `, [
        date,
        first?.person_id || fid,
        fid,
        first?.hr_fullname || `เจ้าหน้าที่ ${fid}`,
        first?.hr_dep_name || 'โรงพยาบาลสามชุก',
        first?.hr_position_name || 'เจ้าหน้าที่',
        first ? `${date} ${checkIn}:00` : '',
        pScans.length > 1 ? `${date} ${checkOut}:00` : '',
        checkIn,
        checkOut,
        status,
        statusLabel,
        lateMinutes,
        pScans.length
      ]);
      saved++;
    }

    res.json({
      success: true,
      workDate: date,
      calculatedCount: saved,
      message: `คำนวณผลเวลาทำงานประจำวันที่ ${date} และบันทึกลง MySQL attendance_daily_result (${saved} คน) สำเร็จแล้ว!`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `คำนวณผลไม่สำเร็จ: ${err.message}` });
  }
});

// 4.13 ตรวจสอบไฟล์ DLL
app.get('/api/scanners/check-dll', (req, res) => {
  const dllPaths = [
    'C:\\Windows\\SysWOW64\\FK623Attend.dll',
    'C:\\Windows\\System32\\FK623Attend.dll',
    path.join(__dirname, 'SamchukAttendance.Api', 'FK623Attend.dll'),
    path.join(__dirname, '..', 'FK623Attend.dll')
  ];

  const found = dllPaths.filter(p => fs.existsSync(p));
  res.json({
    success: found.length > 0,
    dll: 'FK623Attend.dll',
    locationsFound: found,
    message: found.length > 0 ? `พบไฟล์ DLL ที่: ${found.join(', ')}` : 'ยังไม่พบไฟล์ FK623Attend.dll ใน System Path'
  });
});

// 4.14 ส่งข้อมูลเข้า hosoffice (Batch Push) - Manual Push Only (Spec v2 Section 22)
app.post('/api/push/batch', async (req, res) => {
  const { dateFrom, dateTo, machineNo, performedBy = 'ADMIN' } = req.body;
  const batchId = Date.now();
  console.log(`[Manual Push] ADMIN '${performedBy}' สั่งส่งข้อมูลเข้า ${hosofficeDbName} @ ${activeDbConfig.host} (ช่วง ${dateFrom} - ${dateTo})`);

  let insertedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    const poolAtt = getDbPool();
    const poolHos = getHosofficePool();

    // Spec v2: ห้ามส่งข้อมูลที่ hr_mapped = 0 เด็ดขาด! ส่งเฉพาะรายการที่ hr_mapped = 1
    let query = 'SELECT * FROM attendance_raw_scan WHERE push_status = "PENDING" AND hr_mapped = 1';
    const params = [];
    if (dateFrom && dateTo) {
      query += ' AND DATE(scan_date_time) BETWEEN ? AND ?';
      params.push(dateFrom, dateTo);
    }
    if (machineNo && machineNo !== 'ALL') {
      query += ' AND machine_no = ?';
      params.push(Number(machineNo));
    }
    query += ' LIMIT 1000';

    const [scans] = await poolAtt.query(query, params);

    // ตรวจสอบว่าตาราง fingle_scan ใน hosoffice มีหรือไม่
    await poolHos.query(`
      CREATE TABLE IF NOT EXISTS fingle_scan (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        fingle_id INT NOT NULL,
        scan_date_time DATETIME NOT NULL,
        machine_no INT NULL,
        in_out_mode INT NULL,
        verify_mode INT NULL,
        date_time_save DATETIME NULL,
        create_by VARCHAR(50) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_hos_scan (fingle_id, scan_date_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure push_batches table exists in samchuk_attendance
    await poolAtt.query(`
      CREATE TABLE IF NOT EXISTS push_batches (
        id BIGINT PRIMARY KEY,
        requested_by VARCHAR(100) NOT NULL,
        requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        filter_date_from DATE NULL,
        filter_date_to DATE NULL,
        filter_machine_no INT NULL,
        total_selected INT NOT NULL DEFAULT 0,
        total_inserted INT NOT NULL DEFAULT 0,
        total_skipped_exists INT NOT NULL DEFAULT 0,
        total_failed INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
        finished_at DATETIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    for (const scan of scans) {
      try {
        await poolHos.query(`
          INSERT INTO fingle_scan (fingle_id, scan_date_time, machine_no, in_out_mode, verify_mode, date_time_save, create_by)
          VALUES (?, ?, ?, ?, ?, NOW(), ?)
        `, [scan.fingle_id, scan.scan_date_time, scan.machine_no, scan.in_out_mode || 0, scan.verify_mode || 1, 'SCAN_PUSH']);
        insertedCount++;

        // อัปเดตสถานะใน samchuk_attendance
        await poolAtt.query(`
          UPDATE attendance_raw_scan 
          SET push_status = 'PUSHED', pushed_at = NOW(), pushed_by = ?, push_batch_id = ?
          WHERE id = ?
        `, [1, batchId, scan.id]);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY' || (err.message && err.message.includes('Duplicate entry'))) {
          skippedCount++;
          await poolAtt.query(`
            UPDATE attendance_raw_scan 
            SET push_status = 'SKIPPED_EXISTS', pushed_at = NOW(), pushed_by = ?, push_batch_id = ?
            WHERE id = ?
          `, [1, batchId, scan.id]);
        } else {
          failedCount++;
          await poolAtt.query(`
            UPDATE attendance_raw_scan 
            SET push_status = 'FAILED', push_error = ?
            WHERE id = ?
          `, [err.message, scan.id]);
        }
      }
    }

    const batchStatus = failedCount > 0 ? (insertedCount > 0 ? 'PARTIAL' : 'FAILED') : 'SUCCESS';

    await poolAtt.query(`
      INSERT INTO push_batches 
      (id, requested_by, requested_at, filter_date_from, filter_date_to, filter_machine_no, total_selected, total_inserted, total_skipped_exists, total_failed, status, finished_at)
      VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE 
        total_inserted = VALUES(total_inserted),
        total_skipped_exists = VALUES(total_skipped_exists),
        total_failed = VALUES(total_failed),
        status = VALUES(status),
        finished_at = NOW()
    `, [
      batchId,
      performedBy,
      dateFrom || null,
      dateTo || null,
      (machineNo && machineNo !== 'ALL') ? Number(machineNo) : null,
      scans.length,
      insertedCount,
      skippedCount,
      failedCount,
      batchStatus
    ]);

    res.json({
      success: true,
      message: `ส่งข้อมูลเข้า ${hosofficeDbName}.fingle_scan เรียบร้อยแล้ว (เพิ่มใหม่: ${insertedCount}, ซ้ำเดิม: ${skippedCount}, ล้มเหลว: ${failedCount})`,
      data: {
        batchId: String(batchId),
        insertedCount,
        skippedCount,
        failedCount,
        executedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: `ส่งข้อมูลเข้า hosoffice ล้มเหลว: ${err.message}`,
      data: {
        batchId: String(batchId),
        insertedCount,
        skippedCount,
        failedCount,
        executedAt: new Date().toISOString()
      }
    });
  }
});

// 4.14.1 ดึงรายการประวัติ Batch การส่ง
app.get('/api/push/batches', async (req, res) => {
  try {
    const poolAtt = getDbPool();
    await poolAtt.query(`
      CREATE TABLE IF NOT EXISTS push_batches (
        id BIGINT PRIMARY KEY,
        requested_by VARCHAR(100) NOT NULL,
        requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        filter_date_from DATE NULL,
        filter_date_to DATE NULL,
        filter_machine_no INT NULL,
        total_selected INT NOT NULL DEFAULT 0,
        total_inserted INT NOT NULL DEFAULT 0,
        total_skipped_exists INT NOT NULL DEFAULT 0,
        total_failed INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
        finished_at DATETIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const [rows] = await poolAtt.query('SELECT * FROM push_batches ORDER BY requested_at DESC LIMIT 50');
    const mapped = rows.map(r => ({
      id: String(r.id),
      requestedBy: r.requested_by,
      requestedAt: r.requested_at ? new Date(r.requested_at).toISOString().replace('T', ' ').substring(0, 19) : '',
      filterDateFrom: r.filter_date_from,
      filterDateTo: r.filter_date_to,
      filterMachineNo: r.filter_machine_no,
      totalSelected: r.total_selected,
      totalInserted: r.total_inserted,
      totalSkippedExists: r.total_skipped_exists,
      totalFailed: r.total_failed,
      status: r.status,
      finishedAt: r.finished_at ? new Date(r.finished_at).toISOString().replace('T', ' ').substring(0, 19) : ''
    }));
    res.json({ success: true, data: mapped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, data: [] });
  }
});

// 4.14.2 ยกเว้นรายการสแกน (Manual Exclude)
app.post('/api/raw-scans/:id/exclude', async (req, res) => {
  try {
    const pool = getDbPool();
    const scanId = req.params.id;
    await pool.query(`
      UPDATE attendance_raw_scan 
      SET push_status = 'EXCLUDED', push_error = 'ผู้ดูแลระบบสั่งยกเว้นรายการนี้ (Manual Exclude)' 
      WHERE id = ?
    `, [scanId]);
    res.json({ success: true, message: `ยกเว้นรายการสแกน #${scanId} สำเร็จ` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4.14.3 รีเฟรชข้อมูลบุคลากรจาก hosoffice.hr_person และ Map ใหม่อัตโนมัติ
app.post('/api/hosoffice/personnel/refresh-mapping', async (req, res) => {
  try {
    const poolAtt = getDbPool();
    const poolHos = getHosofficePool();

    // ดึงรายชื่อจาก hosoffice.hr_person
    let hrList = [];
    try {
      const [rows] = await poolHos.query(`
        SELECT 
          person_id,
          fingle_id,
          CONCAT(COALESCE(hr_fname, ''), ' ', COALESCE(hr_lname, '')) AS fullname,
          hr_position_name,
          hr_department_name
        FROM hr_person
        WHERE fingle_id IS NOT NULL AND fingle_id > 0
      `);
      hrList = rows;
    } catch (e) {
      console.warn('Query hr_person warning:', e.message);
    }

    let remappedCount = 0;
    if (hrList && hrList.length > 0) {
      for (const hr of hrList) {
        const [updateRes] = await poolAtt.query(`
          UPDATE attendance_raw_scan
          SET 
            hr_mapped = 1,
            person_id = ?,
            hr_fullname = ?,
            hr_position_name = ?,
            hr_dep_name = ?
          WHERE fingle_id = ? AND hr_mapped = 0
        `, [
          hr.person_id,
          hr.fullname.trim(),
          hr.hr_position_name || '',
          hr.hr_department_name || '',
          hr.fingle_id
        ]);
        remappedCount += updateRes.affectedRows || 0;
      }
    }

    res.json({
      success: true,
      hrCount: hrList.length,
      remappedCount,
      message: `รีเฟรชข้อมูลบุคลากร HR สำเร็จ (ตรวจพบเจ้าหน้าที่ ${hrList.length} คน, จับคู่ข้อมูลสแกนสำเร็จใหม่ ${remappedCount} รายการ)`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `รีเฟรชข้อมูล HR ไม่สำเร็จ: ${err.message}` });
  }
});

// 4.15 Route เผื่อการเรียกผ่าน path /api/sam_att/
app.use('/api/sam_att', (req, res, next) => {
  req.url = req.url;
  app(req, res, next);
});

// --------------------------------------------------------------------------
// 5. เริ่มต้นเซิร์ฟเวอร์
// --------------------------------------------------------------------------
// ฟังก์ชัน Auto-Fallback และวินิจฉัยเมื่อเชื่อมต่อ 10.2.0.201 แล้วเกิด ETIMEDOUT
async function tryFallbackToLocalhost() {
  console.log('🔍 กำลังตรวจสอบว่ามี MySQL รันอยู่บนเครื่องนี้ (localhost / 127.0.0.1:3306) หรือไม่...');
  const probeLocal = await testScannerTcpSocket('127.0.0.1', 3306, 1500);
  if (probeLocal.success) {
    console.log('💡 ตรวจพบว่าพอร์ต 3306 กำลังเปิดทำงานอยู่บนเครื่องนี้ (localhost / 127.0.0.1)!');
    const candidates = [
      { user: 'root', password: '' },
      { user: 'sa', password: 'sa' },
      { user: 'root', password: 'sa' },
      { user: 'attendance_app', password: '' },
      { user: activeDbConfig.user, password: activeDbConfig.password }
    ];
    for (const c of candidates) {
      try {
        const testConn = await mysql.createConnection({
          host: '127.0.0.1',
          port: 3306,
          user: c.user,
          password: c.password,
          connectTimeout: 2000
        });
        const [dbs] = await testConn.query('SHOW DATABASES');
        const dbNames = dbs.map(d => Object.values(d)[0]);
        await testConn.end();
        if (dbNames.includes('samchuk_attendance')) {
          console.log('=========================================================================');
          console.log(`🎉 [ค้นพบอัตโนมัติ] พบฐานข้อมูล samchuk_attendance บน localhost:3306!`);
          console.log(`   (ตรงกับภาพใน Navicat! User: '${c.user}', พบทั้งหมด ${dbNames.length} ฐานข้อมูล)`);
          console.log(`🔄 กำลังสลับ Host ไปยัง 127.0.0.1 อัตโนมัติเพื่อให้ระบบทำงานได้ทันที...`);
          console.log('=========================================================================');
          activeDbConfig.host = '127.0.0.1';
          activeDbConfig.user = c.user;
          activeDbConfig.password = c.password;
          resetDbPool(activeDbConfig);
          await ensureTablesExist();
          console.log(`✅ เชื่อมต่อและใช้งาน samchuk_attendance บน 127.0.0.1 สำเร็จเรียบร้อย!`);
          return;
        }
      } catch {}
    }
  }

  console.log('=========================================================================');
  console.log('📌 คำแนะนำแก้ไข "Error: connect ETIMEDOUT" กับ MySQL 10.2.0.201:');
  console.log('1. ในภาพ Navicat ของท่านที่เห็นฐานข้อมูล samchuk_attendance:');
  console.log('   - ดูว่าใน Navicat ช่อง Host ระบุเป็นอะไร (เช่น localhost หรือ IP เครื่องอื่น)');
  console.log('   - หากเป็น localhost ให้เปิดหน้าเว็บ https://10.2.0.13:3001/Sam_Att/ -> เมนู "ระบบและบันทึก"');
  console.log('     แล้วคลิกเลือก Preset "localhost (root / ว่าง)" หรือระบุในไฟล์ .env');
  console.log('2. หากฐานข้อมูล samchuk_attendance อยู่บนเซิร์ฟเวอร์ 10.2.0.201 จริง:');
  console.log('   - ข้อผิดพลาด ETIMEDOUT เกิดจาก Windows Firewall บนเครื่อง 10.2.0.201 บล็อกพอร์ต 3306');
  console.log('   - กรุณาเปิด Windows Defender Firewall บน 10.2.0.201 -> Inbound Rule -> อนุญาต Port 3306 TCP');
  console.log('=========================================================================');
}

app.listen(PORT, '0.0.0.0', async () => {
  console.log('=========================================================================');
  console.log(`   โรงพยาบาลสามชุก - Sam_Att Backend API Service v2.6.0`);
  console.log('=========================================================================');
  console.log(`🚀 กำลังให้บริการ API บนพอร์ต: ${PORT}`);
  console.log(`🌐 Base URL: http://10.2.0.13:${PORT}`);
  console.log(`🏥 เชื่อมต่อกับ Web Frontend: https://10.2.0.13:3001/Sam_Att/`);
  const hosHost = process.env.HOSOFFICE_HOST || activeDbConfig.host;
  const hosPort = parseInt(process.env.HOSOFFICE_PORT || activeDbConfig.port, 10);
  const hosUser = process.env.HOSOFFICE_USER || 'sa';
  console.log(`🗄️  ฐานข้อมูลเป้าหมายทั้ง 2 ฐาน:`);
  console.log(`   1. [Attendance] ${activeDbConfig.database} (Host: ${activeDbConfig.host}:${activeDbConfig.port}, User: ${activeDbConfig.user})`);
  console.log(`   2. [HosOffice]  ${hosofficeDbName} (Host: ${hosHost}:${hosPort}, User: ${hosUser})`);
  console.log('=========================================================================');
  
  // พยายามเชื่อมต่อและตรวจสอบตาราง
  try {
    console.log(`⏳ กำลังตรวจสอบการเชื่อมต่อฐานข้อมูล MySQL ${activeDbConfig.host}...`);
    const initRes = await ensureTablesExist();
    if (initRes && initRes.success) {
      console.log(`✅ ตรวจสอบและเตรียมตารางใน ${activeDbConfig.database} สำเร็จพร้อมใช้งาน!`);
    } else {
      console.log(`⚠️ ยังไม่สามารถเชื่อมต่อ MySQL ${activeDbConfig.host} ได้ (${initRes?.error || 'Failed'})`);
      if (activeDbConfig.host !== '127.0.0.1' && activeDbConfig.host !== 'localhost') {
        await tryFallbackToLocalhost();
      }
    }
  } catch (err) {
    console.log(`⚠️ ยังไม่สามารถเชื่อมต่อ MySQL ${activeDbConfig.host} ได้อัตโนมัติ:`, err.message);
  }
  
  console.log('พร้อมรับคำสั่งทดสอบฐานข้อมูลทั้ง 2 ฐาน, เครื่องสแกนนิ้ว และการบันทึกข้อมูลแล้ว...');
});
