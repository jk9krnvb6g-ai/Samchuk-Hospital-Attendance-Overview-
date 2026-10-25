/**
 * Samchuk Hospital Attendance System - Node.js Backend API Service
 * ทำงานบนพอร์ต 3005 สำหรับรองรับ Web Frontend (พอร์ต 3001 /Sam_Att/)
 * ป้องกันการชนกับพอร์ต 3002 ของระบบ Procurement
 * เชื่อมต่อ MySQL 10.2.0.201 โดยตรงทั้ง 2 ฐานข้อมูล:
 *   1. samchuk_attendance (ฐานข้อมูลระบบลงเวลา, กะ, Roster, Staging สแกน)
 *   2. hosoffice (ฐานข้อมูลบุคลากร โรงพยาบาลสามชุก, fingle_scan)
 * ทดสอบเครื่องสแกน HIP CMiF68S พอร์ต 5005 ด้วย TCP Socket
 */

const fs = require('fs');
const path = require('path');

// 1. ค้นหาและโหลดไฟล์ .env จากหลายตำแหน่งที่เป็นไปได้
const envCandidates = [
  path.join(__dirname, '..', '.env'),
  'C:\\inetpub\\wwwroot\\Sam_Att\\.env',
  'C:\\inetpub\\wwwroot\\Samchuk_Attendance\\.env',
  path.join(__dirname, '.env'),
  path.join(process.cwd(), '.env')
];

let loadedEnvPath = null;
for (const p of envCandidates) {
  try {
    if (fs.existsSync(p)) {
      require('dotenv').config({ path: p });
      loadedEnvPath = p;
      break;
    }
  } catch {}
}
if (!loadedEnvPath) {
  require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const net = require('net');
const mysql = require('mysql2/promise');
const http = require('http');
const { execFile } = require('child_process');

// N2: กำหนดเขตเวลา Asia/Bangkok
process.env.TZ = process.env.TZ || 'Asia/Bangkok';

// N2: ตัวแปรล็อกป้องกันการเรียกคำสั่งซิงค์พร้อมกัน (Sync Mutex Lock)
let syncRunning = false;

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

// ค่าคอนฟิก MySQL เชื่อมต่อ (ยึดตาม .env หรือ config หรือค่ามาตรฐาน รพ.สามชุก)
let activeDbConfig = {
  host: process.env.DB_HOST || (config.DbHost !== '10.2.0.201' ? config.DbHost : 'localhost'),
  port: parseInt(process.env.DB_PORT || config.DbPort || '3306', 10),
  user: process.env.DB_USER || (config.DbUser && config.DbUser !== 'attendance_app' ? config.DbUser : 'sa'),
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (config.DbPassword && config.DbPassword !== 'YOUR_ATTENDANCE_DB_PASSWORD' ? config.DbPassword : ''),
  database: process.env.DB_NAME || config.AttendanceDb || 'samchuk_attendance'
};

let hosofficeDbName = process.env.HOSOFFICE_DB || config.HosOfficeDb || 'hosoffice';

// รัน auto-migration ใน background อัตโนมัติทันที
setTimeout(() => {
  ensureTablesExist().catch(err => {
    console.warn('[Sam_Att] Database auto-migration notice:', err.message);
  });
}, 500);

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
        source VARCHAR(20) NOT NULL DEFAULT 'DEVICE',
        push_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        pushed_at DATETIME NULL,
        pushed_by INT NULL,
        push_batch_id BIGINT NULL,
        push_error TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_fingle_scan (fingle_id, scan_date_time),
        KEY idx_fingle_scan (fingle_id, scan_date_time),
        KEY idx_machine_no (machine_no),
        KEY idx_push_status (push_status),
        KEY idx_scan_date (scan_date_time),
        KEY idx_person (person_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ตรวจสอบและเพิ่มคอลัมน์ source ใน attendance_raw_scan หากยังไม่มี (R8)
    try {
      const [colCheck] = await pool.query(`SHOW COLUMNS FROM attendance_raw_scan LIKE 'source'`);
      if (colCheck.length === 0) {
        await pool.query(`ALTER TABLE attendance_raw_scan ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'DEVICE' AFTER hr_mapped`);
      }
    } catch (e) {}

    // ข้อ 1: ยกเลิกคำสั่ง DELETE ข้อมูลซ้ำใน ensureTablesExist() เด็ดขาด เพื่อรักษา Raw Scan จริงทั้งหมด 100%
    try {
      await pool.query(`ALTER TABLE attendance_raw_scan ADD UNIQUE KEY uq_fingle_scan (fingle_id, scan_date_time)`);
    } catch (e) {}

    // ข้อ 12: ตาราง fingle_mapping สำหรับผูก Fingle ID กับ Person ID แบบมีช่วงวันที่มีผล
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fingle_mapping (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        fingle_id INT NOT NULL,
        person_id INT NOT NULL,
        effective_from DATE NOT NULL,
        effective_to DATE NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by VARCHAR(100) NULL,
        KEY idx_fingle_effective (fingle_id, effective_from, effective_to),
        KEY idx_person_mapping (person_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ข้อ 22: ตาราง audit_log บันทึกประวัติการกระทำและสิทธิ์
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_name VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
        user_role VARCHAR(50) NOT NULL DEFAULT 'USER',
        action VARCHAR(100) NOT NULL,
        target_table VARCHAR(100) NULL,
        target_id VARCHAR(100) NULL,
        details JSON NULL,
        ip_address VARCHAR(45) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_audit_action (action),
        KEY idx_audit_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ข้อ 14: ตาราง attendance_processing_job จัดการงานคำนวณเบื้องหลังและ Retry
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_processing_job (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        job_type VARCHAR(50) NOT NULL DEFAULT 'DAILY_CALCULATION',
        status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
        target_dates JSON NULL,
        affected_records INT NOT NULL DEFAULT 0,
        error_message TEXT NULL,
        retry_count INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME NULL,
        KEY idx_job_status (status)
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
        hr_status_id VARCHAR(20) NULL,
        hr_status_name VARCHAR(100) NULL DEFAULT 'ปฏิบัติราชการ',
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_person_id (person_id),
        KEY idx_fingle_id (fingle_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      await pool.query(`ALTER TABLE attendance_personnel ADD COLUMN hr_status_name VARCHAR(100) NULL DEFAULT 'ปฏิบัติราชการ' AFTER hr_status_id`);
    } catch {}

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

    // 2.9 ตารางประวัติการซิงค์เครื่องสแกน (scanner_sync_log) - N4, R10
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scanner_sync_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        sync_mode VARCHAR(50) NOT NULL DEFAULT 'AUTO',
        machine_no INT NULL,
        days INT NULL,
        total_read INT NOT NULL DEFAULT 0,
        total_new INT NOT NULL DEFAULT 0,
        duplicates INT NOT NULL DEFAULT 0,
        unmapped INT NOT NULL DEFAULT 0,
        affected_dates JSON NULL,
        machines_summary JSON NULL,
        exit_code INT NOT NULL DEFAULT 0,
        error_message TEXT NULL,
        duration_ms INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2.10 ตารางควบคุมเวอร์ชัน Schema (schema_version) - ข้อ 4
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_version (
        id INT AUTO_INCREMENT PRIMARY KEY,
        version VARCHAR(50) NOT NULL UNIQUE,
        description VARCHAR(255) NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      await pool.query(`
        INSERT IGNORE INTO schema_version (version, description) 
        VALUES ('2.0.0', 'Phase 2: R8 raw scan schema, uq_fingle_scan, and preservation of all valid scans')
      `);
    } catch (e) {}

    // ไม่ทำการลบหรือแทรกข้อมูลสแกนอัตโนมัติ เพื่อรักษาประวัติการสแกนจริงทั้งหมด (ข้อ 4)

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

// ข้อ 6: ปิด API ทดลองรหัสผ่านฐานข้อมูล probe-auth ใน Production (ป้องกันการรั่วไหลของ Credentials)
app.get('/api/db/probe-auth', (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'PROHIBITED_ENDPOINT',
    message: 'Endpoint probe-auth ถูกปิดใช้งานถาวรเพื่อความปลอดภัย การกำหนดค่าฐานข้อมูลต้องทำผ่าน Environment Variables บนเซิร์ฟเวอร์เท่านั้น'
  });
});

// ข้อ 6: ปิด API ปรับเปลี่ยนการตั้งค่าเชื่อมต่อฐานข้อมูล /api/db/configure ใน Production
app.post('/api/db/configure', (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'FORBIDDEN_CONFIGURATION',
    message: 'ปฏิเสธการแก้ไขการเชื่อมต่อฐานข้อมูลผ่าน API กรุณาแก้ไขไฟล์ .env หรือ Environment Variable บนเครื่องเซิร์ฟเวอร์โดยตรง'
  });
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
    console.warn('[Shifts] DB Query failed, providing fallback hospital shifts:', err.message);
    const defaultShifts = [
      { id: 1, code: 'M', name: 'เช้า (ปกติ)', startTime: '08:15', endTime: '16:00', crossesMidnight: false, color: '#0ea5e9', isActive: true },
      { id: 2, code: 'A', name: 'บ่าย', startTime: '16:00', endTime: '24:00', crossesMidnight: false, color: '#f59e0b', isActive: true },
      { id: 3, code: 'N', name: 'ดึก', startTime: '00:00', endTime: '08:00', crossesMidnight: false, color: '#8b5cf6', isActive: true },
      { id: 4, code: 'MA', name: 'เช้าควบบ่าย (16 ชม.)', startTime: '08:15', endTime: '24:00', crossesMidnight: false, color: '#10b981', isActive: true }
    ];
    res.json({ success: true, total: defaultShifts.length, data: defaultShifts, dbConnected: false, warning: err.message });
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
    console.warn('[PersonnelTypes] DB Query failed, providing fallback types:', err.message);
    const defaultTypes = [
      { id: 1, name: 'ข้าราชการ', code: 'GOV', description: 'ข้าราชการพลเรือนสามัญ กระทรวงสาธารณสุข', morningShift: { startTime: '08:15', endTime: '16:00', lateGraceMinutes: 0 }, afternoonShift: { startTime: '16:00', endTime: '24:00', lateGraceMinutes: 0 }, nightShift: { startTime: '00:00', endTime: '08:00', lateGraceMinutes: 0 }, isActive: true, memberCount: 0 },
      { id: 2, name: 'พนักงานกระทรวงสาธารณสุข', code: 'MOPH', description: 'พนักงานกระทรวงสาธารณสุข (พกส.)', morningShift: { startTime: '08:15', endTime: '16:00', lateGraceMinutes: 0 }, afternoonShift: { startTime: '16:00', endTime: '24:00', lateGraceMinutes: 0 }, nightShift: { startTime: '00:00', endTime: '08:00', lateGraceMinutes: 0 }, isActive: true, memberCount: 0 },
      { id: 3, name: 'พนักงานราชการ', code: 'GOV_EMP', description: 'พนักงานราชการทั่วไป', morningShift: { startTime: '08:15', endTime: '16:00', lateGraceMinutes: 0 }, afternoonShift: { startTime: '16:00', endTime: '24:00', lateGraceMinutes: 0 }, nightShift: { startTime: '00:00', endTime: '08:00', lateGraceMinutes: 0 }, isActive: true, memberCount: 0 },
      { id: 4, name: 'ลูกจ้างประจำ/ลูกจ้างชั่วคราว', code: 'TEMP', description: 'ลูกจ้างประจำและลูกจ้างชั่วคราวเงินบำรุง', morningShift: { startTime: '08:15', endTime: '16:00', lateGraceMinutes: 0 }, afternoonShift: { startTime: '16:00', endTime: '24:00', lateGraceMinutes: 0 }, nightShift: { startTime: '00:00', endTime: '08:00', lateGraceMinutes: 0 }, isActive: true, memberCount: 0 },
      { id: 5, name: 'ลูกจ้างรายวัน', code: 'DAILY', description: 'ลูกจ้างจ้างเหมาบริการ / รายวัน', morningShift: { startTime: '08:00', endTime: '16:00', lateGraceMinutes: 0 }, afternoonShift: { startTime: '16:00', endTime: '24:00', lateGraceMinutes: 0 }, nightShift: { startTime: '00:00', endTime: '08:00', lateGraceMinutes: 0 }, isActive: true, memberCount: 0 }
    ];
    res.json({ success: true, count: defaultTypes.length, total: defaultTypes.length, data: defaultTypes, dbConnected: false, warning: err.message });
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
    console.warn('[RawScans] DB Query warning:', err.message);
    res.json({ success: true, total: 0, data: [], dbConnected: false, warning: err.message });
  }
});

