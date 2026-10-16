// ============================================================================
// เครื่องมือวินิจฉัยและทดสอบการเชื่อมต่อ MySQL (รพ.สามชุก)
// ใช้สำหรับรันทาง Command Line: node backend/cli-db-check.cjs [HOST] [PORT] [USER] [PASSWORD]
// ============================================================================
const net = require('net');
const mysql = require('mysql2/promise');

const host = process.argv[2] || process.env.DB_HOST || '10.2.0.201';
const port = parseInt(process.argv[3] || process.env.DB_PORT || '3306', 10);
const specifiedUser = process.argv[4] || process.env.DB_USER || '';
const specifiedPass = process.argv[5] || process.env.DB_PASSWORD || '';

console.log('=============================================================================');
console.log('   โรงพยาบาลสามชุก - ระบบตรวจสอบการเชื่อมต่อฐานข้อมูล MySQL');
console.log('=============================================================================');
console.log(`เป้าหมาย: ${host}:${port}`);
console.log('');

function checkPort(targetHost, targetPort, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isConnected = false;

    socket.setTimeout(timeout);
    socket.on('connect', () => {
      isConnected = true;
      socket.destroy();
      resolve({ open: true });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ open: false, error: 'ETIMEDOUT: หมดเวลารอการเชื่อมต่อพอร์ต 3306 (อาจติด Windows Firewall หรือเครื่องปิดอยู่)' });
    });
    socket.on('error', (err) => {
      socket.destroy();
      resolve({ open: false, error: `${err.code}: ไม่สามารถเข้าถึงพอร์ต 3306 ได้ (${err.message})` });
    });
    socket.connect(targetPort, targetHost);
  });
}

async function runDiagnostics() {
  console.log(`[ขั้นตอนที่ 1] ทดสอบการเชื่อมต่อ Network Port (${host}:${port})...`);
  const portResult = await checkPort(host, port);
  if (!portResult.open) {
    console.error(`[ข้อผิดพลาด] ${portResult.error}`);
    console.log('');
    console.log('คำแนะนำในการแก้ไข:');
    console.log(`1. ตรวจสอบว่าเครื่องเซิร์ฟเวอร์ ${host} เปิดเครื่องอยู่และอยู่ในวง LAN เดียวกัน`);
    console.log(`2. ตรวจสอบ Windows Firewall บนเครื่อง ${host} ว่าได้เปิด Inbound Port 3306 หรือยัง`);
    console.log(`3. หากรัน MySQL บนเครื่องเซิร์ฟเวอร์เดียวกันกับ Backend ให้ลองระบุเป็น localhost หรือ 127.0.0.1`);
    process.exit(1);
  }
  console.log(`[ผ่าน] พอร์ต ${port} บน ${host} เปิดทำงานและตอบสนองเรียบร้อย!`);
  console.log('');

  console.log(`[ขั้นตอนที่ 2] ทดสอบสิทธิ์การเข้าสู่ระบบ MySQL (Authentication)...`);
  const candidates = [];
  if (specifiedUser) {
    candidates.push({ user: specifiedUser, password: specifiedPass, label: `ผู้ใช้ที่ระบุ (${specifiedUser})` });
  }
  candidates.push(
    { user: 'sa', password: 'sa', label: 'sa / sa (ค่าเริ่มต้นระบบ HosOffice/HOSxP)' },
    { user: 'root', password: '', label: 'root / (รหัสผ่านว่าง)' },
    { user: 'root', password: 'sa', label: 'root / sa' },
    { user: 'root', password: 'doctor', label: 'root / doctor' },
    { user: 'root', password: 'hospital', label: 'root / hospital' },
    { user: 'root', password: 'samchuk', label: 'root / samchuk' },
    { user: 'root', password: '123456', label: 'root / 123456' },
    { user: 'root', password: '1234', label: 'root / 1234' },
    { user: 'hosoffice', password: 'hosoffice', label: 'hosoffice / hosoffice' },
    { user: 'attendance_app', password: '', label: 'attendance_app / (ว่าง)' }
  );

  let workingConn = null;
  let workingUser = '';
  let workingPass = '';

  for (const c of candidates) {
    try {
      const conn = await mysql.createConnection({
        host,
        port,
        user: c.user,
        password: c.password,
        connectTimeout: 2500
      });
      console.log(`  [สำเร็จ!] เชื่อมต่อได้ด้วย: ${c.label}`);
      workingConn = conn;
      workingUser = c.user;
      workingPass = c.password;
      break;
    } catch (err) {
      // console.log(`  [ไม่ได้] ${c.label}: ${err.code}`);
    }
  }

  if (!workingConn) {
    console.error('[ข้อผิดพลาด] ไม่สามารถล็อกอินเข้า MySQL ได้ด้วยบัญชีทั่วไป');
    console.log('คำแนะนำ: กรุณาระบุ User และ Password ที่ถูกต้องของ MySQL โดยสั่ง:');
    console.log(`  node backend/cli-db-check.cjs ${host} ${port} <USER> <PASSWORD>`);
    console.log('หรือแก้ไขในไฟล์ backend/SamchukAttendance.Api/appsettings.json');
    process.exit(1);
  }

  console.log('');
  console.log(`[ขั้นตอนที่ 3] ตรวจสอบฐานข้อมูลที่พบบนเซิร์ฟเวอร์ MySQL (${host})...`);
  try {
    const [dbs] = await workingConn.query('SHOW DATABASES');
    const dbList = dbs.map(d => Object.values(d)[0]);
    console.log(`รายชื่อฐานข้อมูล (${dbList.length} ฐาน): ${dbList.join(', ')}`);

    const hasAttendance = dbList.includes('samchuk_attendance');
    const hasHosOffice = dbList.includes('hosoffice');

    console.log('');
    console.log(`สถานะฐานข้อมูล samchuk_attendance: ${hasAttendance ? '[พบแล้ว]' : '[ยังไม่มี - กำลังสร้างให้อัตโนมัติ...]'}`);
    if (!hasAttendance) {
      await workingConn.query('CREATE DATABASE IF NOT EXISTS `samchuk_attendance` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
      console.log('[สำเร็จ] สร้างฐานข้อมูล samchuk_attendance (UTF-8) เรียบร้อยแล้ว!');
    }

    console.log(`สถานะฐานข้อมูล hosoffice: ${hasHosOffice ? '[พบแล้ว พร้อมดึงข้อมูลบุคลากร HR]' : '[ไม่พบชื่อ hosoffice]'}`);
    if (!hasHosOffice) {
      console.log('  หมายเหตุ: หากฐานข้อมูลบุคลากรโรงพยาบาลสามชุกใช้ชื่ออื่น ให้ตรวจสอบจากรายชื่อด้านบน');
    }

    await workingConn.end();

    console.log('');
    console.log('=============================================================================');
    console.log(`   [สรุปการตั้งค่าที่ถูกต้องสำหรับใช้งาน]:`);
    console.log(`   Host:     ${host}`);
    console.log(`   Port:     ${port}`);
    console.log(`   User:     ${workingUser}`);
    console.log(`   Password: ${workingPass ? '********' : '(ว่าง)'}`);
    console.log('=============================================================================');
    console.log('สามารถเริ่มรัน Backend ได้เลยด้วยคำสั่ง: start-backend.bat');
    console.log('');
  } catch (err) {
    console.error(`เกิดข้อผิดพลาดในการตรวจสอบฐานข้อมูล: ${err.message}`);
  }
}

runDiagnostics();
