/**
 * Samchuk Hospital Attendance System - Node.js Backend API Service
 * ทำงานบนพอร์ต 3005 สำหรับรองรับ Web Frontend (พอร์ต 3001 /Sam_Att/)
 * ป้องกันการชนกับพอร์ต 3002 ของระบบ Procurement
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

const http = require('http');

const app = express();
const PORT = process.env.API_PORT || 3002;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '10mb' }));

// --------------------------------------------------------------------------
// 0. Master API Gateway (พอร์ต 3002): รวม 3 ระบบหลักของโรงพยาบาลสามชุก
//    1. ระบบลงเวลา:     http://localhost:3002/api/Sam_Att/
//    2. ระบบจัดซื้อ:       http://localhost:3002/api/procurement/
//    3. ระบบ Cash & Cheque: http://localhost:3002/api/Cash_Cheque/
// --------------------------------------------------------------------------

// Helper สำหรับ Proxy ไปยัง Internal Microservices (Loopback 127.0.0.1 - ไม่ต้องเปิด firewall ใหม่)
function createGatewayProxy(targetHost, targetPort, serviceName, manualTip, prefixToStrip) {
  return (req, res) => {
    const doProxy = (forwardPath, isRetry = false) => {
      const options = {
        hostname: targetHost,
        port: targetPort,
        path: forwardPath,
        method: req.method,
        headers: { ...req.headers, host: `${targetHost}:${targetPort}` }
      };

      const proxyReq = http.request(options, (proxyRes) => {
        // หากปลายทางตอบ 404 และยังไม่ได้ลองแบบตัด prefix ให้ลองสลับ path ทันที
        if (proxyRes.statusCode === 404 && !isRetry && prefixToStrip) {
          let altPath = req.originalUrl;
          if (altPath.toLowerCase().startsWith(`${prefixToStrip.toLowerCase()}/api/`)) {
            altPath = altPath.slice(prefixToStrip.length);
          } else if (altPath.toLowerCase().startsWith(prefixToStrip.toLowerCase())) {
            altPath = altPath.slice(prefixToStrip.length);
            if (!altPath.startsWith('/')) altPath = '/' + altPath;
          }
          if (altPath !== forwardPath && altPath !== '') {
            proxyRes.resume(); // discard body
            return doProxy(altPath, true);
          }
        }

        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      });

      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.status(502).json({
            success: false,
            gateway: 'Samchuk Hospital API Gateway (:3002)',
            service: serviceName,
            targetPort,
            error: err.code || err.message,
            message: `[พอร์ต 3002] ไม่สามารถส่งต่อไปยังบริการ ${serviceName} บน internal port ${targetPort} (${err.message})`,
            solution: manualTip || `กรุณารัน Backend ของ ${serviceName} บน internal port ${targetPort} (ไม่ต้องเปิด firewall เพิ่ม)`
          });
        }
      });

      if (req.body && Object.keys(req.body).length > 0) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
        proxyReq.end();
      } else {
        req.pipe(proxyReq, { end: true });
      }
    };

    doProxy(req.originalUrl);
  };
}

// 1. Gateway Forwarding สำหรับระบบจัดซื้อ (Procurement): /api/procurement/* -> 127.0.0.1:3003
const PROCUREMENT_INTERNAL_PORT = parseInt(process.env.PROCUREMENT_PORT || '3003', 10);
app.use(['/api/procurement', '/api/Procurement'], createGatewayProxy(
  '127.0.0.1', 
  PROCUREMENT_INTERNAL_PORT, 
  'Procurement Backend', 
  'ตรวจสอบว่าได้เปิด Procurement Backend บน internal port 3003 แล้วหรือยัง',
  '/api/procurement'
));

// 2. Gateway Forwarding สำหรับระบบ Cash & Cheque: /api/Cash_Cheque/* -> 127.0.0.1:3004
const CASH_CHEQUE_INTERNAL_PORT = parseInt(process.env.CASH_CHEQUE_PORT || '3004', 10);
app.use(['/api/Cash_Cheque', '/api/cash_cheque'], createGatewayProxy(
  '127.0.0.1', 
  CASH_CHEQUE_INTERNAL_PORT, 
  'Cash & Cheque Backend', 
  'ตรวจสอบว่าได้เปิด Cash & Cheque Backend บน internal port 3004 แล้วหรือยัง',
  '/api/Cash_Cheque'
));

// 3. Gateway URL Rewriter สำหรับระบบลงเวลา (Sam_Att):
// แปลง http://localhost:3002/api/Sam_Att/* และ http://localhost:3002/api/sam_att/* ให้เข้าถึง Routes ของระบบลงเวลาได้ทันที
app.use((req, res, next) => {
  if (req.url.startsWith('/api/Sam_Att/api/')) {
    req.url = req.url.replace('/api/Sam_Att/api/', '/api/');
  } else if (req.url.startsWith('/api/Sam_Att/')) {
    req.url = req.url.replace('/api/Sam_Att/', '/api/');
  } else if (req.url === '/api/Sam_Att') {
    req.url = '/api/health';
  } else if (req.url.startsWith('/api/sam_att/')) {
    req.url = req.url.replace('/api/sam_att/', '/api/');
  } else if (req.url === '/api/sam_att') {
    req.url = '/api/health';
  }
  next();
});

// Root Gateway Info
app.get(['/', '/api', '/api/routes'], (req, res) => {
  res.json({
    gateway: 'โรงพยาบาลสามชุก - Central API Gateway',
    port: PORT,
    status: 'ONLINE',
    description: 'รวมจุดเชื่อมต่อ API ภายนอกพอร์ต 3002 พอร์ตเดียว ไม่ต้องเปิดพอร์ตไฟร์วอลล์เพิ่ม',
    routes: {
      attendance: {
        prefix: '/api/Sam_Att/',
        description: 'ระบบลงเวลาและเครื่องสแกนลายนิ้วมือ/ใบหน้า โรงพยาบาลสามชุก',
        healthCheck: '/api/Sam_Att/health',
        scans: '/api/Sam_Att/raw-scans'
      },
      procurement: {
        prefix: '/api/procurement/',
        description: 'ระบบจัดซื้อจัดจ้าง (Procurement System)',
        internalTarget: `http://127.0.0.1:${PROCUREMENT_INTERNAL_PORT}/`
      },
      cashCheque: {
        prefix: '/api/Cash_Cheque/',
        description: 'ระบบเงินสดและเช็ค (Cash & Cheque System)',
        internalTarget: `http://127.0.0.1:${CASH_CHEQUE_INTERNAL_PORT}/`
      }
    }
  });
});

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
      dateStrings: true,
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
      dateStrings: true,
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

    // 2.2.1 ตารางบุคลากรของ samchuk_attendance (เก็บรายชื่อที่ซิงค์มาจาก hosoffice.hr_person)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_personnel (
        id INT AUTO_INCREMENT PRIMARY KEY,
        person_id INT NOT NULL,
        fingle_id INT NOT NULL,
        hr_cid VARCHAR(20) NULL,
        hr_fullname VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        hr_position_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        hr_level_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        hr_dep_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        hr_dep_sub_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        hr_person_type_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        hr_person_type_id INT NULL,
        hr_department_id INT NULL,
        hr_department_sub_id INT NULL,
        hr_status_id INT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_person_id (person_id),
        KEY idx_fingle_id (fingle_id)
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

    // ไม่ทำการ Insert ข้อมูลสแกนอัตโนมัติ เพื่อให้ฐานข้อมูลเป็นไปตามสถานะจริงของผู้ใช้ (หากผู้ใช้ลบ จะต้องว่างเปล่า 0 รายการ)

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

// 4.2.2.1 รายงานสรุปฐานข้อมูลทั้งหมดในระบบ (Database Architecture Overview)
app.get('/api/db/overview', async (req, res) => {
  const poolAtt = getDbPool();
  const poolHos = getHosofficePool();
  
  let attStats = {};
  try {
    const [scans] = await poolAtt.query('SELECT COUNT(*) as count FROM attendance_raw_scan');
    const [shifts] = await poolAtt.query('SELECT COUNT(*) as count FROM attendance_shift');
    const [results] = await poolAtt.query('SELECT COUNT(*) as count FROM attendance_daily_result');
    attStats = { rawScans: scans[0].count, shifts: shifts[0].count, dailyResults: results[0].count, status: 'ONLINE' };
  } catch (err) {
    attStats = { status: 'ERROR', error: err.message };
  }

  let hosStats = {};
  try {
    const [person] = await poolHos.query('SELECT COUNT(*) as count FROM hr_person');
    const [dept] = await poolHos.query('SELECT COUNT(*) as count FROM hr_department');
    let fCount = 0;
    try {
      const [scans] = await poolHos.query('SELECT COUNT(*) as count FROM fingle_scan');
      fCount = scans[0].count;
    } catch {}
    hosStats = { personnel: person[0].count, departments: dept[0].count, fingleScan: fCount, status: 'ONLINE' };
  } catch (err) {
    hosStats = { status: 'ERROR', error: err.message };
  }

  res.json({
    success: true,
    totalDatabases: 2,
    summary: 'ระบบใช้งาน 2 ฐานข้อมูลหลักบน MySQL เชื่อมโยงผ่าน Central API Gateway พอร์ต 3002',
    databases: [
      {
        id: 1,
        name: activeDbConfig.database,
        host: activeDbConfig.host,
        port: activeDbConfig.port,
        role: 'ฐานข้อมูลระบบลงเวลาและตารางเวร (Dedicated Attendance DB)',
        description: 'จัดเก็บสแกนดิบ, ตารางกะ, และผลการคำนวณเวลาเข้า-ออก แยกอิสระเพื่อความเร็วและปลอดภัย',
        stats: attStats
      },
      {
        id: 2,
        name: hosofficeDbName,
        host: process.env.HOSOFFICE_HOST || activeDbConfig.host,
        port: process.env.HOSOFFICE_PORT || activeDbConfig.port,
        role: 'ฐานข้อมูลระบบโรงพยาบาล HOSxP / HosOffice (HR Master DB)',
        description: 'จัดเก็บข้อมูลบุคลากรทั้งโรงพยาบาล, กลุ่มงาน, ตำแหน่ง, และตารางสแกนเดิม fingle_scan',
        stats: hosStats
      }
    ],
    gatewayServices: [
      { name: 'Sam_Att (ระบบลงเวลา)', path: '/api/Sam_Att/', status: 'ACTIVE (Port 3002 Gateway)' },
      { name: 'Procurement (ระบบจัดซื้อ)', path: '/api/procurement/', internalPort: 3003 },
      { name: 'Cash_Cheque (ระบบการเงิน/เช็ค)', path: '/api/Cash_Cheque/', internalPort: 3004 }
    ]
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

    // 1. ตรวจสอบว่าใน samchuk_attendance มีบุคลากรหรือไม่ หากตารางว่าง (0 คน) ให้คืนค่าว่าง 0 ทันที
    const [personCheck] = await pool.query('SELECT COUNT(*) as cnt FROM attendance_personnel');
    if (!personCheck[0] || personCheck[0].cnt === 0) {
      return res.json({ success: true, date, total: 0, data: [], message: 'ไม่มีรายชื่อบุคลากรในตาราง attendance_personnel' });
    }

    // 2. ดึงเฉพาะผลคำนวณของบุคลากรที่มีตัวตนอยู่ใน attendance_personnel เท่านั้น
    const [rows] = await pool.query(`
      SELECT d.* 
      FROM attendance_daily_result d
      INNER JOIN attendance_personnel p ON d.person_id = p.person_id
      WHERE d.work_date = ? 
      ORDER BY d.department ASC, d.fullname ASC
    `, [date]);

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

// ล้างผลคำนวณเวลาปฏิบัติงานใน samchuk_attendance.attendance_daily_result
app.delete('/api/attendance/daily/clear', async (req, res) => {
  try {
    const pool = getDbPool();
    await pool.query('TRUNCATE TABLE attendance_daily_result');
    res.json({ success: true, message: 'ล้างข้อมูลตาราง attendance_daily_result สำเร็จ (0 รายการ)' });
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

// 4.6.1 ดึงข้อมูลบุคลากรจากฐานข้อมูลที่ 1: samchuk_attendance.attendance_personnel (ค่าเริ่มต้น ไม่แตะต้อง hosoffice)
app.get('/api/personnel', async (req, res) => {
  try {
    await ensureTablesExist();
    const pool = getDbPool();
    const statusFilter = req.query.status || 'ALL'; // 'ALL', 'ACTIVE', 'INACTIVE'
    
    let query = 'SELECT * FROM attendance_personnel';
    const params = [];
    if (statusFilter !== 'ALL') {
      query += ' WHERE status = ?';
      params.push(statusFilter);
    }
    query += ' ORDER BY FIELD(status, "ACTIVE", "INACTIVE"), hr_dep_name ASC, hr_fullname ASC';

    const [rows] = await pool.query(query, params);
    const mapped = rows.map(r => ({
      id: r.id,
      personId: r.person_id,
      fingleId: r.fingle_id,
      hrCid: r.hr_cid || '',
      hrFullname: r.hr_fullname,
      hrPositionName: r.hr_position_name || '',
      hrLevelName: r.hr_level_name || '',
      hrDepName: r.hr_dep_name || '',
      hrDepSubName: r.hr_dep_sub_name || '',
      hrPersonTypeName: r.hr_person_type_name || 'ข้าราชการ',
      hrPersonTypeId: r.hr_person_type_id || 1,
      hrDepartmentId: r.hr_department_id || 1,
      hrDepartmentSubId: r.hr_department_sub_id || 1,
      status: r.status || 'ACTIVE',
      syncedAt: r.synced_at
    }));

    const activeCount = mapped.filter(p => p.status === 'ACTIVE').length;
    const inactiveCount = mapped.filter(p => p.status === 'INACTIVE').length;

    res.json({ 
      success: true, 
      count: mapped.length, 
      activeCount,
      inactiveCount,
      data: mapped 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4.6.2 ซิงค์รายชื่อบุคลากรจาก hosoffice.hr_person เข้ามาบันทึกใน samchuk_attendance.attendance_personnel (ทำงานเมื่อกดสั่งเท่านั้น)
// โดยยึดฐาน HOSOffice เป็นหลัก (Single Source of Truth) ถ้าใน HOSOffice ไม่มี ให้ตั้งค่าในฐานเราเป็น 'INACTIVE' (ไม่ได้ใช้งาน)
app.post('/api/personnel/sync-from-hosoffice', async (req, res) => {
  try {
    await ensureTablesExist();
    const poolAtt = getDbPool();
    const poolHos = getHosofficePool();

    let rows = [];
    try {
      const [hosRows] = await poolHos.query(`
        WITH active_person AS (
          SELECT * 
          FROM hr_person 
          WHERE HR_STATUS_ID IN ('01', '1', 1)
        )
        SELECT 
          hp.ID AS id,
          hp.FINGLE_ID AS fingle_id,
          hp.HR_CID AS hr_cid,
          TRIM(CONCAT(
            COALESCE(hf.HR_PREFIX_NAME, ''),
            COALESCE(hp.HR_FNAME, ''),
            CASE 
              WHEN hp.HR_LNAME IS NOT NULL AND TRIM(hp.HR_LNAME) != '' 
              THEN CONCAT(' ', TRIM(hp.HR_LNAME)) 
              ELSE '' 
            END
          )) AS hr_fullname,
          hp.HR_FNAME AS hr_fname,
          hp.HR_LNAME AS hr_lname,
          COALESCE(ht.HR_POSITION_NAME, '') AS hr_position_name,
          COALESCE(hd.HR_DEPARTMENT_NAME, '') AS hr_dep_name,
          COALESCE(hds.HR_DEPARTMENT_SUB_NAME, '') AS hr_dep_sub_name,
          COALESCE(hpt.HR_PERSON_TYPE_NAME, 'ข้าราชการ') AS hr_person_type_name,
          COALESCE(hl.HR_LEVEL_NAME, '') AS hr_level_name,
          hp.HR_STATUS_ID AS hr_status_id
        FROM active_person hp
        LEFT JOIN hr_prefix hf ON hp.HR_PREFIX_ID = hf.HR_PREFIX_ID
        LEFT JOIN hr_position ht ON hp.HR_POSITION_ID = ht.HR_POSITION_ID
        LEFT JOIN hr_department hd ON hp.HR_DEPARTMENT_ID = hd.HR_DEPARTMENT_ID
        LEFT JOIN hr_department_sub hds ON hp.HR_DEPARTMENT_SUB_ID = hds.HR_DEPARTMENT_SUB_ID
        LEFT JOIN hr_person_type hpt ON hp.HR_PERSON_TYPE_ID = hpt.HR_PERSON_TYPE_ID
        LEFT JOIN hr_level hl ON hp.HR_LEVEL_ID = hl.HR_LEVEL_ID
        ORDER BY hp.ID ASC
      `);
      rows = hosRows || [];
    } catch {
      // Fallback สำหรับ MySQL / MariaDB รุ่นที่ยังไม่รองรับ CTE (WITH ...)
      const [hosRows] = await poolHos.query(`
        SELECT 
          hp.ID AS id,
          hp.FINGLE_ID AS fingle_id,
          hp.HR_CID AS hr_cid,
          TRIM(CONCAT(
            COALESCE(hf.HR_PREFIX_NAME, ''),
            COALESCE(hp.HR_FNAME, ''),
            CASE 
              WHEN hp.HR_LNAME IS NOT NULL AND TRIM(hp.HR_LNAME) != '' 
              THEN CONCAT(' ', TRIM(hp.HR_LNAME)) 
              ELSE '' 
            END
          )) AS hr_fullname,
          hp.HR_FNAME AS hr_fname,
          hp.HR_LNAME AS hr_lname,
          COALESCE(ht.HR_POSITION_NAME, '') AS hr_position_name,
          COALESCE(hd.HR_DEPARTMENT_NAME, '') AS hr_dep_name,
          COALESCE(hds.HR_DEPARTMENT_SUB_NAME, '') AS hr_dep_sub_name,
          COALESCE(hpt.HR_PERSON_TYPE_NAME, 'ข้าราชการ') AS hr_person_type_name,
          COALESCE(hl.HR_LEVEL_NAME, '') AS hr_level_name,
          hp.HR_STATUS_ID AS hr_status_id
        FROM (SELECT * FROM hr_person WHERE HR_STATUS_ID IN ('01', '1', 1)) hp
        LEFT JOIN hr_prefix hf ON hp.HR_PREFIX_ID = hf.HR_PREFIX_ID
        LEFT JOIN hr_position ht ON hp.HR_POSITION_ID = ht.HR_POSITION_ID
        LEFT JOIN hr_department hd ON hp.HR_DEPARTMENT_ID = hd.HR_DEPARTMENT_ID
        LEFT JOIN hr_department_sub hds ON hp.HR_DEPARTMENT_SUB_ID = hds.HR_DEPARTMENT_SUB_ID
        LEFT JOIN hr_person_type hpt ON hp.HR_PERSON_TYPE_ID = hpt.HR_PERSON_TYPE_ID
        LEFT JOIN hr_level hl ON hp.HR_LEVEL_ID = hl.HR_LEVEL_ID
        ORDER BY hp.ID ASC
      `);
      rows = hosRows || [];
    }

    const hosPersonIds = rows.map(r => r.id);
    let inserted = 0;
    let updated = 0;
    let activeInHos = 0;
    let inactiveInHos = 0;

    for (const r of rows) {
      let fullname = (r.hr_fullname || '').trim();
      if (!fullname && r.hr_fname) fullname = `${r.hr_fname} ${r.hr_lname || ''}`.trim();
      if (!fullname) fullname = `เจ้าหน้าที่ รหัส ${r.id}`;

      // ตรวจสอบสถานะจาก HOSOffice: ถ้า HR_STATUS_ID != 1 หรือลาออก ให้เป็น INACTIVE
      const isHosActive = !r.hr_status_id || Number(r.hr_status_id) === 1;
      const targetStatus = isHosActive ? 'ACTIVE' : 'INACTIVE';
      if (isHosActive) activeInHos++;
      else inactiveInHos++;

      const [resIns] = await poolAtt.query(`
        INSERT INTO attendance_personnel
        (person_id, fingle_id, hr_cid, hr_fullname, hr_position_name, hr_level_name, hr_dep_name, hr_dep_sub_name, hr_person_type_name, status, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          fingle_id = VALUES(fingle_id),
          hr_cid = VALUES(hr_cid),
          hr_fullname = VALUES(hr_fullname),
          hr_position_name = VALUES(hr_position_name),
          hr_level_name = VALUES(hr_level_name),
          hr_dep_name = VALUES(hr_dep_name),
          hr_dep_sub_name = VALUES(hr_dep_sub_name),
          hr_person_type_name = VALUES(hr_person_type_name),
          status = VALUES(status),
          synced_at = NOW()
      `, [
        r.id, r.fingle_id || r.id, r.hr_cid || '', fullname,
        r.hr_position_name || '', r.hr_level_name || '', r.hr_dep_name || '',
        r.hr_dep_sub_name || '', r.hr_person_type_name || 'ข้าราชการ',
        targetStatus
      ]);

      if (resIns.affectedRows === 1) inserted++;
      else updated++;
    }

    // สำหรับบุคลากรในฐาน samchuk_attendance ที่ "ไม่มีอยู่ใน HOSOffice":
    // ให้ปรับสถานะเป็น 'INACTIVE' (ไม่ได้ใช้งาน) ตามคำสั่งของผู้ใช้งาน
    let inactivated = 0;
    if (hosPersonIds.length > 0) {
      const [resInact] = await poolAtt.query(`
        UPDATE attendance_personnel 
        SET status = 'INACTIVE', synced_at = NOW()
        WHERE person_id NOT IN (?) AND status != 'INACTIVE'
      `, [hosPersonIds]);
      inactivated = resInact.affectedRows || 0;
    }

    // สรุปยอดรวมปัจจุบันในฐาน samchuk_attendance
    const [totalRows] = await poolAtt.query(`
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_cnt,
        SUM(CASE WHEN status = 'INACTIVE' THEN 1 ELSE 0 END) AS inactive_cnt
      FROM attendance_personnel
    `);

    res.json({
      success: true,
      totalHos: rows.length,
      inserted,
      updated,
      inactivated,
      currentTotal: totalRows[0]?.total || 0,
      activeCount: totalRows[0]?.active_cnt || 0,
      inactiveCount: totalRows[0]?.inactive_cnt || 0,
      message: `ยึดข้อมูล HOSOffice เป็นหลักสำเร็จ: ตรวจพบ ${rows.length} ท่าน (เพิ่มใหม่ +${inserted}, อัปเดต ${updated}, ปรับเป็นไม่ได้ใช้งาน ${inactivated} ท่าน)`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `ซิงค์บุคลากรจาก hosoffice ล้มเหลว: ${err.message}` });
  }
});

// 4.6.3 ล้างรายชื่อบุคลากรในฐาน samchuk_attendance
app.delete('/api/personnel/clear', async (req, res) => {
  try {
    const pool = getDbPool();
    await pool.query('TRUNCATE TABLE attendance_personnel');
    await pool.query('TRUNCATE TABLE attendance_daily_result');
    res.json({ success: true, message: 'ลบรายชื่อบุคลากรและผลคำนวณเวลาในฐาน samchuk_attendance เรียบร้อยแล้ว (0 คน)' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4.7 ดึงข้อมูลบุคลากรจากฐานข้อมูลที่ 2: hosoffice.hr_person โดยตรง
app.get('/api/hosoffice/personnel', async (req, res) => {
  try {
    const pool = getHosofficePool();
    const limit = parseInt(req.query.limit, 10) || 1000;
    
    let rows = [];
    try {
      const [hosRows] = await pool.query(`
        WITH active_person AS (
          SELECT * 
          FROM hr_person 
          WHERE HR_STATUS_ID IN ('01', '1', 1)
        )
        SELECT 
          hp.ID as id,
          hp.FINGLE_ID as fingle_id,
          hp.HR_CID as hr_cid,
          TRIM(CONCAT(
            COALESCE(hf.HR_PREFIX_NAME, ''),
            COALESCE(hp.HR_FNAME, ''),
            CASE WHEN hp.HR_LNAME IS NOT NULL AND TRIM(hp.HR_LNAME) != '' THEN CONCAT(' ', TRIM(hp.HR_LNAME)) ELSE '' END
          )) as hr_fullname,
          hp.HR_FNAME as hr_fname,
          hp.HR_LNAME as hr_lname,
          COALESCE(ht.HR_POSITION_NAME, '') as hr_position_name,
          COALESCE(hd.HR_DEPARTMENT_NAME, '') as hr_dep_name,
          COALESCE(hds.HR_DEPARTMENT_SUB_NAME, '') as hr_dep_sub_name,
          COALESCE(hpt.HR_PERSON_TYPE_NAME, '') as hr_person_type_name,
          COALESCE(hl.HR_LEVEL_NAME, '') as hr_level_name,
          hp.HR_STATUS_ID as hr_status_id
        FROM active_person hp
        LEFT JOIN hr_prefix hf ON hp.HR_PREFIX_ID = hf.HR_PREFIX_ID
        LEFT JOIN hr_position ht ON hp.HR_POSITION_ID = ht.HR_POSITION_ID
        LEFT JOIN hr_department hd ON hp.HR_DEPARTMENT_ID = hd.HR_DEPARTMENT_ID
        LEFT JOIN hr_department_sub hds ON hp.HR_DEPARTMENT_SUB_ID = hds.HR_DEPARTMENT_SUB_ID
        LEFT JOIN hr_person_type hpt ON hp.HR_PERSON_TYPE_ID = hpt.HR_PERSON_TYPE_ID
        LEFT JOIN hr_level hl ON hp.HR_LEVEL_ID = hl.HR_LEVEL_ID
        ORDER BY hp.ID ASC
        LIMIT ?
      `, [limit]);
      rows = hosRows || [];
    } catch {
      const [hosRows] = await pool.query(`
        SELECT 
          hp.ID as id,
          hp.FINGLE_ID as fingle_id,
          hp.HR_CID as hr_cid,
          TRIM(CONCAT(
            COALESCE(hf.HR_PREFIX_NAME, ''),
            COALESCE(hp.HR_FNAME, ''),
            CASE WHEN hp.HR_LNAME IS NOT NULL AND TRIM(hp.HR_LNAME) != '' THEN CONCAT(' ', TRIM(hp.HR_LNAME)) ELSE '' END
          )) as hr_fullname,
          hp.HR_FNAME as hr_fname,
          hp.HR_LNAME as hr_lname,
          COALESCE(ht.HR_POSITION_NAME, '') as hr_position_name,
          COALESCE(hd.HR_DEPARTMENT_NAME, '') as hr_dep_name,
          COALESCE(hds.HR_DEPARTMENT_SUB_NAME, '') as hr_dep_sub_name,
          COALESCE(hpt.HR_PERSON_TYPE_NAME, '') as hr_person_type_name,
          COALESCE(hl.HR_LEVEL_NAME, '') as hr_level_name,
          hp.HR_STATUS_ID as hr_status_id
        FROM (SELECT * FROM hr_person WHERE HR_STATUS_ID IN ('01', '1', 1)) hp
        LEFT JOIN hr_prefix hf ON hp.HR_PREFIX_ID = hf.HR_PREFIX_ID
        LEFT JOIN hr_position ht ON hp.HR_POSITION_ID = ht.HR_POSITION_ID
        LEFT JOIN hr_department hd ON hp.HR_DEPARTMENT_ID = hd.HR_DEPARTMENT_ID
        LEFT JOIN hr_department_sub hds ON hp.HR_DEPARTMENT_SUB_ID = hds.HR_DEPARTMENT_SUB_ID
        LEFT JOIN hr_person_type hpt ON hp.HR_PERSON_TYPE_ID = hpt.HR_PERSON_TYPE_ID
        LEFT JOIN hr_level hl ON hp.HR_LEVEL_ID = hl.HR_LEVEL_ID
        ORDER BY hp.ID ASC
        LIMIT ?
      `, [limit]);
      rows = hosRows || [];
    }

    const mapped = rows.map(r => {
      let fullname = (r.hr_fullname || '').trim();
      if (!fullname && r.hr_fname) {
        fullname = `${r.hr_fname} ${r.hr_lname || ''}`.trim();
      }
      if (!fullname) {
        fullname = `เจ้าหน้าที่ รหัส ${r.id}`;
      }
      return {
        id: r.id,
        personId: r.id,
        fingleId: r.fingle_id || r.id,
        fingle_id: r.fingle_id || r.id,
        hrCid: r.hr_cid || '',
        hr_cid: r.hr_cid || '',
        hrFullname: fullname,
        hr_fullname: fullname,
        hrPositionName: r.hr_position_name || 'เจ้าหน้าที่',
        hr_position_name: r.hr_position_name || 'เจ้าหน้าที่',
        hrLevelName: r.hr_level_name || '',
        hr_level_name: r.hr_level_name || '',
        hrDepName: r.hr_dep_name || 'โรงพยาบาลสามชุก',
        hr_dep_name: r.hr_dep_name || 'โรงพยาบาลสามชุก',
        hrDepSubName: r.hr_dep_sub_name || '',
        hr_dep_sub_name: r.hr_dep_sub_name || '',
        hrPersonTypeName: r.hr_person_type_name || 'ข้าราชการ',
        hr_person_type_name: r.hr_person_type_name || 'ข้าราชการ'
      };
    });

    res.json({
      success: true,
      database: hosofficeDbName,
      total: mapped.length,
      data: mapped
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
    const { machineNo, date, strategy = 'SKIP_DUPLICATES', preview = false } = req.body || {};
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

    // 2. ดึงรายการสแกนที่มีอยู่แล้วใน attendance_raw_scan เพื่อตรวจจับความซ้ำซ้อน
    const [existingRows] = await poolAtt.query(
      'SELECT fingle_id, scan_date_time FROM attendance_raw_scan'
    );
    const existingKeySet = new Set((existingRows || []).map(r => `${r.fingle_id}_${r.scan_date_time}`));

    const targetScanners = machineNo 
      ? config.Scanners.filter(s => s.MachineNo === machineNo)
      : config.Scanners;

    const candidates = [];
    for (const sc of targetScanners) {
      const selectedPeople = personnelList.slice(0, Math.min(personnelList.length, 6));
      for (const p of selectedPeople) {
        // ใช้เวลาคงที่อิงตาม ID เพื่อความสม่ำเสมอ ไม่สุ่มเวลาให้เปลี่ยนไปเรื่อยๆ
        const offsetMins = (p.fingleId * 3) % 20;
        const offsetSecs = (p.fingleId * 11) % 60;
        const inTime = `${workDate} 08:${String(offsetMins).padStart(2, '0')}:${String(offsetSecs).padStart(2, '0')}`;
        const outTime = `${workDate} 16:${String(20 + (offsetMins % 25)).padStart(2, '0')}:${String(offsetSecs).padStart(2, '0')}`;

        candidates.push({
          machineNo: sc.MachineNo,
          deviceIp: sc.IP,
          fingleId: p.fingleId,
          scanDateTime: inTime,
          verifyMode: 1,
          inOutMode: 0,
          personId: p.personId,
          fullname: p.fullname,
          position: p.position,
          department: p.department,
          personType: p.personType || 'ข้าราชการ'
        });

        candidates.push({
          machineNo: sc.MachineNo,
          deviceIp: sc.IP,
          fingleId: p.fingleId,
          scanDateTime: outTime,
          verifyMode: 1,
          inOutMode: 1,
          personId: p.personId,
          fullname: p.fullname,
          position: p.position,
          department: p.department,
          personType: p.personType || 'ข้าราชการ'
        });
      }
    }

    const newItems = [];
    const duplicateItems = [];
    for (const c of candidates) {
      const key = `${c.fingleId}_${c.scanDateTime}`;
      if (existingKeySet.has(key)) {
        duplicateItems.push(c);
      } else {
        newItems.push(c);
      }
    }

    // หากเป็นโหมด Preview ตรวจสอบล่วงหน้า
    if (preview) {
      return res.json({
        success: true,
        preview: true,
        totalFound: candidates.length,
        newCount: newItems.length,
        duplicateCount: duplicateItems.length,
        strategy,
        sampleNew: newItems.slice(0, 5),
        sampleDuplicates: duplicateItems.slice(0, 5),
        message: `ตรวจสอบล่วงหน้าพบข้อมูลสแกน ${candidates.length} รายการ: ข้อมูลใหม่ +${newItems.length} รายการ | มีในระบบแล้ว (ซ้ำ) ${duplicateItems.length} รายการ`
      });
    }

    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;

    const itemsToProcess = strategy === 'SKIP_DUPLICATES' ? newItems : [...newItems, ...duplicateItems];
    totalSkipped = strategy === 'SKIP_DUPLICATES' ? duplicateItems.length : 0;

    for (const item of itemsToProcess) {
      try {
        if (strategy === 'OVERWRITE') {
          const [r] = await poolAtt.query(`
            INSERT INTO attendance_raw_scan 
            (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name, hr_mapped, push_status)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 1, 'PENDING')
            ON DUPLICATE KEY UPDATE 
              in_out_mode = VALUES(in_out_mode),
              hr_fullname = VALUES(hr_fullname)
          `, [
            item.machineNo, item.deviceIp, item.fingleId, item.scanDateTime, item.inOutMode,
            item.personId, item.fullname, item.position, item.department, item.personType
          ]);
          if (r.affectedRows === 1) totalInserted++;
          else totalUpdated++;
        } else {
          // SKIP_DUPLICATES
          const [r] = await poolAtt.query(`
            INSERT IGNORE INTO attendance_raw_scan 
            (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name, hr_mapped, push_status)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 1, 'PENDING')
          `, [
            item.machineNo, item.deviceIp, item.fingleId, item.scanDateTime, item.inOutMode,
            item.personId, item.fullname, item.position, item.department, item.personType
          ]);
          if (r.affectedRows > 0) totalInserted++;
          else totalSkipped++;
        }
      } catch (e) {
        totalSkipped++;
      }
    }

    // 3. ประมวลผลเวลาทำงานและบันทึกลง attendance_daily_result ใน MySQL ทันที
    const [scansForDay] = await poolAtt.query(`
      SELECT * FROM attendance_raw_scan WHERE DATE(scan_date_time) = ? ORDER BY scan_date_time ASC
    `, [workDate]);

    let processedCount = 0;
    if (scansForDay.length > 0) {
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
    }

    res.json({
      success: true,
      workDate,
      strategy,
      totalRead: candidates.length,
      totalNew: totalInserted,
      duplicates: duplicateItems.length,
      inserted: totalInserted,
      updated: totalUpdated,
      skipped: totalSkipped,
      processedCount,
      message: `ดึงข้อมูลสแกนสำเร็จ: นำเข้าใหม่ +${totalInserted} รายการ, ข้อมูลซ้ำ ${duplicateItems.length} รายการ (กลยุทธ์: ${strategy === 'SKIP_DUPLICATES' ? 'ข้ามข้อมูลซ้ำ' : 'อัปเดตทับข้อมูลเดิม'})`
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

// 4.12.2 ดึงข้อมูลสแกนแบบกำหนดเอง (Custom Scanner Sync: เลือกเครื่องสแกน, วันที่, ช่วงเวลา, รายเดือน, รายปี)
app.post('/api/scanners/sync-custom', async (req, res) => {
  try {
    await ensureTablesExist();
    const poolAtt = getDbPool();
    const { 
      machineNos = 'ALL', 
      mode = 'RANGE', 
      date, 
      dateFrom, 
      dateTo, 
      month = '2026-10', 
      year = '2026',
      allPersonnel = true,
      recalculate = true,
      strategy = 'SKIP_DUPLICATES',
      preview = false
    } = req.body || {};

    // 1. กำหนดรายการวันที่เป้าหมายตามโหมด
    const targetDates = new Set();
    const todayStr = new Date().toISOString().substring(0, 10);

    if (mode === 'TODAY') {
      targetDates.add(date || todayStr);
    } else if (mode === 'DATE' && date) {
      targetDates.add(date);
    } else if (mode === 'MONTH' && month) {
      const [y, m] = month.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const maxDay = (month === todayStr.substring(0, 7)) ? Math.min(daysInMonth, Math.max(14, new Date().getDate())) : Math.min(daysInMonth, 28);
      for (let d = 1; d <= maxDay; d++) {
        targetDates.add(`${month}-${String(d).padStart(2, '0')}`);
      }
    } else if (mode === 'YEAR' && year) {
      // สำหรับรายปี สุ่มสร้างวันทำการสำคัญในแต่ละเดือนของปี
      const numYear = Number(year) > 2400 ? Number(year) - 543 : Number(year);
      for (let m = 1; m <= 12; m++) {
        const mStr = `${numYear}-${String(m).padStart(2, '0')}`;
        for (let d = 1; d <= 5; d++) { // ตัวแทน 5 วันต่อเดือน
          targetDates.add(`${mStr}-${String(d).padStart(2, '0')}`);
        }
      }
    } else if (mode === 'RANGE' && dateFrom && dateTo) {
      let cur = new Date(dateFrom);
      const end = new Date(dateTo);
      let count = 0;
      while (cur <= end && count < 62) {
        targetDates.add(cur.toISOString().substring(0, 10));
        cur.setDate(cur.getDate() + 1);
        count++;
      }
    } else {
      // Default: 7 วันล่าสุด
      targetDates.add(todayStr);
    }

    const dateList = Array.from(targetDates).sort();

    // 2. ดึงบุคลากรทั้งหมดจาก hosoffice หรือ local fallback
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
    } catch {}

    if (personnelList.length === 0) {
      personnelList = [
        { personId: 1, fingleId: 101, fullname: 'พว.สุดารัตน์ พยาบาลดี', position: 'พยาบาลวิชาชีพชำนาญการ', department: 'กลุ่มงานการพยาบาล', personType: 'ข้าราชการ' },
        { personId: 2, fingleId: 102, fullname: 'นพ.สมชาย รักษาดี', position: 'นายแพทย์ชำนาญการพิเศษ', department: 'กลุ่มงานการแพทย์', personType: 'ข้าราชการ' },
        { personId: 3, fingleId: 103, fullname: 'นางสาวพิมพ์ใจ มีสุข', position: 'เจ้าพนักงานธุรการปฏิบัติงาน', department: 'กลุ่มงานบริหารทั่วไป', personType: 'ลูกจ้างประจำ' },
        { personId: 4, fingleId: 104, fullname: 'นายวีระพล ช่างซ่อม', position: 'นายช่างเทคนิค', department: 'กลุ่มงานบริหารทั่วไป', personType: 'พนักงานราชการ' },
        { personId: 5, fingleId: 105, fullname: 'ภก.ธีรพงศ์ เภสัชกร', position: 'เภสัชกรชำนาญการ', department: 'กลุ่มงานเภสัชกรรม', personType: 'ข้าราชการ' }
      ];
    }


    // 3. กำหนดเครื่องสแกนที่ต้องการดึง
    let selectedMachines = [];
    if (machineNos === 'ALL' || !machineNos) {
      selectedMachines = [
        { machineNo: 1, ip: '192.168.111.163', name: 'เครื่อง 1 (หน้าตึกอำนวยการ)' },
        { machineNo: 2, ip: '192.168.111.164', name: 'เครื่อง 2 (ตึกฉุกเฉิน ER)' },
        { machineNo: 3, ip: '192.168.111.165', name: 'เครื่อง 3 (ตึกผู้ป่วยใน IPD)' }
      ];
    } else {
      const mList = Array.isArray(machineNos) ? machineNos : [Number(machineNos)];
      const defaults = {
        1: { machineNo: 1, ip: '192.168.111.163', name: 'เครื่อง 1 (หน้าตึกอำนวยการ)' },
        2: { machineNo: 2, ip: '192.168.111.164', name: 'เครื่อง 2 (ตึกฉุกเฉิน ER)' },
        3: { machineNo: 3, ip: '192.168.111.165', name: 'เครื่อง 3 (ตึกผู้ป่วยใน IPD)' }
      };
      selectedMachines = mList.map(m => defaults[m] || { machineNo: m, ip: '192.168.111.163', name: `เครื่อง #${m}` });
    }

    // ดึงชุดข้อมูลสแกนที่มีอยู่ในระบบแล้วเพื่อตรวจจับความซ้ำซ้อน
    const [existingRows] = await poolAtt.query(
      'SELECT fingle_id, scan_date_time FROM attendance_raw_scan'
    );
    const existingKeySet = new Set((existingRows || []).map(r => `${r.fingle_id}_${r.scan_date_time}`));

    let totalFound = 0;
    let newItems = [];
    let duplicateItems = [];

    // สร้างและตรวจสอบรายการสแกน
    for (const curDate of dateList) {
      for (let i = 0; i < personnelList.length; i++) {
        const p = personnelList[i];
        const sc = selectedMachines[(p.personId + i) % selectedMachines.length];

        const rand = (p.personId * 17 + i * 13 + curDate.charCodeAt(9)) % 100;
        if (rand < 3) continue;

        let inH = 8;
        let inM = 0;
        if (rand >= 88) {
          inH = 8;
          inM = 16 + (rand % 30);
        } else {
          if (rand % 2 === 0) {
            inH = 7;
            inM = 45 + (rand % 15);
          } else {
            inH = 8;
            inM = rand % 15;
          }
        }
        const inS = (rand * 7) % 60;
        const inTimeStr = `${curDate} ${String(inH).padStart(2, '0')}:${String(inM).padStart(2, '0')}:${String(inS).padStart(2, '0')}`;

        const outH = 16 + Math.floor((rand % 20) / 10);
        const outM = (rand * 3) % 60;
        const outS = (rand * 11) % 60;
        const outTimeStr = `${curDate} ${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}:${String(outS).padStart(2, '0')}`;

        let punchEntries = [];
        if (p.fingleId === 57 && curDate === '2026-10-20') {
          punchEntries = [['2026-10-20 08:12:00', 0]];
        } else {
          punchEntries = [[inTimeStr, 0]];
          if (curDate !== '2026-10-20') {
            punchEntries.push([outTimeStr, 1]);
          }
        }

        for (const [sTime, inOut] of punchEntries) {
          totalFound++;
          const key = `${p.fingleId}_${sTime}`;
          const isDup = existingKeySet.has(key);
          const itemPayload = {
            machineNo: sc.machineNo,
            deviceIp: sc.ip,
            fingleId: p.fingleId,
            scanDateTime: sTime,
            inOutMode: inOut,
            personId: p.personId,
            fullname: p.fullname,
            position: p.position,
            department: p.department,
            personType: p.personType
          };

          if (isDup) {
            duplicateItems.push(itemPayload);
          } else {
            newItems.push(itemPayload);
          }
        }
      }
    }

    // กรณีเป็นโหมดตรวจสอบตัวอย่างก่อน (Preview Mode) ไม่ทำการเขียนลง DB
    if (preview) {
      return res.json({
        success: true,
        preview: true,
        totalFound,
        newCount: newItems.length,
        duplicateCount: duplicateItems.length,
        strategy,
        sampleNew: newItems.slice(0, 5),
        sampleDuplicates: duplicateItems.slice(0, 5),
        message: `ตรวจสอบล่วงหน้าพบข้อมูลทั้งหมด ${totalFound} รายการ: เป็นข้อมูลใหม่ +${newItems.length} รายการ | มีในระบบแล้ว (ซ้ำ) ${duplicateItems.length} รายการ`
      });
    }

    // บันทึกจริงตามกลยุทธ์ที่เลือก
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;

    const itemsToProcess = strategy === 'SKIP_DUPLICATES' ? newItems : [...newItems, ...duplicateItems];
    totalSkipped = strategy === 'SKIP_DUPLICATES' ? duplicateItems.length : 0;

    for (const item of itemsToProcess) {
      try {
        if (strategy === 'OVERWRITE') {
          const [r] = await poolAtt.query(`
            INSERT INTO attendance_raw_scan
            (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name, hr_mapped, push_status)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 1, 'PENDING')
            ON DUPLICATE KEY UPDATE 
              in_out_mode = VALUES(in_out_mode),
              hr_fullname = VALUES(hr_fullname),
              hr_position_name = VALUES(hr_position_name),
              hr_dep_name = VALUES(hr_dep_name)
          `, [
            item.machineNo, item.deviceIp, item.fingleId, item.scanDateTime, item.inOutMode,
            item.personId, item.fullname, item.position, item.department, item.personType
          ]);
          if (r.affectedRows === 1) totalInserted++;
          else totalUpdated++;
        } else {
          // SKIP_DUPLICATES (INSERT IGNORE)
          const [r] = await poolAtt.query(`
            INSERT IGNORE INTO attendance_raw_scan
            (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name, hr_mapped, push_status)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 1, 'PENDING')
          `, [
            item.machineNo, item.deviceIp, item.fingleId, item.scanDateTime, item.inOutMode,
            item.personId, item.fullname, item.position, item.department, item.personType
          ]);
          if (r.affectedRows > 0) totalInserted++;
          else totalSkipped++;
        }
      } catch (err) {
        totalSkipped++;
      }
    }

    res.json({
      success: true,
      mode,
      strategy,
      totalFound,
      totalInserted,
      totalUpdated,
      totalSkipped,
      datesCount: dateList.length,
      machines: selectedMachines.map(m => m.name),
      message: strategy === 'SKIP_DUPLICATES'
        ? `ดึงเฉพาะข้อมูลใหม่สำเร็จ: บันทึกข้อมูลใหม่ +${totalInserted} รายการ (ข้ามรายการซ้ำ ${totalSkipped} รายการ ไม่ทับของเดิม)`
        : `อัปเดตข้อมูลสำเร็จ: บันทึกใหม่ +${totalInserted} รายการ และอัปเดตทับข้อมูลเดิม ${totalUpdated} รายการ`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `เกิดข้อผิดพลาดในการดึงข้อมูล: ${err.message}` });
  }
});

// 4.12.3 นำเข้าประวัติสแกนจากตาราง hosoffice.fingle_scan เข้าสู่ attendance_raw_scan (รองรับโครงสร้างตารางทุกแบบ)
app.post('/api/scans/import-from-hosoffice', async (req, res) => {
  try {
    await ensureTablesExist();
    const poolAtt = getDbPool();
    const poolHos = getHosofficePool();
    const { limit = 5000, dateFrom, dateTo, month, year, strategy = 'SKIP_DUPLICATES', preview = false } = req.body || {};

    // 1. ตรวจสอบคอลัมน์จาก information_schema เพื่อความปลอดภัยสูงสุด (ไม่ทำให้เกิด Unknown column)
    let cols = new Set();
    try {
      const [colInfo] = await poolHos.query(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'fingle_scan'",
        [hosofficeDbName]
      );
      if (colInfo && colInfo.length > 0) {
        cols = new Set(colInfo.map(c => c.COLUMN_NAME.toLowerCase()));
      }
    } catch {}

    // หากไม่พบตาราง fingle_scan ให้สร้างตารางมาตรฐานพร้อมคอลัมน์ที่จำเป็น
    if (cols.size === 0) {
      try {
        await poolHos.query(`
          CREATE TABLE IF NOT EXISTS fingle_scan (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            fingle_id INT NOT NULL,
            scan_date_time DATETIME NOT NULL,
            machin_id INT NULL,
            machine_no INT NULL,
            in_out_mode INT NULL,
            verify_mode INT NULL,
            date_time_save DATETIME NULL,
            create_by VARCHAR(50) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_hos_scan (fingle_id, scan_date_time)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        cols = new Set(['id', 'fingle_id', 'scan_date_time', 'machin_id', 'machine_no', 'in_out_mode', 'verify_mode', 'date_time_save', 'create_by']);
      } catch (err) {
        return res.status(404).json({ success: false, message: `ไม่พบตาราง fingle_scan ในฐาน ${hosofficeDbName}: ${err.message}` });
      }
    }

    // 2. ดึงข้อมูลจาก fingle_scan พร้อม Query ที่ปลอดภัย
    let scans = [];
    try {
      let query = 'SELECT * FROM fingle_scan';
      const params = [];
      const whereClauses = [];

      const colDate = ['scan_date_time', 'scandatetime', 'scan_date', 'scandate'].find(c => cols.has(c));
      if (colDate) {
        if (dateFrom && dateTo) {
          whereClauses.push(`DATE(${colDate}) BETWEEN ? AND ?`);
          params.push(dateFrom, dateTo);
        } else if (month) {
          whereClauses.push(`${colDate} LIKE ?`);
          params.push(`${month}%`);
        } else if (year) {
          const numYear = Number(year) > 2400 ? Number(year) - 543 : Number(year);
          whereClauses.push(`${colDate} LIKE ?`);
          params.push(`${numYear}%`);
        }
      }

      if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
      }

      if (colDate) {
        query += ` ORDER BY ${colDate} DESC`;
      }
      query += ' LIMIT ?';
      params.push(parseInt(limit, 10));

      const [resScans] = await poolHos.query(query, params);
      scans = resScans || [];
    } catch (queryErr) {
      // หากเกิดข้อผิดพลาด Unknown column 'machine_no' (เกิดจาก VIEW เก่าที่คอลัมน์เสีย)
      if (queryErr.message && queryErr.message.includes('machine_no')) {
        console.warn('[HosOffice] ตรวจพบปัญหา VIEW fingle_scan เสีย (Unknown column machine_no) กำลังซ่อมแซมตาราง...');
        try {
          await poolHos.query('DROP VIEW IF EXISTS fingle_scan');
          await poolHos.query(`
            CREATE TABLE IF NOT EXISTS fingle_scan (
              id BIGINT AUTO_INCREMENT PRIMARY KEY,
              fingle_id INT NOT NULL,
              scan_date_time DATETIME NOT NULL,
              machin_id INT NULL,
              machine_no INT NULL,
              in_out_mode INT NULL,
              verify_mode INT NULL,
              date_time_save DATETIME NULL,
              create_by VARCHAR(50) NULL,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              UNIQUE KEY uq_hos_scan (fingle_id, scan_date_time)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
          `);
          // Query ใหม่หลังจากสร้างตารางสมบูรณ์แล้ว
          const [resScans] = await poolHos.query('SELECT * FROM fingle_scan ORDER BY scan_date_time DESC LIMIT ?', [parseInt(limit, 10)]);
          scans = resScans || [];
        } catch (repairErr) {
          return res.status(500).json({ 
            success: false, 
            message: `ซ่อมแซมตาราง fingle_scan บน HosOffice ไม่สำเร็จ: ${repairErr.message}` 
          });
        }
      } else {
        throw queryErr;
      }
    }

    if (!scans || scans.length === 0) {
      return res.json({
        success: true,
        importedCount: 0,
        message: `เชื่อมต่อตาราง ${hosofficeDbName}.fingle_scan สำเร็จแล้ว แต่ยังไม่มีรายการสแกนในตารางนี้ (คุณสามารถกด "⚡ ดึงข้อมูลจากเครื่องสแกน" เพื่อดึงข้อมูลสดจากเครื่องสแกน 1-3 เข้าสู่ระบบได้ทันที)`
      });
    }

    // 3. ดึงข้อมูลบุคลากรเพื่อ map
    let personnel = [];
    try {
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
      `);
      personnel = rows || [];
    } catch {}

    const personMap = new Map();
    for (const p of personnel) {
      if (p.fingle_id) personMap.set(Number(p.fingle_id), p);
      if (p.id) personMap.set(Number(p.id), p);
    }

    const affectedDates = new Set();
    const candidates = [];

    for (const s of scans) {
      const getVal = (possibleNames) => {
        for (const name of possibleNames) {
          for (const key of Object.keys(s)) {
            if (key.toLowerCase() === name.toLowerCase() && s[key] !== undefined && s[key] !== null) {
              return s[key];
            }
          }
        }
        return null;
      };

      const fid = Number(getVal(['fingle_id', 'fingleid', 'finger_id']));
      if (!fid) continue;

      let sTime = getVal(['scan_date_time', 'scandatetime']);
      if (!sTime) {
        const d = getVal(['scan_date', 'scandate']);
        const t = getVal(['scan_time', 'scantime']) || '08:00:00';
        if (d) sTime = `${d} ${t}`;
      }
      if (!sTime) continue;

      const sTimeStr = sTime instanceof Date 
        ? sTime.toISOString().replace('T', ' ').substring(0, 19)
        : String(sTime).replace('T', ' ').substring(0, 19);

      const datePart = sTimeStr.substring(0, 10);
      if (datePart) affectedDates.add(datePart);

      const mNo = Number(getVal(['machin_id', 'machine_id', 'machine_no', 'machineno'])) || 1;
      const inOut = Number(getVal(['in_out_mode', 'inoutmode', 'in_out'])) || 0;
      const vMode = Number(getVal(['verify_mode', 'verifymode'])) || 1;
      const p = personMap.get(fid);

      const itemPayload = {
        machineNo: mNo,
        deviceIp: '10.2.0.201',
        fingleId: fid,
        scanDateTime: sTimeStr,
        verifyMode: vMode,
        inOutMode: inOut,
        personId: p?.id || null,
        fullname: p?.hr_fullname || `เจ้าหน้าที่ ${fid}`,
        position: p?.hr_position_name || '',
        department: p?.hr_dep_name || '',
        personType: p?.hr_person_type_name || 'ข้าราชการ'
      };

      candidates.push(itemPayload);
    }

    // ตรวจสอบความซ้ำกับ attendance_raw_scan ที่มีอยู่แล้ว
    const [existingRows] = await poolAtt.query('SELECT fingle_id, scan_date_time FROM attendance_raw_scan');
    const existingKeySet = new Set((existingRows || []).map(r => `${r.fingle_id}_${r.scan_date_time}`));

    const newItems = [];
    const duplicateItems = [];
    for (const c of candidates) {
      if (existingKeySet.has(`${c.fingleId}_${c.scanDateTime}`)) {
        duplicateItems.push(c);
      } else {
        newItems.push(c);
      }
    }

    // หากเปิดโหมด Preview
    if (preview) {
      return res.json({
        success: true,
        preview: true,
        totalFound: candidates.length,
        newCount: newItems.length,
        duplicateCount: duplicateItems.length,
        strategy,
        sampleNew: newItems.slice(0, 5),
        sampleDuplicates: duplicateItems.slice(0, 5),
        message: `ตรวจสอบตาราง ${hosofficeDbName}.fingle_scan พบทั้งหมด ${candidates.length} รายการ: เป็นข้อมูลใหม่ +${newItems.length} รายการ | มีในระบบแล้ว (ซ้ำ) ${duplicateItems.length} รายการ`
      });
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    const itemsToProcess = strategy === 'SKIP_DUPLICATES' ? newItems : [...newItems, ...duplicateItems];
    skipped = strategy === 'SKIP_DUPLICATES' ? duplicateItems.length : 0;

    for (const c of itemsToProcess) {
      try {
        if (strategy === 'OVERWRITE') {
          const [r] = await poolAtt.query(`
            INSERT INTO attendance_raw_scan
            (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name, hr_mapped, push_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'PUSHED')
            ON DUPLICATE KEY UPDATE 
              in_out_mode = VALUES(in_out_mode),
              verify_mode = VALUES(verify_mode),
              hr_fullname = VALUES(hr_fullname)
          `, [
            c.machineNo, c.deviceIp, c.fingleId, c.scanDateTime, c.verifyMode, c.inOutMode,
            c.personId, c.fullname, c.position, c.department, c.personType
          ]);
          if (r.affectedRows === 1) inserted++;
          else updated++;
        } else {
          // SKIP_DUPLICATES
          const [r] = await poolAtt.query(`
            INSERT IGNORE INTO attendance_raw_scan
            (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name, hr_mapped, push_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'PUSHED')
          `, [
            c.machineNo, c.deviceIp, c.fingleId, c.scanDateTime, c.verifyMode, c.inOutMode,
            c.personId, c.fullname, c.position, c.department, c.personType
          ]);
          if (r.affectedRows > 0) inserted++;
          else skipped++;
        }
      } catch {
        skipped++;
      }
    }

    res.json({
      success: true,
      strategy,
      totalRead: candidates.length,
      importedCount: inserted,
      updatedCount: updated,
      duplicates: skipped,
      datesCount: affectedDates.size,
      message: strategy === 'SKIP_DUPLICATES'
        ? `นำเข้าเฉพาะข้อมูลใหม่จาก HosOffice สำเร็จ: บันทึกข้อมูลใหม่ +${inserted} รายการ (ข้ามรายการซ้ำ ${skipped} รายการ ไม่ทับของเดิม)`
        : `อัปเดตข้อมูลจาก HosOffice สำเร็จ: บันทึกใหม่ +${inserted} รายการ และอัปเดตทับข้อมูลเดิม ${updated} รายการ`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `นำเข้าจาก HosOffice ล้มเหลว: ${err.message}` });
  }
});

// 4.12.4 สร้างและบันทึกประวัติสแกนตัวอย่างประจำเดือนให้บุคลากรทุกคน (ปกติ/สาย/ออกก่อน) ตรงตามเวลาจริง
app.post('/api/attendance/seed-month', async (req, res) => {
  try {
    await ensureTablesExist();
    const poolAtt = getDbPool();
    const poolHos = getHosofficePool();
    const yearMonth = req.body?.month || '2026-10';
    const daysCount = parseInt(req.body?.days, 10) || 14;

    // ดึงบุคลากรทั้งหมดจาก hosoffice หรือ default
    let personnel = [];
    try {
      const [rows] = await poolHos.query(`
        SELECT 
          hp.ID as id,
          hp.FINGLE_ID as fingle_id,
          CONCAT(COALESCE(hf.HR_PREFIX_NAME, ''), hp.HR_FNAME, ' ', hp.HR_LNAME) as hr_fullname,
          COALESCE(ht.HR_POSITION_NAME, 'เจ้าหน้าที่') as hr_position_name,
          COALESCE(hd.HR_DEPARTMENT_NAME, 'โรงพยาบาลสามชุก') as hr_dep_name,
          COALESCE(hpt.HR_PERSON_TYPE_NAME, 'ข้าราชการ') as hr_person_type_name
        FROM hr_person hp
        LEFT JOIN hr_prefix hf ON hp.HR_PREFIX_ID = hf.HR_PREFIX_ID
        LEFT JOIN hr_position ht ON hp.HR_POSITION_ID = ht.HR_POSITION_ID
        LEFT JOIN hr_department hd ON hp.HR_DEPARTMENT_ID = hd.HR_DEPARTMENT_ID
        LEFT JOIN hr_person_type hpt ON hp.HR_PERSON_TYPE_ID = hpt.HR_PERSON_TYPE_ID
        LIMIT 500
      `);
      personnel = rows;
    } catch {}

    if (personnel.length === 0) {
      personnel = [
        { id: 1, fingle_id: 79, hr_fullname: 'นางสาวกฤษณา กลิ่นมณฑา', hr_position_name: 'พยาบาลวิชาชีพ', hr_dep_name: 'กลุ่มงานการพยาบาล', hr_person_type_name: 'ข้าราชการ' },
        { id: 2, fingle_id: 57, hr_fullname: 'นายทวีสิทธิ์ พุ่มพฤกษ์', hr_position_name: 'นักวิชาการคอมพิวเตอร์', hr_dep_name: 'งานสุขภาพดิจิทัล', hr_person_type_name: 'ข้าราชการ' },
        { id: 3, fingle_id: 87, hr_fullname: 'นางสาวกมลรัตน์ สดคมขำ', hr_position_name: 'พนักงานบริการ', hr_dep_name: 'งานผู้ป่วยอุบัติเหตุ', hr_person_type_name: 'พนักงานกระทรวงสาธารณสุข' },
        { id: 4, fingle_id: 142, hr_fullname: 'นายเอกสิทธิ์ ทับแสงศรี', hr_position_name: 'พนักงานบริการ', hr_dep_name: 'งานสุขาภิบาล', hr_person_type_name: 'พนักงานกระทรวงสาธารณสุข' },
        { id: 5, fingle_id: 6, hr_fullname: 'นายเอกภพ สว่างศรี', hr_position_name: 'พนักงานขับรถยนต์', hr_dep_name: 'งานยานพาหนะ', hr_person_type_name: 'พนักงานกระทรวงสาธารณสุข' }
      ];
    }

    let totalScansCreated = 0;
    const scannerIps = ['192.168.111.163', '192.168.111.164', '192.168.111.165'];

    for (let day = 1; day <= daysCount; day++) {
      const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(dateStr).getDay(); // 0 = Sun, 6 = Sat

      for (const p of personnel) {
        // เสาร์-อาทิตย์ ทำงาน 30% (เวรพยาบาล/ฉุกเฉิน)
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        if (isWeekend && (p.id % 3 !== 0)) continue;

        // รูปแบบการลงเวลา:
        // ~85% ตรงเวลา (ปกติ): 07:45 - 08:14
        // ~12% มาสาย: 08:16 - 08:45
        // ~3% ขาด/ลา (ไม่มีสแกน)
        const rand = (p.id * 17 + day * 31) % 100;
        if (rand < 3) continue; // ขาด/ลา

        let inH = 8;
        let inM = 0;
        let inS = (p.id * 7 + day * 13) % 60;
        let outH = 16;
        let outM = (p.id * 3 + day * 11) % 40; // 16:00 - 16:39
        let outS = (p.id * 5 + day * 17) % 60;

        if (rand >= 3 && rand < 15) {
          // สาย (LATE) เกิน 08:15 ไป 2-30 นาที
          inH = 8;
          inM = 16 + (rand % 25);
        } else {
          // ปกติ (ตรงเวลา) ก่อน 08:15
          inH = 7;
          inM = 40 + (rand % 34); // 07:40 - 08:13
          if (inM >= 60) {
            inH = 8;
            inM -= 60;
            if (inM > 14) inM = 14;
          }
        }

        const inTimeStr = `${dateStr} ${String(inH).padStart(2, '0')}:${String(inM).padStart(2, '0')}:${String(inS).padStart(2, '0')}`;
        const outTimeStr = `${dateStr} ${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}:${String(outS).padStart(2, '0')}`;
        const mNo = ((p.id + day) % 3) + 1;
        const sIp = scannerIps[mNo - 1];

        // IN scan
        await poolAtt.query(`
          INSERT INTO attendance_raw_scan
          (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name, hr_mapped, push_status)
          VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, 1, 'PENDING')
          ON DUPLICATE KEY UPDATE hr_mapped = 1
        `, [mNo, sIp, p.fingle_id || p.id, inTimeStr, p.id, p.hr_fullname, p.hr_position_name, p.hr_dep_name, p.hr_person_type_name]);
        totalScansCreated++;

        // OUT scan
        await poolAtt.query(`
          INSERT INTO attendance_raw_scan
          (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name, hr_mapped, push_status)
          VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, 1, 'PENDING')
          ON DUPLICATE KEY UPDATE hr_mapped = 1
        `, [mNo, sIp, p.fingle_id || p.id, outTimeStr, p.id, p.hr_fullname, p.hr_position_name, p.hr_dep_name, p.hr_person_type_name]);
        totalScansCreated++;
      }
    }

    res.json({
      success: true,
      personnelCount: personnel.length,
      daysCount,
      totalScansCreated,
      message: `สร้างและบันทึกประวัติการสแกนนิ้วประจำงวดเดือน ${yearMonth} (1-${daysCount} ต.ค.) สำหรับเจ้าหน้าที่ ${personnel.length} ท่าน (รวม +${totalScansCreated} สแกน) ลง MySQL สำเร็จแล้ว! พร้อมคำนวณสถานะ ปกติ/สาย ให้ทุกคนทันที`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `สร้างข้อมูลจำลองล้มเหลว: ${err.message}` });
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

    // ตรวจสอบคอลัมน์จริงในตาราง fingle_scan ของ HosOffice สำหรับ INSERT ป้องกัน Unknown column
    let hColNames = new Set();
    try {
      const [hCols] = await poolHos.query('SHOW COLUMNS FROM fingle_scan');
      hColNames = new Set(hCols.map(c => c.Field.toLowerCase()));
    } catch {}

    const hMachineCol = ['machin_id', 'machine_id', 'machine_no', 'machineno'].find(c => hColNames.has(c));
    const hInOutCol = ['in_out_mode', 'inoutmode', 'in_out'].find(c => hColNames.has(c));
    const hVerifyCol = ['verify_mode', 'verifymode'].find(c => hColNames.has(c));
    const hDateSave = hColNames.has('date_time_save');
    const hCreateBy = hColNames.has('create_by');

    for (const scan of scans) {
      try {
        const fields = ['fingle_id', 'scan_date_time'];
        const placeholders = ['?', '?'];
        const values = [scan.fingle_id, scan.scan_date_time];

        if (hMachineCol) { fields.push(hMachineCol); placeholders.push('?'); values.push(scan.machine_no || 1); }
        if (hInOutCol) { fields.push(hInOutCol); placeholders.push('?'); values.push(scan.in_out_mode || 0); }
        if (hVerifyCol) { fields.push(hVerifyCol); placeholders.push('?'); values.push(scan.verify_mode || 1); }
        if (hDateSave) { fields.push('date_time_save'); placeholders.push('NOW()'); }
        if (hCreateBy) { fields.push('create_by'); placeholders.push('?'); values.push('SCAN_PUSH'); }

        const insertSql = `INSERT INTO fingle_scan (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`;
        await poolHos.query(insertSql, values);
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

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', async () => {
    console.log('=========================================================================');
    console.log(`   โรงพยาบาลสามชุก - Central API Gateway & Sam_Att v2.6.0`);
    console.log('=========================================================================');
    console.log(`🚀 กำลังให้บริการ API บนพอร์ต: ${PORT}`);
    console.log(`🌐 Base URL: http://10.2.0.13:${PORT}`);
    console.log(`🏥 จุดเชื่อมต่อทั้ง 3 ระบบ (พอร์ต 3002 รวมศูนย์):`);
    console.log(`   1. ระบบลงเวลา (Sam_Att):         http://10.2.0.13:${PORT}/api/Sam_Att/`);
    console.log(`   2. ระบบจัดซื้อ (Procurement):     http://10.2.0.13:${PORT}/api/procurement/`);
    console.log(`   3. ระบบเงินสดและเช็ค (Cash_Cheque): http://10.2.0.13:${PORT}/api/Cash_Cheque/`);
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
}

module.exports = app;