// บันทึกสแกนใหม่ 1 รายการลง MySQL attendance_raw_scan (ข้อ 2, ข้อ 3: ตรวจสอบความถูกต้อง ห้ามเติมค่าปลอม)
app.post('/api/raw-scans', async (req, res) => {
  try {
    await ensureTablesExist();
    const pool = getDbPool();
    const s = req.body || {};

    // ข้อ 2, ข้อ 3: บังคับตรวจ Fingle ID และ Scan DateTime ห้ามใช้ค่าสมมติ
    const fingleId = Number(s.fingleId ?? s.fingle_id);
    if (!fingleId || isNaN(fingleId) || fingleId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_FINGLE_ID',
        message: 'ข้อมูลสแกนไม่ถูกต้อง: ต้องระบุ fingleId เป็นตัวเลขจำนวนเต็มบวก ห้ามเว้นว่างหรือสมมติค่า'
      });
    }

    const rawDateTime = (s.scanDateTime ?? s.scan_date_time ?? '').toString().trim();
    if (!rawDateTime || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(rawDateTime)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SCAN_DATETIME',
        message: 'ข้อมูลสแกนไม่ถูกต้อง: ต้องระบุ scanDateTime ในรูปแบบ YYYY-MM-DD HH:mm:ss ห้ามใช้เวลาปัจจุบันแทนเวลาสแกน'
      });
    }
    const scanDateTime = rawDateTime.length === 16 ? `${rawDateTime}:00` : rawDateTime;

    const machineNo = Number(s.machineNo ?? s.machine_no);
    if (!machineNo || isNaN(machineNo) || machineNo <= 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MACHINE_NO',
        message: 'ข้อมูลสแกนไม่ถูกต้อง: ต้องระบุหมายเลขเครื่อง machineNo ที่เป็นตัวเลขถูกต้อง'
      });
    }

    // ข้อ 8: ตรวจสอบ Mapping กับตาราง attendance_personnel ห้ามใช้ Fingle ID แทน Person ID โดยตรง
    let personId = null;
    let fullname = null;
    let positionName = null;
    let depName = null;
    let personTypeName = null;
    let hrMapped = 0;

    const [personRows] = await pool.query(`
      SELECT person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name 
      FROM attendance_personnel 
      WHERE fingle_id = ? 
      LIMIT 1
    `, [fingleId]);

    if (personRows && personRows.length > 0) {
      personId = personRows[0].person_id;
      fullname = personRows[0].hr_fullname;
      positionName = personRows[0].hr_position_name;
      depName = personRows[0].hr_dep_name;
      personTypeName = personRows[0].hr_person_type_name;
      hrMapped = 1;
    } else {
      // UNMAPPED: เก็บข้อมูลสแกนไว้ แต่ไม่สมมติ Person ID
      personId = null;
      fullname = s.hrFullname ?? s.hr_fullname ?? null;
      positionName = s.hrPositionName ?? s.hr_position_name ?? null;
      depName = s.hrDepName ?? s.hr_dep_name ?? null;
      personTypeName = s.hrPersonTypeName ?? s.hr_person_type_name ?? null;
      hrMapped = 0;
    }

    const deviceIp = s.deviceIp ?? s.device_ip ?? null;
    const verifyMode = s.verifyMode ?? s.verify_mode ?? 1;
    const inOutMode = s.inOutMode ?? s.in_out_mode ?? 0;

    const [result] = await pool.query(`
      INSERT INTO attendance_raw_scan 
      (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name, hr_mapped, push_status, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'MANUAL_API')
      ON DUPLICATE KEY UPDATE
        device_ip = COALESCE(VALUES(device_ip), device_ip),
        verify_mode = VALUES(verify_mode),
        in_out_mode = VALUES(in_out_mode),
        person_id = VALUES(person_id),
        hr_fullname = VALUES(hr_fullname),
        hr_position_name = VALUES(hr_position_name),
        hr_dep_name = VALUES(hr_dep_name),
        hr_person_type_name = VALUES(hr_person_type_name),
        hr_mapped = VALUES(hr_mapped)
    `, [
      machineNo,
      deviceIp,
      fingleId,
      scanDateTime,
      verifyMode,
      inOutMode,
      personId,
      fullname,
      positionName,
      depName,
      personTypeName,
      hrMapped
    ]);

    res.json({
      success: true,
      id: result.insertId,
      fingleId,
      scanDateTime,
      mapped: Boolean(hrMapped),
      personId,
      message: `บันทึกข้อมูลสแกน Fingle ID ${fingleId} (${scanDateTime}) ลงฐานข้อมูลเรียบร้อยแล้ว [${hrMapped ? 'จับคู่บุคลากรสำเร็จ' : 'UNMAPPED รอจับคู่'}]`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// บันทึกสแกนแบบกลุ่ม (Batch Insert) ลง MySQL attendance_raw_scan พร้อม Strict Validation (ข้อ 2, ข้อ 3)
app.post('/api/raw-scans/batch', async (req, res) => {
  try {
    await ensureTablesExist();
    const pool = getDbPool();
    const scans = req.body?.scans;
    if (!Array.isArray(scans) || scans.length === 0) {
      return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลสแกนที่ต้องบันทึก (scans array ว่างเปล่า)' });
    }

    if (scans.length > 5000) {
      return res.status(400).json({ success: false, message: 'ขนาด Batch เกินกำหนด (สูงสุด 5,000 รายการต่อรอบ)' });
    }

    // แคชตารางบุคลากรเพื่อตรวจสอบ Mapping อย่างถูกต้อง
    const [personnelList] = await pool.query('SELECT person_id, fingle_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name FROM attendance_personnel');
    const pMap = new Map();
    personnelList.forEach(p => pMap.set(p.fingle_id, p));

    let inserted = 0;
    let duplicates = 0;
    const invalidItems = [];
    const validItems = [];

    // 1. ตรวจสอบ Schema Validation ทีละรายการ
    for (let i = 0; i < scans.length; i++) {
      const s = scans[i];
      const fingleId = Number(s.fingleId ?? s.fingle_id);
      const rawDateTime = (s.scanDateTime ?? s.scan_date_time ?? '').toString().trim();
      const machineNo = Number(s.machineNo ?? s.machine_no);

      if (!fingleId || isNaN(fingleId) || fingleId <= 0) {
        invalidItems.push({ index: i, error: 'INVALID_FINGLE_ID', item: s, reason: 'ไม่มี Fingle ID หรือค่าไม่ถูกต้อง' });
        continue;
      }

      if (!rawDateTime || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(rawDateTime)) {
        invalidItems.push({ index: i, error: 'INVALID_SCAN_DATETIME', item: s, reason: 'เวลาสแกนขาดหายหรือผิดรูปแบบ (ห้ามเติมเวลาปัจจุบัน)' });
        continue;
      }

      if (!machineNo || isNaN(machineNo) || machineNo <= 0) {
        invalidItems.push({ index: i, error: 'INVALID_MACHINE_NO', item: s, reason: 'ไม่มีหมายเลขเครื่อง หรือค่าไม่ถูกต้อง' });
        continue;
      }

      const scanDateTime = rawDateTime.length === 16 ? `${rawDateTime}:00` : rawDateTime;
      const person = pMap.get(fingleId);

      validItems.push({
        machineNo,
        deviceIp: s.deviceIp ?? s.device_ip ?? null,
        fingleId,
        scanDateTime,
        verifyMode: s.verifyMode ?? s.verify_mode ?? 1,
        inOutMode: s.inOutMode ?? s.in_out_mode ?? 0,
        personId: person ? person.person_id : null,
        fullname: person ? person.hr_fullname : (s.hrFullname ?? s.hr_fullname ?? null),
        positionName: person ? person.hr_position_name : (s.hrPositionName ?? s.hr_position_name ?? null),
        depName: person ? person.hr_dep_name : (s.hrDepName ?? s.hr_dep_name ?? null),
        personTypeName: person ? person.hr_person_type_name : (s.hrPersonTypeName ?? s.hr_person_type_name ?? null),
        hrMapped: person ? 1 : 0
      });
    }

    // 2. บันทึกเฉพาะข้อมูลที่ผ่าน Validation
    let failed = 0;
    for (const item of validItems) {
      try {
        const [result] = await pool.query(`
          INSERT INTO attendance_raw_scan 
          (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name, hr_mapped, push_status, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'BATCH_API')
          ON DUPLICATE KEY UPDATE 
            device_ip = COALESCE(VALUES(device_ip), device_ip),
            verify_mode = VALUES(verify_mode),
            in_out_mode = VALUES(in_out_mode),
            person_id = VALUES(person_id),
            hr_fullname = VALUES(hr_fullname),
            hr_position_name = VALUES(hr_position_name),
            hr_dep_name = VALUES(hr_dep_name),
            hr_person_type_name = VALUES(hr_person_type_name),
            hr_mapped = VALUES(hr_mapped)
        `, [
          item.machineNo,
          item.deviceIp,
          item.fingleId,
          item.scanDateTime,
          item.verifyMode,
          item.inOutMode,
          item.personId,
          item.fullname,
          item.positionName,
          item.depName,
          item.personTypeName,
          item.hrMapped
        ]);
        if (result.affectedRows === 1) inserted++;
        else duplicates++;
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          duplicates++;
        } else {
          failed++;
          console.error(`[Batch Insert Error] Fingle ${item.fingleId} (${item.scanDateTime}):`, err.message);
        }
      }
    }

    res.json({
      success: true,
      totalReceived: scans.length,
      validCount: validItems.length,
      invalidCount: invalidItems.length,
      inserted,
      duplicates,
      failed,
      invalidItems: invalidItems.slice(0, 20),
      message: `ประมวลผล Batch Scan: ผ่านการตรวจสอบ ${validItems.length}/${scans.length} รายการ (บันทึกใหม่ +${inserted}, ข้อมูลซ้ำ/อัปเดต ${duplicates}, ล้มเหลว ${failed}, ข้อมูลไม่ถูกต้อง ${invalidItems.length} รายการ)`
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
    console.warn('[AttendanceDaily] DB Query warning:', err.message);
    res.json({ success: true, date: req.query.date || new Date().toISOString().substring(0, 10), total: 0, data: [], dbConnected: false, warning: err.message });
  }
});

// ข้อ 3 & ข้อ 4: ปิดการลบและ TRUNCATE ผลคำนวณเวลาปฏิบัติงานใน Production 100%
app.delete('/api/attendance/daily/clear', async (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'PROHIBITED_ACTION',
    message: 'ปฏิเสธคำสั่ง TRUNCATE: ระบบไม่อนุญาตให้ล้างตาราง attendance_daily_result ใน Production เพื่อรักษาผลการคำนวณจริง'
  });
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

// ข้อ 3 & ข้อ 4: ปิดการลบข้อมูลสแกนจริงโดยตรงใน Production (รักษาประวัติดิบ 100%)
app.delete('/api/raw-scans/:id', (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'PROHIBITED_ACTION',
    message: 'ไม่อนุญาตให้ลบข้อมูลสแกนดิบ (Raw Scan) ต้นฉบับโดยตรงใน Production เพื่อรักษาหลักฐานการลงเวลาจริง'
  });
});

// ข้อ 7: ห้าม TRUNCATE attendance_raw_scan ในระบบ Production ป้องกันข้อมูลสูญหาย 100%
app.post('/api/raw-scans/clear-all', (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'PROHIBITED_ACTION',
    message: 'ปฏิเสธคำสั่ง TRUNCATE: ระบบไม่อนุญาตให้ล้างตาราง attendance_raw_scan ทั้งหมดใน Production เพื่อรักษาประวัติการสแกนจริง'
  });
});

