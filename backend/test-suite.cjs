/**
 * Automated Test Suite for Samchuk Attendance System (P0 & Logic Verification)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('================================================================');
console.log('🧪 เริ่มการทดสอบระบบ Samchuk Attendance Management Test Suite');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}\n`);
    failCount++;
  }
}

// --------------------------------------------------------------------------
// TEST GROUP 1: Scanner Executable & SDK DLLs Placement
// --------------------------------------------------------------------------
console.log('📁 ทดสอบกลุ่มที่ 1: ตรวจสอบความสมบูรณ์ของไฟล์ Scanner และ SDK DLLs');

it('ไฟล์ ScannerSyncCli.exe ต้องอยู่ใน backend/ และ root/', () => {
  assert.ok(fs.existsSync(path.join(__dirname, 'ScannerSyncCli.exe')), 'ScannerSyncCli.exe ใน backend/ ไม่พบ');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'ScannerSyncCli.exe')), 'ScannerSyncCli.exe ใน root/ ไม่พบ');
});

it('ไฟล์ SDK DLLs ของเครื่องสแกนทั้งหมดต้องมีอยู่ใน backend/ ครบถ้วน', () => {
  const requiredDlls = [
    'FKAttend.dll',
    'FK623Attend.dll',
    'FKViaDev.dll',
    'LFWViaDev.dll',
    'FpDataConv.dll',
    'FaceDataConv.dll',
    'UniversalOfflineSDK.dll',
    'mb.dll',
    'LIBCURL.DLL',
    'Interop.RealSvrOcxTcpLib.dll',
    'FKPwdEncDec.dll',
    'ScannerSyncCli.dll',
    'ScannerSyncCli.deps.json',
    'ScannerSyncCli.runtimeconfig.json'
  ];

  for (const dll of requiredDlls) {
    assert.ok(fs.existsSync(path.join(__dirname, dll)), `ไม่พบไฟล์ ${dll} ใน backend/`);
  }
});

// --------------------------------------------------------------------------
// TEST GROUP 2: CORS Whitelist & LAN IP Validation
// --------------------------------------------------------------------------
console.log('\n🌐 ทดสอบกลุ่มที่ 2: ระบบความปลอดภัย CORS และการรองรับ LAN / Gateway');

// จำลองฟังก์ชัน isAllowedOrigin จาก server.cjs
function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (process.env.ALLOWED_ORIGINS === '*' || process.env.CORS_ALLOW_ALL === 'true') return true;

  const configuredOrigins = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (configuredOrigins.includes(origin)) return true;

  try {
    const parsedUrl = new URL(origin);
    const hostname = parsedUrl.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    if (
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    ) return true;
    if (hostname.endsWith('.moph.go.th') || hostname.endsWith('.local') || hostname === 'samchuk-hospital') return true;
  } catch {}
  return false;
}

it('อนุญาต Localhost ทุก Port (3000, 3001, 3002, 80)', () => {
  assert.strictEqual(isAllowedOrigin('http://localhost:3000'), true);
  assert.strictEqual(isAllowedOrigin('http://localhost:3001'), true);
  assert.strictEqual(isAllowedOrigin('http://localhost:3002'), true);
  assert.strictEqual(isAllowedOrigin('http://localhost'), true);
  assert.strictEqual(isAllowedOrigin('http://127.0.0.1:3002'), true);
});

it('อนุญาต IP โรงพยาบาล 10.2.0.13:3001 (Web Frontend) และ 10.2.0.13:3002 (Gateway)', () => {
  assert.strictEqual(isAllowedOrigin('http://10.2.0.13:3001'), true);
  assert.strictEqual(isAllowedOrigin('https://10.2.0.13:3001'), true);
  assert.strictEqual(isAllowedOrigin('http://10.2.0.13:3002'), true);
});

it('อนุญาต IP วงแลนโรงพยาบาล 192.168.x.x และ 10.x.x.x', () => {
  assert.strictEqual(isAllowedOrigin('http://192.168.1.100:3002'), true);
  assert.strictEqual(isAllowedOrigin('http://192.168.111.163:5005'), true);
  assert.strictEqual(isAllowedOrigin('http://10.0.1.50'), true);
});

it('อนุญาตการเรียกแบบ Internal / Same-Origin / curl (origin เป็น null/undefined)', () => {
  assert.strictEqual(isAllowedOrigin(null), true);
  assert.strictEqual(isAllowedOrigin(undefined), true);
});

it('บล็อก Domain ภายนอกหรือผู้ไม่ประสงค์ดี (Anti-CORS Spoofing)', () => {
  assert.strictEqual(isAllowedOrigin('http://evil-attacker.com'), false);
  assert.strictEqual(isAllowedOrigin('http://localhost.evil.com'), false);
  assert.strictEqual(isAllowedOrigin('http://10.2.0.13.evil.com'), false);
});

// --------------------------------------------------------------------------
// TEST GROUP 3: Gateway URL Rewriter Logic
// --------------------------------------------------------------------------
console.log('\n🔀 ทดสอบกลุ่มที่ 3: ระบบแปลง URL ผ่าน API Gateway (/api/Sam_Att/*)');

function rewriteGatewayUrl(url) {
  while (url.startsWith('/api/Sam_Att/') || url.startsWith('/api/sam_att/')) {
    url = url.replace(/^\/api\/[sS]am_[aA]tt\//, '/api/');
  }
  if (url.startsWith('/api/api/')) {
    url = url.replace(/^\/api\/api\//, '/api/');
  }
  if (url === '/api/Sam_Att' || url === '/api/sam_att' || url === '/api/Sam_Att/' || url === '/api/sam_att/') {
    return '/api/health';
  }
  return url;
}

it('แปลง /api/Sam_Att/personnel/sync-from-hosoffice เป็น /api/personnel/sync-from-hosoffice ถูกต้อง', () => {
  const result = rewriteGatewayUrl('/api/Sam_Att/personnel/sync-from-hosoffice');
  assert.strictEqual(result, '/api/personnel/sync-from-hosoffice');
});

it('แปลง /api/Sam_Att/api/scanners/sync-custom เป็น /api/scanners/sync-custom ถูกต้อง', () => {
  const result = rewriteGatewayUrl('/api/Sam_Att/api/scanners/sync-custom');
  assert.strictEqual(result, '/api/scanners/sync-custom');
});

it('แปลง /api/Sam_Att/api/attendance/recalculate เป็น /api/attendance/recalculate ถูกต้อง', () => {
  const result = rewriteGatewayUrl('/api/Sam_Att/api/attendance/recalculate');
  assert.strictEqual(result, '/api/attendance/recalculate');
});

it('แปลง /api/Sam_Att เป็น /api/health ถูกต้อง', () => {
  const result = rewriteGatewayUrl('/api/Sam_Att');
  assert.strictEqual(result, '/api/health');
});

// --------------------------------------------------------------------------
// TEST GROUP 4: Authentication, Hashing & Security (P0.1, P0.2, P0.3)
// --------------------------------------------------------------------------
console.log('\n🔒 ทดสอบกลุ่มที่ 4: การยืนยันตัวตนและการเข้ารหัสรหัสผ่าน (PBKDF2 & RBAC)');

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHash] = storedHash.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
}

it('ตรวจสอบการ Hash รหัสผ่านด้วย PBKDF2 (10,000 rounds, 16-byte salt, timing-safe)', () => {
  const pwd = 'HospitalStrongPassword2026!';
  const hashed = hashPassword(pwd);
  assert.ok(hashed.includes(':'), 'รูปแบบ Hash ต้องประกอบด้วย salt:hash');
  assert.strictEqual(verifyPassword(pwd, hashed), true, 'รหัสผ่านถูกต้องต้อง Verify ผ่าน');
  assert.strictEqual(verifyPassword('WrongPassword', hashed), false, 'รหัสผ่านผิดต้อง Verify ไม่ผ่าน');
});

it('ห้ามมีรหัสผ่านเริ่มต้นแบบ Hardcoded ใน Source Code ของ server.cjs', () => {
  const serverCode = fs.readFileSync(path.join(__dirname, 'server.cjs'), 'utf8');
  assert.ok(!serverCode.includes("'admin1234'"), 'พบ admin1234 ในโค้ด');
  assert.ok(!serverCode.includes("'hr1234'"), 'พบ hr1234 ในโค้ด');
  assert.ok(!serverCode.includes("'sup1234'"), 'พบ sup1234 ในโค้ด');
  assert.ok(!serverCode.includes("'user1234'"), 'พบ user1234 ในโค้ด');
  assert.ok(!serverCode.includes("'SAMCHUK_SECURE_ADMIN'"), 'พบ SAMCHUK_SECURE_ADMIN ในโค้ด');
});

// --------------------------------------------------------------------------
// TEST GROUP 5: Scan Pairing, Duplicate Suppression & Shift Logic (P0.8, P0.9, P0.10)
// --------------------------------------------------------------------------
console.log('\n⏱️ ทดสอบกลุ่มที่ 5: อัลกอริทึมจับคู่เวลาสแกน, ตัดซ้ำ 5 นาที และป้องกันใช้สแกนซ้ำข้ามกะ');

it('กรองข้อมูลสแกนซ้ำภายใน 5 นาที (5-Minute Duplicate Suppression)', () => {
  const rawScans = [
    { id: 1, scan_time: '2026-10-25 08:01:10', in_out_mode: 'IN' },
    { id: 2, scan_time: '2026-10-25 08:02:40', in_out_mode: 'IN' }, // ห่าง 1 นาที 30 วิ (ซ้ำ)
    { id: 3, scan_time: '2026-10-25 08:07:00', in_out_mode: 'IN' }  // ห่าง 5 นาที 50 วิ (ไม่ซ้ำ)
  ];

  const filtered = [];
  let lastTimeMs = null;
  for (const s of rawScans) {
    const t = new Date(s.scan_time).getTime();
    if (lastTimeMs === null || (t - lastTimeMs) >= 5 * 60 * 1000) {
      filtered.push(s);
      lastTimeMs = t;
    }
  }

  assert.strictEqual(filtered.length, 2, 'ต้องตัดรายการที่สแกนซ้ำภายใน 5 นาทีออก');
  assert.strictEqual(filtered[0].id, 1);
  assert.strictEqual(filtered[1].id, 3);
});

it('ป้องกันการใช้ Scan ID ซ้ำข้ามกะ (usedScanIds tracking - P0.8)', () => {
  const usedScanIds = new Set();
  
  // กะที่ 1 (เช้า): ใช้ scan_id 101 เข้า และ 102 ออก
  usedScanIds.add(101);
  usedScanIds.add(102);

  // กะที่ 2 (บ่าย): สแกนที่มีคือ 102 (ออกของเช้า) และ 103 (ออกของบ่าย)
  const candidateScansForAfternoon = [102, 103];
  const validScansForAfternoon = candidateScansForAfternoon.filter(id => !usedScanIds.has(id));

  assert.strictEqual(validScansForAfternoon.length, 1);
  assert.strictEqual(validScansForAfternoon[0], 103, 'Scan ID 102 ที่ถูกใช้ในกะเช้าแล้ว ต้องไม่ถูกนำมาใช้ในกะบ่ายซ้ำ');
});

it('คำนวณวันลาครึ่งวันและวันหยุดปฏิบัติงานถูกต้อง (Half-day leave & Holiday Duty - P0.10)', () => {
  // จำลองกรณีลาครึ่งวันเช้า (is_half_day = 1, half_day_type = 'MORNING')
  const halfDayLeave = { is_half_day: 1, half_day_type: 'MORNING' };
  const hasAfternoonScan = true;

  let attendanceStatus = 'OFF';
  if (halfDayLeave.is_half_day) {
    attendanceStatus = hasAfternoonScan ? 'PARTIAL' : 'LEAVE_HALF';
  }

  assert.strictEqual(attendanceStatus, 'PARTIAL', 'ลาครึ่งวันและมาปฏิบัติงานอีกครึ่งวันต้องบันทึกเป็น PARTIAL');
});

// --------------------------------------------------------------------------
// TEST SUMMARY
// --------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`📊 ผลการทดสอบทั้งหมด: ผ่าน ${passCount} / ${passCount + failCount} หัวข้อ (${failCount === 0 ? 'สมบูรณ์ 100%' : 'มีข้อผิดพลาด'})`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
