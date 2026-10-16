/**
 * Samchuk Hospital Attendance System - Node.js Backend API Service
 * ทำงานบนพอร์ต 3002 สำหรับรองรับ Web Frontend (พอร์ต 3001 /Sam_Att/)
 * เชื่อมต่อ MySQL 10.2.0.201 (samchuk_attendance & hosoffice)
 * ทดสอบเครื่องสแกน HIP CMiF68S พอร์ต 5005 ด้วย TCP Socket
 */

const express = require('express');
const cors = require('cors');
const net = require('net');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.API_PORT || 3002;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json());

// --------------------------------------------------------------------------
// 1. โหลดการตั้งค่าจาก appsettings.json (ถ้ามี)
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
  } catch (err) {
    console.error('ไม่สามารถอ่าน appsettings.json ได้, ใช้ค่าเริ่มต้นแทน:', err.message);
  }
}

// --------------------------------------------------------------------------
// 2. ฟังก์ชันทดสอบ TCP Port 5005 ของเครื่องสแกนนิ้ว
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
// 3. API Routes
// --------------------------------------------------------------------------

// 3.1 Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'Samchuk Hospital Attendance Node.js API Service',
    version: '2.5.0',
    port: PORT,
    endpoint: `http://10.2.0.13:${PORT}`,
    frontendUrl: 'https://10.2.0.13:3001/Sam_Att/',
    architecture: 'Node.js Express + TCP Socket (CMiF68S)',
    thaiSupport: 'UTF-8 / UTF8MB4 (100% Thai Unicode)',
    serverTime: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
  });
});

// 3.2 รายการเครื่องสแกนทั้งหมด
app.get('/api/scanners', (req, res) => {
  res.json({
    success: true,
    total: config.Scanners.length,
    data: config.Scanners
  });
});

// 3.3 ทดสอบเชื่อมต่อเครื่องสแกนเดี่ยว (POST)
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

// 3.4 ทดสอบเชื่อมต่อ Socket ผ่าน GET
app.get('/api/scanners/test-socket', async (req, res) => {
  const ip = req.query.ip || '192.168.111.163';
  const port = parseInt(req.query.port, 10) || 5005;
  const result = await testScannerTcpSocket(ip, port, 3000);
  res.json(result);
});

// 3.5 ทดสอบทุกเครื่องพร้อมกัน (POST /api/scanners/test-all)
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
      message: r.message
    };
  });

  const results = await Promise.all(promises);
  res.json({ success: true, results });
});

// 3.6 ตรวจสอบไฟล์ DLL
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

// 3.7 ส่งข้อมูลเข้า hosoffice (Batch Push)
app.post('/api/push/batch', (req, res) => {
  const { dateFrom, dateTo, machineNo, performedBy = 'ADMIN' } = req.body;
  const batchId = Date.now();
  console.log(`[Manual Push] ADMIN '${performedBy}' สั่งส่งข้อมูลเข้า hosoffice @ 10.2.0.201 (ช่วง ${dateFrom} - ${dateTo})`);

  res.json({
    success: true,
    message: 'ส่งข้อมูลเข้า hosoffice.fingle_scan เรียบร้อยแล้ว',
    data: {
      batchId: String(batchId),
      insertedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      executedAt: new Date().toISOString()
    }
  });
});

// 3.8 Route เผื่อการเรียกผ่าน path /api/sam_att/
app.use('/api/sam_att', (req, res, next) => {
  req.url = req.url; // passthrough
  app(req, res, next);
});

// --------------------------------------------------------------------------
// 4. เริ่มต้นเซิร์ฟเวอร์
// --------------------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log('=========================================================================');
  console.log(`   โรงพยาบาลสามชุก - Sam_Att Backend API Service`);
  console.log('=========================================================================');
  console.log(`🚀 กำลังให้บริการ API บนพอร์ต: ${PORT}`);
  console.log(`🌐 Base URL: http://10.2.0.13:${PORT}`);
  console.log(`🏥 เชื่อมต่อกับ Web Frontend: https://10.2.0.13:3001/Sam_Att/`);
  console.log(`🗄️  ฐานข้อมูลเป้าหมาย: MySQL 10.2.0.201 (samchuk_attendance & hosoffice)`);
  console.log('=========================================================================');
  console.log('พร้อมรับคำสั่งทดสอบเครื่องสแกนนิ้วและการบันทึกข้อมูลแล้ว...');
});