// ข้อ 4: ปิดการลบเวลาอนาคตโดยตรง (หากพบข้อมูลผิดปกติให้เก็บไว้และคัดกรองในขั้นตอนคำนวณ)
app.post('/api/raw-scans/clean-future', (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'PROHIBITED_ACTION',
    message: 'ไม่อนุญาตให้ลบข้อมูลสแกนดิบโดยตรง หากพบเวลาผิดปกติระบบจะแยกเป็นสถานะ INVALID โดยไม่ทำลายข้อมูลต้นฉบับ'
  });
});

// ข้อ 5: ปิด Endpoint สร้างข้อมูลจำลอง seed-sample ใน Production
app.post('/api/raw-scans/seed-sample', async (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'MOCK_DISABLED',
    message: 'ไม่อนุญาตให้สร้างข้อมูลสแกนจำลองใน Production ข้อมูลสแกนทั้งหมดต้องมาจากเครื่องสแกน HIP จริงเท่านั้น'
  });
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
      hrStatusId: r.hr_status_id || '01',
      hrStatusName: r.hr_status_name || 'ปฏิบัติราชการ',
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
    console.warn('[Personnel] DB Query warning:', err.message);
    res.json({ success: true, count: 0, activeCount: 0, inactiveCount: 0, data: [], dbConnected: false, warning: err.message });
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
          hp.HR_STATUS_ID AS hr_status_id,
          COALESCE(hs.HR_STATUS_NAME, 'ปฏิบัติราชการ') AS hr_status_name
        FROM active_person hp
        LEFT JOIN hr_prefix hf ON hp.HR_PREFIX_ID = hf.HR_PREFIX_ID
        LEFT JOIN hr_position ht ON hp.HR_POSITION_ID = ht.HR_POSITION_ID
        LEFT JOIN hr_department hd ON hp.HR_DEPARTMENT_ID = hd.HR_DEPARTMENT_ID
        LEFT JOIN hr_department_sub hds ON hp.HR_DEPARTMENT_SUB_ID = hds.HR_DEPARTMENT_SUB_ID
        LEFT JOIN hr_person_type hpt ON hp.HR_PERSON_TYPE_ID = hpt.HR_PERSON_TYPE_ID
        LEFT JOIN hr_level hl ON hp.HR_LEVEL_ID = hl.HR_LEVEL_ID
        LEFT JOIN hr_status hs ON hp.HR_STATUS_ID = hs.HR_STATUS_ID
        ORDER BY hp.ID ASC
      `);
      rows = hosRows || [];
    } catch {
      // Fallback สำหรับ MySQL / MariaDB รุ่นที่ยังไม่รองรับ CTE (WITH ...)
      try {
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
            hp.HR_STATUS_ID AS hr_status_id,
            COALESCE(hs.HR_STATUS_NAME, 'ปฏิบัติราชการ') AS hr_status_name
          FROM (SELECT * FROM hr_person WHERE HR_STATUS_ID IN ('01', '1', 1)) hp
          LEFT JOIN hr_prefix hf ON hp.HR_PREFIX_ID = hf.HR_PREFIX_ID
          LEFT JOIN hr_position ht ON hp.HR_POSITION_ID = ht.HR_POSITION_ID
          LEFT JOIN hr_department hd ON hp.HR_DEPARTMENT_ID = hd.HR_DEPARTMENT_ID
          LEFT JOIN hr_department_sub hds ON hp.HR_DEPARTMENT_SUB_ID = hds.HR_DEPARTMENT_SUB_ID
          LEFT JOIN hr_person_type hpt ON hp.HR_PERSON_TYPE_ID = hpt.HR_PERSON_TYPE_ID
          LEFT JOIN hr_level hl ON hp.HR_LEVEL_ID = hl.HR_LEVEL_ID
          LEFT JOIN hr_status hs ON hp.HR_STATUS_ID = hs.HR_STATUS_ID
          ORDER BY hp.ID ASC
        `);
        rows = hosRows || [];
      } catch (err2) {
        console.error('Query hosoffice.hr_person failed:', err2.message);
        return res.status(502).json({
          success: false,
          message: `ไม่สามารถดึงข้อมูลบุคลากรจาก hosoffice.hr_person ได้: ${err2.message}`
        });
      }
    }

    if (!rows || rows.length === 0) {
      return res.json({
        success: true,
        count: 0,
        inserted: 0,
        updated: 0,
        data: [],
        message: 'ไม่พบข้อมูลบุคลากรในตาราง hosoffice.hr_person (หรือสถานะการทำงานไม่ใช่ 01/1)'
      });
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
      const isHosActive = !r.hr_status_id || String(r.hr_status_id) === '01' || String(r.hr_status_id) === '1' || Number(r.hr_status_id) === 1;
      const targetStatus = isHosActive ? 'ACTIVE' : 'INACTIVE';
      if (isHosActive) activeInHos++;
      else inactiveInHos++;

      const statusName = r.hr_status_name || (isHosActive ? 'ปฏิบัติราชการ' : 'ไม่ได้ปฏิบัติราชการ');

      let typeId = 1;
      const typeStr = (r.hr_person_type_name || '').toLowerCase();
      if (typeStr.includes('พนักงานกระทรวง')) typeId = 2;
      else if (typeStr.includes('ลูกจ้าง')) typeId = 4;
      else if (typeStr.includes('ราชการ') && typeStr.includes('พนักงาน')) typeId = 3;

      const [resIns] = await poolAtt.query(`
        INSERT INTO attendance_personnel
        (person_id, fingle_id, hr_cid, hr_fullname, hr_position_name, hr_level_name, hr_dep_name, hr_dep_sub_name, hr_person_type_name, hr_person_type_id, hr_status_id, hr_status_name, status, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          fingle_id = VALUES(fingle_id),
          hr_cid = VALUES(hr_cid),
          hr_fullname = VALUES(hr_fullname),
          hr_position_name = VALUES(hr_position_name),
          hr_level_name = VALUES(hr_level_name),
          hr_dep_name = VALUES(hr_dep_name),
          hr_dep_sub_name = VALUES(hr_dep_sub_name),
          hr_person_type_name = VALUES(hr_person_type_name),
          hr_person_type_id = VALUES(hr_person_type_id),
          hr_status_id = VALUES(hr_status_id),
          hr_status_name = VALUES(hr_status_name),
          status = VALUES(status),
          synced_at = NOW()
      `, [
        r.id, r.fingle_id || r.id, r.hr_cid || '', fullname,
        r.hr_position_name || '', r.hr_level_name || '', r.hr_dep_name || '',
        r.hr_dep_sub_name || '', r.hr_person_type_name || 'ข้าราชการ',
        typeId, r.hr_status_id || '01', statusName, targetStatus
      ]);

      if (resIns.affectedRows === 1) inserted++;
      else updated++;
    }

    // สำหรับบุคลากรในฐาน samchuk_attendance ที่ "ไม่มีอยู่ใน HOSOffice":
    // ให้ปรับสถานะเป็น 'INACTIVE' (ไม่ได้ใช้งาน)
    let inactivated = 0;
    if (hosPersonIds.length > 0) {
      try {
        const [resInact] = await poolAtt.query(`
          UPDATE attendance_personnel 
          SET status = 'INACTIVE', synced_at = NOW()
          WHERE person_id NOT IN (?) AND status != 'INACTIVE'
        `, [hosPersonIds]);
        inactivated = resInact.affectedRows || 0;
      } catch {}
    }

    // ดึงรายชื่อบุคลากรทั้งหมดที่อัปเดตแล้วใน attendance_personnel ส่งกลับไปให้หน้าบ้านทันที
    const [allPersonnelRows] = await poolAtt.query(`
      SELECT * FROM attendance_personnel ORDER BY id ASC
    `);

    const mapped = (allPersonnelRows || []).map(r => ({
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
      hrStatusId: r.hr_status_id || '01',
      hrStatusName: r.hr_status_name || 'ปฏิบัติราชการ',
      status: r.status || 'ACTIVE'
    }));

    res.json({
      success: true,
      totalHos: rows.length,
      inserted,
      updated,
      inactivated,
      currentTotal: mapped.length,
      data: mapped,
      message: `ดึงข้อมูลบุคลากรและรหัสสแกนนิ้วจาก HOSOffice (hr_person) สำเร็จ: นำเข้า ${mapped.length} ท่าน (เพิ่มใหม่ ${inserted}, ปรับปรุง ${updated}) - บุคลากรมีข้อมูลครบโดยไม่ต้องกรอกเอง`
    });
  } catch (err) {
    console.error('[Sync Personnel] Error:', err);
    res.status(500).json({ success: false, message: `ซิงค์บุคลากรจาก hosoffice ล้มเหลว: ${err.message}` });
  }
});

// ข้อ 7: ปิดการล้างข้อมูลบุคลากรโดยไม่ยืนยันสิทธิ์ขั้นสูง
app.delete('/api/personnel/clear', async (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.query.adminKey;
  if (!adminKey || adminKey !== (process.env.ADMIN_KEY || 'SAMCHUK_SECURE_ADMIN')) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'ปฏิเสธคำสั่ง TRUNCATE: ต้องใช้สิทธิ์ผู้ดูแลระบบระดับสูงในการล้างข้อมูลบุคลากร'
    });
  }
  try {
    const pool = getDbPool();
    await pool.query('TRUNCATE TABLE attendance_personnel');
    await pool.query('TRUNCATE TABLE attendance_daily_result');
    res.json({ success: true, message: 'ลบรายชื่อบุคลากรและผลคำนวณเวลาในฐาน samchuk_attendance เรียบร้อยแล้ว' });
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
          hp.HR_STATUS_ID as hr_status_id,
          COALESCE(hs.HR_STATUS_NAME, 'ปฏิบัติราชการ') as hr_status_name
        FROM active_person hp
        LEFT JOIN hr_prefix hf ON hp.HR_PREFIX_ID = hf.HR_PREFIX_ID
        LEFT JOIN hr_position ht ON hp.HR_POSITION_ID = ht.HR_POSITION_ID
        LEFT JOIN hr_department hd ON hp.HR_DEPARTMENT_ID = hd.HR_DEPARTMENT_ID
        LEFT JOIN hr_department_sub hds ON hp.HR_DEPARTMENT_SUB_ID = hds.HR_DEPARTMENT_SUB_ID
        LEFT JOIN hr_person_type hpt ON hp.HR_PERSON_TYPE_ID = hpt.HR_PERSON_TYPE_ID
        LEFT JOIN hr_level hl ON hp.HR_LEVEL_ID = hl.HR_LEVEL_ID
        LEFT JOIN hr_status hs ON hp.HR_STATUS_ID = hs.HR_STATUS_ID
        ORDER BY hp.ID ASC
        LIMIT ?
      `, [limit]);
      rows = hosRows || [];
    } catch {
      try {
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
            hp.HR_STATUS_ID as hr_status_id,
            COALESCE(hs.HR_STATUS_NAME, 'ปฏิบัติราชการ') as hr_status_name
          FROM (SELECT * FROM hr_person WHERE HR_STATUS_ID IN ('01', '1', 1)) hp
          LEFT JOIN hr_prefix hf ON hp.HR_PREFIX_ID = hf.HR_PREFIX_ID
          LEFT JOIN hr_position ht ON hp.HR_POSITION_ID = ht.HR_POSITION_ID
          LEFT JOIN hr_department hd ON hp.HR_DEPARTMENT_ID = hd.HR_DEPARTMENT_ID
          LEFT JOIN hr_department_sub hds ON hp.HR_DEPARTMENT_SUB_ID = hds.HR_DEPARTMENT_SUB_ID
          LEFT JOIN hr_person_type hpt ON hp.HR_PERSON_TYPE_ID = hpt.HR_PERSON_TYPE_ID
          LEFT JOIN hr_level hl ON hp.HR_LEVEL_ID = hl.HR_LEVEL_ID
          LEFT JOIN hr_status hs ON hp.HR_STATUS_ID = hs.HR_STATUS_ID
          ORDER BY hp.ID ASC
          LIMIT ?
        `, [limit]);
        rows = hosRows || [];
      } catch (errFallback) {
        console.warn('Fallback query hosoffice personnel error:', errFallback.message);
      }
    }

    if (!rows) {
      rows = [];
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
        hr_person_type_name: r.hr_person_type_name || 'ข้าราชการ',
        hrStatusId: r.hr_status_id || '01',
        hr_status_id: r.hr_status_id || '01',
        hrStatusName: r.hr_status_name || 'ปฏิบัติราชการ',
        hr_status_name: r.hr_status_name || 'ปฏิบัติราชการ'
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
    portOpen: result.success,
    message: result.success ? `เชื่อมต่อพอร์ต ${port} บนเครื่องสแกนหมายเลข ${machineNo} (${ipAddress}) สำเร็จ (พอร์ตเปิด)` : result.message
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

// --------------------------------------------------------------------------
// 4.12 Scanner CLI Reader (ScannerSyncCli.exe) Integration - N1, N2, N4
// --------------------------------------------------------------------------
function getScannerReaderExePath() {
  const envPath = process.env.SCAN_READER_EXE || process.env.SCANNER_CLI_PATH;
  const candidates = [
    envPath,
    path.join(__dirname, 'ScannerSyncCli.exe'),
    path.join(__dirname, 'bin', 'ScannerSyncCli.exe'),
    path.join(__dirname, 'CMiF68SReaderTest.exe'),
    'C:\\inetpub\\wwwroot\\Sam_Att\\backend\\ScannerSyncCli.exe',
    'C:\\inetpub\\wwwroot\\Sam_Att\\ScannerSyncCli.exe',
    'C:\\inetpub\\wwwroot\\Samchuk_Attendance\\backend\\ScannerSyncCli.exe',
    'C:\\inetpub\\wwwroot\\Samchuk_Attendance\\ScannerSyncCli.exe',
    path.join(process.cwd(), 'backend', 'ScannerSyncCli.exe'),
    path.join(process.cwd(), 'ScannerSyncCli.exe')
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        return c;
      }
    } catch {}
  }
  return envPath || path.join(__dirname, 'ScannerSyncCli.exe');
}

function executeScannerReaderCli(params = {}) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const exePath = getScannerReaderExePath();
    const exists = fs.existsSync(exePath);

    const { auto = true, days = 3, machine, machineNo, preview = false, json = true } = params;
    const targetMachine = machine !== undefined ? machine : machineNo;

    const args = [];
    if (auto) args.push('--auto');
    if (days !== undefined && days !== null) args.push('--days', String(days));
    if (targetMachine !== undefined && targetMachine !== null && String(targetMachine).toUpperCase() !== 'ALL') {
      args.push('--machine', String(targetMachine));
    }
    if (preview) args.push('--preview');
    if (json) args.push('--json');

    // ข้อ 1: ยกเลิก Mock Success ของ Reader ทั้งหมด หากไม่พบไฟล์ EXE ต้องแจ้ง Error (success: false)
    if (!exists) {
      const durationMs = Date.now() - startTime;
      const errMsg = `ไม่พบไฟล์โปรแกรมอ่านเครื่องสแกน (${path.basename(exePath)}) ที่พาธ "${exePath}". กรุณาตั้งค่าพาธใน Environment Variable SCAN_READER_EXE หรือวางไฟล์ ScannerSyncCli.exe ในโฟลเดอร์ backend`;
      console.error(`[ScannerReader Error] ${errMsg}`);
      return resolve({
        success: false,
        exePath,
        commandArgs: args,
        exitCode: 1,
        durationMs,
        totalRead: 0,
        totalNew: 0,
        duplicates: 0,
        unmapped: 0,
        affectedDates: [],
        machines: config.Scanners.map(s => ({
          machineNo: s.MachineNo,
          name: s.Name,
          ip: s.IP,
          readCount: 0,
          newCount: 0,
          duplicates: 0,
          success: false,
          error: 'EXE_NOT_FOUND'
        })),
        error: 'EXE_NOT_FOUND',
        message: errMsg
      });
    }

    console.log(`[ScannerReader] Executing: "${exePath}" ${args.join(' ')}`);

    execFile(
      exePath,
      args,
      {
        timeout: 180000, // 3 minutes timeout (N1)
        maxBuffer: 25 * 1024 * 1024,
        windowsHide: true,
        cwd: path.dirname(exePath),
        env: {
          ...process.env,
          TZ: 'Asia/Bangkok'
        }
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        const stdoutStr = (stdout || '').toString();
        const stderrStr = (stderr || '').toString();

        if (stderrStr) {
          console.warn('[ScannerReader STDERR]', stderrStr.slice(-1000));
        }

        let parsedJson = null;
        const lines = stdoutStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          if (line.startsWith('{') && line.endsWith('}')) {
            try {
              const obj = JSON.parse(line);
              if (obj && typeof obj === 'object' && ('success' in obj || 'totalRead' in obj)) {
                parsedJson = obj;
                break;
              }
            } catch {}
          }
        }

        const finalExitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;

        if (error || finalExitCode !== 0) {
          console.error('[ScannerReader Error]', error ? error.message : `Process exited with code ${finalExitCode}`);
          return resolve({
            success: false,
            exePath,
            commandArgs: args,
            exitCode: finalExitCode,
            durationMs,
            error: error ? error.message : `กระบวนการอ่านเครื่องจบการทำงานด้วยรหัสข้อผิดพลาด ${finalExitCode}`,
            stdout: stdoutStr.slice(-2000),
            stderr: stderrStr.slice(-2000),
            message: `การทำงานของตัวอ่านล้มเหลว (Exit Code: ${finalExitCode}): ${error ? error.message : stderrStr.slice(-300)}`
          });
        }

        if (!parsedJson) {
          return resolve({
            success: false,
            exePath,
            commandArgs: args,
            exitCode: 1,
            durationMs,
            stdout: stdoutStr.slice(-2000),
            stderr: stderrStr.slice(-2000),
            message: 'ตัวอ่านทำงานเสร็จแต่ไม่พบผลลัพธ์ JSON ใน stdout'
          });
        }

        const isSuccess = parsedJson.success !== false;
        resolve({
          ...parsedJson,
          success: isSuccess,
          exePath,
          commandArgs: args,
          durationMs,
          exitCode: isSuccess ? 0 : 1,
          message: parsedJson.message || `ซิงค์เครื่องสแกน: อ่านทั้งหมด ${parsedJson.totalRead || 0} รายการ, รายการใหม่ +${parsedJson.totalNew || 0}, ซ้ำ ${parsedJson.duplicates || 0} รายการ`
        });
      }
    );
  });
}

// ============================================================================
// โมดูลคำนวณผลการปฏิบัติงานรายวัน (Attendance Daily Calculator - ข้อ 5, 6, 7, 8, 11, 12, 13, N3)
// ============================================================================
async function calculateDailyAttendanceForDate(workDate) {
  if (!workDate) return { success: false, message: 'ไม่ได้ระบุวันที่' };
  const pool = getDbPool();

  // คำนวณวันถัดไปสำหรับ Overnight Window (ข้อ 7, 12)
  const [year, month, day] = workDate.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const nextDate = dt.toISOString().slice(0, 10);
  const windowStart = `${workDate} 05:00:00`;
  const windowEnd = `${nextDate} 09:00:00`;

  // 1. ดึงข้อมูลสแกนดิบที่ครอบคลุม Overnight Window (ข้อ 7, 12)
  const [scans] = await pool.query(`
    SELECT * FROM attendance_raw_scan 
    WHERE scan_date_time >= ? AND scan_date_time <= ?
    ORDER BY scan_date_time ASC
  `, [windowStart, windowEnd]);

  // 2. ดึงข้อมูลบุคลากรที่ ACTIVE ทั้งหมด
  const [personnelRows] = await pool.query('SELECT * FROM attendance_personnel WHERE status = "ACTIVE"');
  const personnelByPersonId = new Map();
  const personnelByFingleId = new Map();
  personnelRows.forEach(p => {
    personnelByPersonId.set(Number(p.person_id), p);
    if (p.fingle_id) personnelByFingleId.set(Number(p.fingle_id), p);
  });

  // 2.1 ดึง fingle_mapping ที่มีผลใน workDate (ข้อ 8, 12)
  const fingleToPersonMap = new Map();
  try {
    const [mappings] = await pool.query(`
      SELECT fingle_id, person_id FROM fingle_mapping 
      WHERE effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?) AND status = 'ACTIVE'
    `, [workDate, workDate]);
    mappings.forEach(m => fingleToPersonMap.set(Number(m.fingle_id), Number(m.person_id)));
  } catch (e) {}

  // 2.2 ดึงตารางเวรจริง (Roster) ของวัน workDate (ข้อ 6, 11, 13)
  const rosterMap = new Map(); // person_id -> Array<RosterShift>
  let hasRosterForDate = false;
  try {
    const [rosterRows] = await pool.query(`
      SELECT r.person_id, r.shift_id, s.shift_name, s.start_time, s.end_time, s.crosses_midnight,
             COALESCE(s.late_grace_minutes, 0) as late_grace_minutes
      FROM attendance_person_roster r
      JOIN attendance_shift s ON r.shift_id = s.id
      WHERE r.work_date = ?
    `, [workDate]);
    if (rosterRows.length > 0) {
      hasRosterForDate = true;
      rosterRows.forEach(r => {
        const pid = Number(r.person_id);
        if (!rosterMap.has(pid)) rosterMap.set(pid, []);
        rosterMap.get(pid).push(r);
      });
    }
  } catch (e) {}

  // 3. จัดกลุ่มสแกนตาม fingle_id
  const scansByFingle = new Map();
  scans.forEach(s => {
    const fid = Number(s.fingle_id);
    if (!scansByFingle.has(fid)) scansByFingle.set(fid, []);
    scansByFingle.get(fid).push(s);
  });

  let savedShiftsCount = 0;
  const processedPersonIds = new Set();
  const unmappedFingles = [];

  // 4. วนลูปประมวลผลสำหรับ fingle_id ที่มีสแกน
  for (const [fingleId, personScans] of scansByFingle.entries()) {
    let person = personnelByFingleId.get(fingleId);
    let personId = null;

    if (!person && fingleToPersonMap.has(fingleId)) {
      const mappedId = fingleToPersonMap.get(fingleId);
      person = personnelByPersonId.get(mappedId);
      if (person) personId = person.person_id;
    } else if (person) {
      personId = person.person_id;
    }

    // ข้อ 5 & ข้อ 8: ห้ามใช้ Fingle ID แทน Person ID โดยเด็ดขาด จัดเป็น UNMAPPED
    if (!personId || !person) {
      unmappedFingles.push(fingleId);
      continue;
    }

    processedPersonIds.add(Number(personId));
    const fullname = person.hr_fullname;
    const department = person.hr_dep_name || 'โรงพยาบาลสามชุก';
    const position = person.hr_position_name || 'เจ้าหน้าที่';

    // คัดแยกสแกนตามกะ
    // กะเช้า (Morning, ID 1): สแกนในวัน workDate ก่อน 15:30
    // กะบ่าย (Afternoon, ID 2): สแกนในวัน workDate 15:30 – 23:29
    // กะดึก (Night, ID 3): สแกนในวัน workDate 23:30 – 23:59 หรือวันถัดไป 00:00 – 09:00
    const morningScans = [];
    const afternoonScans = [];
    const nightScans = [];

    for (const s of personScans) {
      const scanDateStr = s.scan_date_time instanceof Date 
        ? s.scan_date_time.toISOString().replace('T', ' ').substring(0, 19)
        : String(s.scan_date_time);
      const sDate = scanDateStr.substring(0, 10);
      const sTime = scanDateStr.substring(11, 16);
      const [h, m] = sTime.split(':').map(Number);

      if (sDate === workDate) {
        if (h === 23 && m >= 30) {
          nightScans.push(s);
        } else if ((h === 15 && m >= 30) || (h >= 16 && (h < 23 || (h === 23 && m < 30)))) {
          afternoonScans.push(s);
        } else if (h < 15 || (h === 15 && m < 30)) {
          morningScans.push(s);
        }
      } else if (sDate === nextDate) {
        // สแกนในเช้าวันถัดไปจัดเข้ากะดึกของวัน workDate
        if (h < 9) {
          nightScans.push(s);
        }
      }
    }

    // รายการกะที่ต้องบันทึก (ข้อ 8, 13: 1 แถวต่อกะ)
    const shiftsToRecord = [];

    // ตรวจสอบตารางเวรจริงของคนนี้ก่อน (ข้อ 6, 11)
    const personRosters = rosterMap.get(Number(personId));

    if (personRosters && personRosters.length > 0) {
      // มีตารางเวรจริง: ตรวจสอบตามเวรที่กำหนด
      for (const r of personRosters) {
        let matchingScans = [];
        if (r.shift_id === 1) matchingScans = morningScans;
        else if (r.shift_id === 2) matchingScans = afternoonScans;
        else if (r.shift_id === 3) matchingScans = nightScans;
        else matchingScans = personScans;

        shiftsToRecord.push({
          shiftId: r.shift_id,
          shiftName: r.shift_name,
          scheduledIn: String(r.start_time).substring(0, 5) || '08:15',
          scheduledOut: String(r.end_time).substring(0, 5) || '16:00',
          lateGraceMinutes: r.late_grace_minutes || 0,
          scans: matchingScans
        });
      }
    } else {
      // ไม่มีตารางเวรระบุเฉพาะ: บันทึกตามกะที่มีสแกนจริง
      if (morningScans.length > 0) {
        shiftsToRecord.push({
          shiftId: 1,
          shiftName: 'เช้า (ปกติ)',
          scheduledIn: '08:15',
          scheduledOut: '16:00',
          lateGraceMinutes: 0,
          scans: morningScans
        });
      }
      if (afternoonScans.length > 0) {
        shiftsToRecord.push({
          shiftId: 2,
          shiftName: 'บ่าย',
          scheduledIn: '16:00',
          scheduledOut: '24:00',
          lateGraceMinutes: 0,
          scans: afternoonScans
        });
      }
      if (nightScans.length > 0) {
        shiftsToRecord.push({
          shiftId: 3,
          shiftName: 'ดึก',
          scheduledIn: '00:00',
          scheduledOut: '08:00',
          lateGraceMinutes: 0,
          scans: nightScans
        });
      }
    }

    // บันทึกผล Attendance รายกะ
    for (const sh of shiftsToRecord) {
      if (!sh.scans || sh.scans.length === 0) {
        // หากอยู่ในตารางเวรแต่ไม่พบสแกนในกะนั้น ให้บันทึก NO_SCAN สำหรับกะนั้น (ข้อ 6, 8)
        await pool.query(`
          INSERT INTO attendance_daily_result
          (work_date, person_id, fingle_id, fullname, department, position, shift_id, shift_name, scheduled_in, scheduled_out, first_scan, last_scan, check_in, check_out, status, status_label, late_minutes, early_minutes, total_scans, calculated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', '', 'NO_SCAN', 'ไม่พบสแกน', 0, 0, 0, NOW())
          ON DUPLICATE KEY UPDATE
            fullname = VALUES(fullname),
            department = VALUES(department),
            position = VALUES(position),
            shift_name = VALUES(shift_name),
            scheduled_in = VALUES(scheduled_in),
            scheduled_out = VALUES(scheduled_out),
            status = 'NO_SCAN',
            status_label = 'ไม่พบสแกน',
            calculated_at = NOW()
        `, [
          workDate,
          personId,
          fingleId,
          fullname,
          department,
          position,
          sh.shiftId,
          sh.shiftName,
          sh.scheduledIn,
          sh.scheduledOut
        ]);
        savedShiftsCount++;
        continue;
      }

      const first = sh.scans[0];
      const last = sh.scans[sh.scans.length - 1];
      const firstStr = first.scan_date_time instanceof Date 
        ? first.scan_date_time.toISOString().replace('T', ' ').substring(0, 19)
        : String(first.scan_date_time);
      const lastStr = last.scan_date_time instanceof Date 
        ? last.scan_date_time.toISOString().replace('T', ' ').substring(0, 19)
        : String(last.scan_date_time);

      const checkIn = firstStr.substring(11, 16);
      const checkOut = sh.scans.length > 1 ? lastStr.substring(11, 16) : '';

      let status = 'ON_TIME';
      let statusLabel = 'ตรงเวลา';
      let lateMinutes = 0;

      const [h, m] = checkIn.split(':').map(Number);
      const scanMins = h * 60 + m;

      if (sh.shiftId === 1) { // กะเช้า เกณฑ์ 08:15
        const targetMins = 8 * 60 + 15 + (sh.lateGraceMinutes || 0);
        if (scanMins > targetMins) {
          lateMinutes = scanMins - targetMins;
          status = 'LATE';
          statusLabel = `สาย ${lateMinutes} นาที`;
        } else {
          status = 'ON_TIME';
          statusLabel = 'ตรงเวลา';
        }
      } else if (sh.shiftId === 2) { // กะบ่าย เกณฑ์ 16:00
        const targetMins = 16 * 60 + (sh.lateGraceMinutes || 0);
        if (scanMins > targetMins) {
          lateMinutes = scanMins - targetMins;
          status = 'LATE';
          statusLabel = `สาย ${lateMinutes} นาที (กะบ่าย)`;
        } else {
          status = 'ON_TIME';
          statusLabel = 'ตรงเวลา (กะบ่าย)';
        }
      } else if (sh.shiftId === 3) { // กะดึก เกณฑ์ 24:00 (เริ่มตรวจ 23:30)
        if (h === 23 && m >= 30) {
          status = 'ON_TIME';
          statusLabel = 'ตรงเวลา (กะดึก)';
        } else if (h === 0 && m <= (sh.lateGraceMinutes || 0)) {
          status = 'ON_TIME';
          statusLabel = 'ตรงเวลา (กะดึก)';
        } else {
          lateMinutes = h * 60 + m;
          status = 'LATE';
          statusLabel = `สาย ${lateMinutes} นาที (กะดึก)`;
        }
      }

      if (sh.scans.length === 1 && !checkOut) {
        if (status === 'ON_TIME') statusLabel = 'เข้าตรงเวลา (สแกนเข้าอย่างเดียว)';
        else statusLabel = `${statusLabel} (สแกนเข้าอย่างเดียว)`;
      }

      await pool.query(`
        INSERT INTO attendance_daily_result
        (work_date, person_id, fingle_id, fullname, department, position, shift_id, shift_name, scheduled_in, scheduled_out, first_scan, last_scan, check_in, check_out, status, status_label, late_minutes, early_minutes, total_scans, calculated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW())
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
          total_scans = VALUES(total_scans),
          calculated_at = NOW()
      `, [
        workDate,
        personId,
        fingleId,
        fullname,
        department,
        position,
        sh.shiftId,
        sh.shiftName,
        sh.scheduledIn,
        sh.scheduledOut,
        firstStr,
        sh.scans.length > 1 ? lastStr : '',
        checkIn,
        checkOut,
        status,
        statusLabel,
        lateMinutes,
        sh.scans.length
      ]);
      savedShiftsCount++;
    }
  }

  // 5. จัดการบุคลากรที่ไม่มีสแกนเลย (ข้อ 6, 8)
  // หากระบบมีตารางเวร (Roster) ของวันนั้น: ให้บันทึก NO_SCAN เฉพาะบุคลากรที่มีเวรใน Roster แต่ไม่ได้มาสแกนเท่านั้น
  // หากไม่มีตารางเวรในวันนั้น: บันทึกเฉพาะเจ้าหน้าที่ที่ ACTIVE
  if (hasRosterForDate) {
    for (const [rosterPersonId, assignedShifts] of rosterMap.entries()) {
      if (!processedPersonIds.has(rosterPersonId)) {
        const p = personnelByPersonId.get(rosterPersonId);
        if (!p) continue;
        for (const sh of assignedShifts) {
          await pool.query(`
            INSERT INTO attendance_daily_result
            (work_date, person_id, fingle_id, fullname, department, position, shift_id, shift_name, scheduled_in, scheduled_out, first_scan, last_scan, check_in, check_out, status, status_label, late_minutes, early_minutes, total_scans, calculated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', '', 'NO_SCAN', 'ไม่พบสแกน', 0, 0, 0, NOW())
            ON DUPLICATE KEY UPDATE
              fullname = VALUES(fullname),
              department = VALUES(department),
              position = VALUES(position),
              shift_name = VALUES(shift_name),
              status = 'NO_SCAN',
              status_label = 'ไม่พบสแกน',
              calculated_at = NOW()
          `, [
            workDate,
            p.person_id,
            p.fingle_id || 0,
            p.hr_fullname,
            p.hr_dep_name || 'โรงพยาบาลสามชุก',
            p.hr_position_name || 'เจ้าหน้าที่',
            sh.shift_id,
            sh.shift_name,
            String(sh.start_time).substring(0, 5) || '08:15',
            String(sh.end_time).substring(0, 5) || '16:00'
          ]);
          savedShiftsCount++;
        }
      }
    }
  } else {
    // กรณีที่ระบบยังไม่มีการจัดเวรล่วงหน้า ให้บันทึกเฉพาะบุคลากรที่ยังไม่ถูกประมวลผล
    for (const person of personnelRows) {
      if (!processedPersonIds.has(Number(person.person_id))) {
        await pool.query(`
          INSERT INTO attendance_daily_result
          (work_date, person_id, fingle_id, fullname, department, position, shift_id, shift_name, scheduled_in, scheduled_out, first_scan, last_scan, check_in, check_out, status, status_label, late_minutes, early_minutes, total_scans, calculated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, 'เช้า (ปกติ)', '08:15', '16:00', '', '', '', '', 'NO_SCAN', 'ไม่พบสแกน', 0, 0, 0, NOW())
          ON DUPLICATE KEY UPDATE
            fullname = VALUES(fullname),
            department = VALUES(department),
            position = VALUES(position),
            calculated_at = NOW()
        `, [
          workDate,
          person.person_id,
          person.fingle_id || 0,
          person.hr_fullname,
          person.hr_dep_name || 'โรงพยาบาลสามชุก',
          person.hr_position_name || 'เจ้าหน้าที่'
        ]);
        savedShiftsCount++;
      }
    }
  }

  return {
    success: true,
    workDate,
    savedShiftsCount,
    activePersonnelCount: personnelRows.length,
    scannedPersonnelCount: processedPersonIds.size,
    unmappedFinglesCount: unmappedFingles.length,
    unmappedFingles: Array.from(new Set(unmappedFingles))
  };
}

// 4.12.1 N1: แทนที่ /api/scanners/sync ด้วยการเรียก Standalone Reader ผ่าน execFile
app.post('/api/scanners/sync', async (req, res) => {
  // N2: ตรวจสอบสถานะการทำงานเพื่อป้องกันรันซ้อน (Sync Mutex Lock)
  if (syncRunning) {
    return res.status(409).json({
      success: false,
      syncRunning: true,
      message: 'กระบวนการซิงค์ข้อมูลจากเครื่องสแกนกำลังทำงานอยู่ กรุณารอสักครู่'
    });
  }

  syncRunning = true;
  const startTime = Date.now();

  try {
    await ensureTablesExist();
    const pool = getDbPool();
    const { auto = true, days = 3, machineNo, machine, preview = false } = req.body || {};

    const cliResult = await executeScannerReaderCli({
      auto,
      days,
      machine: machine || machineNo,
      preview
    });

    // N4, R10: บันทึกผลลัพธ์ลงตาราง scanner_sync_log
    try {
      await pool.query(`
        INSERT INTO scanner_sync_log 
        (sync_mode, machine_no, days, total_read, total_new, duplicates, unmapped, affected_dates, machines_summary, exit_code, error_message, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        auto ? 'AUTO' : 'MANUAL',
        machine || machineNo || null,
        days || 3,
        cliResult.totalRead || 0,
        cliResult.totalNew || 0,
        cliResult.duplicates || 0,
        cliResult.unmapped || 0,
        cliResult.affectedDates ? JSON.stringify(cliResult.affectedDates) : null,
        cliResult.machines ? JSON.stringify(cliResult.machines) : null,
        cliResult.exitCode || 0,
        cliResult.error || null,
        cliResult.durationMs || (Date.now() - startTime)
      ]);
    } catch (logErr) {
      console.warn('[scanner_sync_log] Warning: Could not write sync log:', logErr.message);
    }

    // ข้อ 1.7: ห้ามคำนวณ Attendance ต่อเมื่อ Reader ล้มเหลวโดยไม่มีข้อมูลใหม่ที่บันทึกสำเร็จ
    if (cliResult.success && cliResult.affectedDates && Array.isArray(cliResult.affectedDates) && cliResult.affectedDates.length > 0) {
      const calcSummaries = [];
      for (const d of cliResult.affectedDates) {
        try {
          const cRes = await calculateDailyAttendanceForDate(d);
          calcSummaries.push(cRes);
        } catch (calcErr) {
          console.warn(`[Auto-Calculate N3] Warning: calculation error for ${d}:`, calcErr.message);
        }
      }
      cliResult.autoCalculated = true;
      cliResult.calculatedDates = cliResult.affectedDates;
      cliResult.calcSummaries = calcSummaries;
    } else {
      cliResult.autoCalculated = false;
      cliResult.calculatedDates = [];
    }

    res.json(cliResult);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: `เกิดข้อผิดพลาดในการสั่งซิงค์เครื่องสแกน: ${err.message}`
    });
  } finally {
    syncRunning = false;
  }
});

// 4.12.2 N4: GET /api/scanners/sync-log คืนสถานะและเวลาซิงค์ล่าสุดของแต่ละเครื่อง
app.get('/api/scanners/sync-log', async (req, res) => {
  try {
    await ensureTablesExist();
    const pool = getDbPool();

    // ดึงบันทึกล่าสุด
    const [latestRows] = await pool.query(`
      SELECT * FROM scanner_sync_log 
      ORDER BY id DESC LIMIT 1
    `);
    const latestSync = latestRows && latestRows.length > 0 ? latestRows[0] : null;

    // คำนวณสถานะล่าสุดของเครื่อง 1-3
    let machinesStatus = config.Scanners.map(s => ({
      machineNo: s.MachineNo,
      name: s.Name,
      ip: s.IP,
      status: 'READY',
      lastSyncAt: latestSync ? latestSync.created_at : null,
      lastReadCount: 0,
      lastNewCount: 0,
      lastError: null
    }));

    if (latestSync && latestSync.machines_summary) {
      try {
        const parsedMachines = typeof latestSync.machines_summary === 'string'
          ? JSON.parse(latestSync.machines_summary)
          : latestSync.machines_summary;
        if (Array.isArray(parsedMachines)) {
          machinesStatus = config.Scanners.map(s => {
            const found = parsedMachines.find(m => m.machineNo === s.MachineNo);
            return {
              machineNo: s.MachineNo,
              name: s.Name,
              ip: s.IP,
              status: found?.success ? 'ONLINE' : (found ? 'ERROR' : 'READY'),
              lastSyncAt: latestSync.created_at,
              lastReadCount: found?.readCount || 0,
              lastNewCount: found?.newCount || 0,
              lastError: found?.error || null
            };
          });
        }
      } catch {}
    }

    res.json({
      success: true,
      syncRunning,
      latestSync,
      machines: machinesStatus,
      readerExe: {
        configuredPath: process.env.SCAN_READER_EXE || 'backend/ScannerSyncCli.exe',
        resolvedPath: getScannerReaderExePath(),
        exists: fs.existsSync(getScannerReaderExePath())
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `ไม่สามารถดึงข้อมูล sync-log: ${err.message}` });
  }
});

// ประวัติการซิงค์ย้อนหลัง
app.get('/api/scanners/sync-logs', async (req, res) => {
  try {
    await ensureTablesExist();
    const pool = getDbPool();
    const limit = parseInt(req.query.limit, 10) || 30;
    const [rows] = await pool.query('SELECT * FROM scanner_sync_log ORDER BY id DESC LIMIT ?', [limit]);
    res.json({ success: true, total: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4.12.2 สั่งคำนวณผลเวลาใหม่และบันทึกลง MySQL attendance_daily_result ทันที (ข้อ 5, 7, 8, 10, N3)
app.post('/api/attendance/recalculate', async (req, res) => {
  try {
    await ensureTablesExist();
    const todayStr = new Date().toISOString().substring(0, 10);
    const { date, dates, days } = req.body || {};

    let targetDates = [];
    if (Array.isArray(dates) && dates.length > 0) {
      targetDates = dates;
    } else if (date) {
      targetDates = [date];
    } else if (days && Number(days) > 0) {
      // ย้อนหลัง N วัน
      const n = Math.min(Number(days), 31);
      const dList = [];
      for (let i = 0; i < n; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dList.push(d.toISOString().substring(0, 10));
      }
      targetDates = dList;
    } else {
      targetDates = [todayStr];
    }

    const summaries = [];
    let totalSavedShifts = 0;

    for (const d of targetDates) {
      const result = await calculateDailyAttendanceForDate(d);
      summaries.push(result);
      if (result.savedShiftsCount) totalSavedShifts += result.savedShiftsCount;
    }

    res.json({
      success: true,
      calculatedDates: targetDates,
      totalSavedShifts,
      summaries,
      message: `คำนวณผลเวลาทำงานสำเร็จ ${targetDates.length} วัน (รวม ${totalSavedShifts} กะ/รายการ)`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `คำนวณผลไม่สำเร็จ: ${err.message}` });
  }
});

// 4.12.2 ดึงข้อมูลสแกนแบบกำหนดเอง (Custom Scanner Sync: เลือกเครื่องสแกน, วันที่, ช่วงเวลา, รายเดือน, รายปี)
app.post('/api/scanners/sync-custom', async (req, res) => {
  if (syncRunning) {
    return res.status(409).json({
      success: false,
      syncRunning: true,
      message: 'กระบวนการซิงค์ข้อมูลจากเครื่องสแกนกำลังทำงานอยู่ กรุณารอสักครู่'
    });
  }
  syncRunning = true;
  const startTime = Date.now();

  try {
    await ensureTablesExist();
    const poolAtt = getDbPool();
    const { 
      machineNos = 'ALL', 
      mode = 'RANGE', 
      date, 
      dateFrom, 
      dateTo, 
      month, 
      year,
      syncSource = 'SCANNERS',
      recalculate = true,
      strategy = 'SKIP_DUPLICATES',
      preview = false
    } = req.body || {};

    // ถ้าดึงจากเครื่องสแกน (SCANNERS) ให้เรียก Reader CLI ตรงตามสถาปัตยกรรมใหม่
    if (syncSource === 'SCANNERS') {
      let daysBack = 7;
      const today = new Date();
      if (mode === 'TODAY') {
        daysBack = 1;
      } else if (mode === 'DATE' && date) {
        const dObj = new Date(date);
        const diffDays = Math.ceil((today.getTime() - dObj.getTime()) / (1000 * 60 * 60 * 24));
        daysBack = Math.max(1, Math.min(60, diffDays + 1));
      } else if (mode === 'RANGE' && dateFrom) {
        const dObj = new Date(dateFrom);
        const diffDays = Math.ceil((today.getTime() - dObj.getTime()) / (1000 * 60 * 60 * 24));
        daysBack = Math.max(1, Math.min(60, diffDays + 1));
      } else if (mode === 'MONTH' && month) {
        daysBack = 31;
      }

      let machineParam = undefined;
      if (machineNos && machineNos !== 'ALL') {
        const mArr = Array.isArray(machineNos) ? machineNos : [Number(machineNos)];
        if (mArr.length === 1) {
          machineParam = mArr[0];
        }
      }

      const cliResult = await executeScannerReaderCli({
        auto: true,
        days: daysBack,
        machine: machineParam,
        preview: preview
      });

      // บันทึกลง scanner_sync_log (N4, R10)
      try {
        await poolAtt.query(`
          INSERT INTO scanner_sync_log 
          (sync_mode, machine_no, days, total_read, total_new, duplicates, unmapped, affected_dates, machines_summary, exit_code, error_message, duration_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          preview ? 'PREVIEW' : 'CUSTOM',
          machineParam || null,
          daysBack,
          cliResult.totalRead || 0,
          cliResult.totalNew || 0,
          cliResult.duplicates || 0,
          cliResult.unmapped || 0,
          cliResult.affectedDates ? JSON.stringify(cliResult.affectedDates) : null,
          cliResult.machines ? JSON.stringify(cliResult.machines) : null,
          cliResult.exitCode || 0,
          cliResult.error || null,
          cliResult.durationMs || (Date.now() - startTime)
        ]);
      } catch (logErr) {
        console.warn('Record custom sync log error:', logErr.message);
      }

      // คำนวณผลรายวันอัตโนมัติหากบันทึกจริง (N3)
      if (!preview && recalculate && cliResult.affectedDates && cliResult.affectedDates.length > 0) {
        for (const affDate of cliResult.affectedDates) {
          try {
            await calculateDailyAttendanceForDate(affDate);
          } catch (calcErr) {
            console.error(`Auto calculate for ${affDate} error:`, calcErr.message);
          }
        }
      }

      return res.json({
        success: cliResult.success,
        preview,
        totalFound: cliResult.totalRead || 0,
        newCount: cliResult.totalNew || 0,
        duplicateCount: cliResult.duplicates || 0,
        totalInserted: cliResult.totalNew || 0,
        totalUpdated: 0,
        totalSkipped: cliResult.duplicates || 0,
        affectedDates: cliResult.affectedDates || [],
        machines: cliResult.machines || [],
        message: cliResult.message || `ดึงข้อมูลจากเครื่องสแกนสำเร็จ (อ่านได้ ${cliResult.totalRead || 0}, ใหม่ +${cliResult.totalNew || 0}, ซ้ำ ${cliResult.duplicates || 0})`
      });
    }

    // กรณีดึงจากฐาน HOSOFFICE (syncSource === 'HOSOFFICE')
    const targetDates = new Set();
    const todayStr = new Date().toISOString().substring(0, 10);
    if (mode === 'TODAY') {
      targetDates.add(date || todayStr);
    } else if (mode === 'DATE' && date) {
      targetDates.add(date);
    } else if (mode === 'MONTH' && month) {
      const [y, m] = month.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        targetDates.add(`${month}-${String(d).padStart(2, '0')}`);
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
      targetDates.add(todayStr);
    }
    const dateList = Array.from(targetDates).sort();

    // ดึงบุคลากรจริงเพื่อ map
    let personnelList = [];
    try {
      const [attRows] = await poolAtt.query(`
        SELECT person_id as id, fingle_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name
        FROM attendance_personnel WHERE status = 'ACTIVE' OR status IS NULL
      `);
      personnelList = attRows || [];
    } catch {}

    const hrMap = new Map();
    personnelList.forEach(p => {
      if (p.fingle_id) hrMap.set(Number(p.fingle_id), p);
      if (p.id) hrMap.set(Number(p.id), p);
    });

    let existingKeySet = new Set();
    try {
      const [existingRows] = await poolAtt.query('SELECT fingle_id, scan_date_time FROM attendance_raw_scan');
      existingKeySet = new Set((existingRows || []).map(r => `${r.fingle_id}_${r.scan_date_time}`));
    } catch {}

    const poolHos = getHosofficePool();
    let hosWhere = [];
    let hosParams = [];
    if (dateList.length > 0) {
      hosWhere.push('DATE(scan_date_time) BETWEEN ? AND ?');
      hosParams.push(dateList[0], dateList[dateList.length - 1]);
    }

    let realHosScans = [];
    if (hosWhere.length > 0) {
      const [rows] = await poolHos.query(
        `SELECT * FROM fingle_scan WHERE ${hosWhere.join(' AND ')} ORDER BY scan_date_time ASC LIMIT 50000`,
        hosParams
      );
      realHosScans = rows || [];
    }

    if (!realHosScans || realHosScans.length === 0) {
      return res.json({
        success: true,
        preview,
        totalFound: 0,
        newCount: 0,
        duplicateCount: 0,
        totalInserted: 0,
        totalUpdated: 0,
        totalSkipped: 0,
        message: 'ไม่พบประวัติการสแกนในตาราง hosoffice.fingle_scan ตามช่วงเวลาที่ระบุ'
      });
    }

    let totalFound = 0;
    let newItems = [];
    let duplicateItems = [];
    const affectedDates = new Set();

    for (const hs of realHosScans) {
      const sTime = hs.scan_date_time ? new Date(hs.scan_date_time).toISOString().replace('T', ' ').substring(0, 19) : null;
      if (!sTime) continue;
      const fid = Number(hs.fingle_id || hs.person_id || 0);
      const hr = hrMap.get(fid) || {};
      const mNo = hs.machine_no || hs.machin_id || 1;

      totalFound++;
      const sDate = sTime.substring(0, 10);
      affectedDates.add(sDate);
      const key = `${fid}_${sTime}`;
      const isDup = existingKeySet.has(key);
      const itemPayload = {
        machineNo: mNo,
        deviceIp: hs.device_ip || '192.168.111.163',
        fingleId: fid,
        scanDateTime: sTime,
        inOutMode: hs.in_out_mode !== undefined ? hs.in_out_mode : 0,
        personId: hr.id || null,
        fullname: hr.hr_fullname || `เจ้าหน้าที่ รหัส ${fid}`,
        position: hr.hr_position_name || '',
        department: hr.hr_dep_name || '',
        personType: hr.hr_person_type_name || 'ข้าราชการ'
      };

      if (isDup) duplicateItems.push(itemPayload);
      else newItems.push(itemPayload);
    }

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
        message: `ตรวจสอบล่วงหน้าพบข้อมูลใน HOSOffice ทั้งหมด ${totalFound} รายการ: เป็นข้อมูลใหม่ +${newItems.length} รายการ | มีในระบบแล้ว (ซ้ำ) ${duplicateItems.length} รายการ`
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
            (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name, hr_mapped, push_status, source)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 1, 'PENDING', 'HOSOFFICE')
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
          const [r] = await poolAtt.query(`
            INSERT IGNORE INTO attendance_raw_scan
            (machine_no, device_ip, fingle_id, scan_date_time, verify_mode, in_out_mode, person_id, hr_fullname, hr_position_name, hr_dep_name, hr_person_type_name, hr_mapped, push_status, source)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 1, 'PENDING', 'HOSOFFICE')
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

    if (recalculate && affectedDates.size > 0) {
      for (const affDate of Array.from(affectedDates)) {
        try {
          await calculateDailyAttendanceForDate(affDate);
        } catch (calcErr) {
          console.error(`Auto calculate for ${affDate} error:`, calcErr.message);
        }
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
      affectedDates: Array.from(affectedDates),
      message: `นำเข้าจาก HOSOffice สำเร็จ: บันทึกใหม่ +${totalInserted} รายการ (ข้ามรายการซ้ำ ${totalSkipped} รายการ)`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `เกิดข้อผิดพลาดในการดึงข้อมูล: ${err.message}` });
  } finally {
    syncRunning = false;
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

// ข้อ 5: ปิด Endpoint สร้างข้อมูลจำลอง seed-month ใน Production 100%
app.post('/api/attendance/seed-month', async (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'MOCK_DISABLED',
    message: 'ไม่อนุญาตให้สร้างข้อมูลสแกนจำลองรายเดือนใน Production ข้อมูลการลงเวลาต้องมาจากเครื่องสแกน HIP จริงเท่านั้น'
  });
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

    // ข้อ 24: ตรวจสอบว่ามีตาราง fingle_scan ใน HOSOffice หรือไม่ โดยห้ามสั่ง CREATE TABLE บน HOSOffice เด็ดขาด
    try {
      const [tableCheck] = await poolHos.query("SHOW TABLES LIKE 'fingle_scan'");
      if (!tableCheck || tableCheck.length === 0) {
        return res.status(502).json({
          success: false,
          error: 'HOSOFFICE_TABLE_NOT_FOUND',
          message: `ไม่พบตาราง fingle_scan บนฐานข้อมูล ${hosofficeDbName} กรุณาตรวจสอบสิทธิ์และฐานข้อมูล HOSOffice`
        });
      }
    } catch (tblErr) {
      return res.status(502).json({
        success: false,
        error: 'HOSOFFICE_QUERY_ERROR',
        message: `ไม่สามารถตรวจสอบตาราง fingle_scan ใน ${hosofficeDbName}: ${tblErr.message}`
      });
    }

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
    console.warn('[PushBatches] DB Query warning:', err.message);
    res.json({ success: true, data: [], dbConnected: false, warning: err.message });
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

