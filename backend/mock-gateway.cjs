/**
 * Mock Central API Gateway for Sam_Att Integration Testing
 * 
 * จำลองการทำงานของ Central API Gateway (พอร์ต 3002) โดยนำเข้า createSamAttRouter
 * จาก modules/sam_att/index.cjs และ Mount ที่ /api/Sam_Att/
 * 
 * ความปลอดภัย:
 * - ใช้ Mock Database Connection Pool ทั้งหมด ไม่แตะต้องฐานข้อมูลจริง (Zero Production Impact)
 * - ไม่มีการเขียนข้อมูลลง MySQL 10.2.0.201 หรือ hosoffice
 * - ไม่เรียก Native Scanner DLLs หรือคำสั่งฮาร์ดแวร์จริง
 * - ทดสอบสัญญา API (Contract), สถานะ HTTP Status, โครงสร้าง JSON และการถอดรหัส Sub-path
 */

const express = require('express');
const http = require('http');
const { createSamAttRouter } = require('./modules/sam_att/index.cjs');

// Mock Data สำหรับการทดสอบ Gateway โดยไม่ต้องต่อ MySQL จริง
const MOCK_SHIFTS = [
  { id: 1, shift_code: 'MORN', shift_name: 'กะเช้า', start_time: '08:00:00', end_time: '16:00:00', late_grace_minutes: 15, is_active: 1 },
  { id: 2, shift_code: 'AFT', shift_name: 'กะบ่าย', start_time: '16:00:00', end_time: '24:00:00', late_grace_minutes: 15, is_active: 1 },
  { id: 3, shift_code: 'NIGHT', shift_name: 'กะดึก', start_time: '00:00:00', end_time: '08:00:00', late_grace_minutes: 15, is_active: 1 }
];

const MOCK_PERSONNEL = [
  { fingle_id: 101, hp_id: 1, full_name: 'นพ. สมชาย ใจดี', hr_cid: '1234567890123', hr_position_name: 'นายแพทย์ชำนาญการ', hr_department_name: 'กลุ่มงานการแพทย์', hr_person_type_name: 'ข้าราชการ', hr_status_name: 'ปฏิบัติงาน', is_active: 1 },
  { fingle_id: 102, hp_id: 2, full_name: 'พว. สมหญิง รักษาดี', hr_cid: '9876543210987', hr_position_name: 'พยาบาลวิชาชีพชำนาญการ', hr_department_name: 'กลุ่มงานการพยาบาล', hr_person_type_name: 'พนักงานกระทรวงสาธารณสุข', hr_status_name: 'ปฏิบัติงาน', is_active: 1 }
];

const MOCK_TYPES = [
  { id: 1, name: 'ข้าราชการ', morning_start: '08:00', morning_end: '16:00', morning_late_grace: 15, is_active: 1 },
  { id: 2, name: 'ลูกจ้างประจำ', morning_start: '08:00', morning_end: '16:00', morning_late_grace: 15, is_active: 1 }
];

// Mock Database Pool
function createMockPool() {
  return {
    query: async (sql, params = []) => {
      const sqlLower = (typeof sql === 'string' ? sql : '').toLowerCase();

      // Health / Ping test
      if (sqlLower.includes('select 1')) {
        return [[{ '1': 1 }]];
      }

      // Shifts query
      if (sqlLower.includes('from attendance_shift') || sqlLower.includes('from shifts')) {
        return [MOCK_SHIFTS];
      }

      // Personnel Types
      if (sqlLower.includes('from attendance_personnel_type') || sqlLower.includes('from personnel_types')) {
        return [MOCK_TYPES];
      }

      // Personnel Directory
      if (sqlLower.includes('from attendance_personnel')) {
        return [MOCK_PERSONNEL];
      }

      // HOSOffice hr_person simulation
      if (sqlLower.includes('from hr_person') || sqlLower.includes('hr_person p')) {
        return [MOCK_PERSONNEL.map(p => ({
          ID: p.hp_id,
          FINGLE_ID: p.fingle_id,
          HR_CID: p.hr_cid,
          FULLNAME: p.full_name,
          HR_POSITION_NAME: p.hr_position_name,
          HR_DEPARTMENT_SUB_NAME: p.hr_department_name,
          HR_PERSON_TYPE_NAME: p.hr_person_type_name,
          HR_STATUS_NAME: p.hr_status_name
        }))];
      }

      // Raw scans
      if (sqlLower.includes('from attendance_raw_scan')) {
        return [[]];
      }

      // Attendance summary
      if (sqlLower.includes('from attendance_daily_result') || sqlLower.includes('from attendance_calculated')) {
        return [[]];
      }

      // Information schema / describe hr_person
      if (sqlLower.includes('information_schema.columns') || sqlLower.includes('describe') || sqlLower.includes('show columns')) {
        return [[
          { COLUMN_NAME: 'ID', Field: 'ID' },
          { COLUMN_NAME: 'FINGLE_ID', Field: 'FINGLE_ID' },
          { COLUMN_NAME: 'HR_CID', Field: 'HR_CID' },
          { COLUMN_NAME: 'FULLNAME', Field: 'FULLNAME' },
          { COLUMN_NAME: 'HR_POSITION_NAME', Field: 'HR_POSITION_NAME' },
          { COLUMN_NAME: 'HR_DEPARTMENT_SUB_NAME', Field: 'HR_DEPARTMENT_SUB_NAME' },
          { COLUMN_NAME: 'HR_PERSON_TYPE_NAME', Field: 'HR_PERSON_TYPE_NAME' },
          { COLUMN_NAME: 'HR_STATUS_NAME', Field: 'HR_STATUS_NAME' }
        ]];
      }

      // Attendance User Simulation for Login
      if (sqlLower.includes('from attendance_user')) {
        const crypto = require('crypto');
        const salt = 'mock_salt_123';
        const password_hash = crypto.pbkdf2Sync('Admin@123', salt, 10000, 64, 'sha512').toString('hex');
        return [[{
          id: 1,
          username: 'admin',
          password_hash,
          salt,
          fullname: 'ผู้ดูแลระบบ รพ.สามชุก',
          role: 'ADMIN',
          department: 'ศูนย์เทคโนโลยีสารสนเทศ (IT)',
          status: 'ACTIVE'
        }]];
      }

      // Default safe response [rows, fields]
      return [[], { affectedRows: 1, insertId: 999 }];
    },
    getConnection: async () => ({
      query: async () => [[]],
      release: () => {}
    })
  };
}

async function runMockGatewayTests() {
  console.log('================================================================');
  console.log('🏥 Samchuk Hospital - Central API Gateway Integration Test');
  console.log('================================================================\n');

  const mockDb = createMockPool();
  const mockHos = createMockPool();

  // 1. จำลอง Central Gateway บน Express
  const gateway = express();
  gateway.use(express.json());

  // 2. Mount Sam_Att Router ที่ Route /api/Sam_Att/ ตามสถาปัตยกรรม Gateway
  console.log('🔌 กำลัง Mount Sam_Att Router เข้าสู่ Central Gateway ที่ /api/Sam_Att/ ...');
  const samAttRouter = createSamAttRouter({
    dbPool: mockDb,
    hosofficePool: mockHos,
    config: { AttendanceDb: 'samchuk_attendance_mock', HosOfficeDb: 'hosoffice_mock' }
  });

  gateway.use('/api/Sam_Att', samAttRouter);

  // 3. เริ่มต้น Test Server บน Localhost พอร์ตสุ่ม (0) เพื่อความเสถียร
  const server = http.createServer(gateway);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const TEST_PORT = server.address().port;
  console.log(`🚀 Mock Gateway พร้อมให้บริการสำหรับการทดสอบที่: http://127.0.0.1:${TEST_PORT}\n`);

  // Log in as ADMIN to obtain authentic Bearer session token
  const loginRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/Sam_Att/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' })
  });
  const loginData = await loginRes.json().catch(() => null);
  const authToken = loginData?.token || '';
  console.log(`🔑 ได้รับ Bearer Token จาก Gateway Login: ${authToken ? authToken.slice(0, 16) + '...' : 'None'}`);

  // Spying on Outbound Traffic to Ports 3003 (Procurement) and 3004 (Cash_Cheque)
  let trafficTo3003Count = 0;
  let trafficTo3004Count = 0;
  const originalHttpRequest = http.request;
  http.request = function(options, cb) {
    const port = options && (options.port || (options.headers && options.headers.host && options.headers.host.split(':')[1]));
    if (String(port) === '3003') trafficTo3003Count++;
    if (String(port) === '3004') trafficTo3004Count++;
    return originalHttpRequest.apply(this, arguments);
  };

  const endpointsToTest = [
    { name: '1. Gateway Root Health Check', method: 'GET', path: '/api/Sam_Att/health', expectedStatus: 200, requiresAuth: false },
    { name: '2. Gateway Direct Root', method: 'GET', path: '/api/Sam_Att', expectedStatus: 200, requiresAuth: false },
    { name: '3. Shifts Directory', method: 'GET', path: '/api/Sam_Att/shifts', expectedStatus: 200, requiresAuth: true },
    { name: '4. Personnel Types', method: 'GET', path: '/api/Sam_Att/personnel-types', expectedStatus: 200, requiresAuth: true },
    { name: '5. Personnel Directory', method: 'GET', path: '/api/Sam_Att/personnel', expectedStatus: 200, requiresAuth: true },
    { name: '6. HOSOffice Personnel Sync', method: 'POST', path: '/api/Sam_Att/personnel/sync-from-hosoffice', body: {}, expectedStatus: 200, requiresAuth: true },
    { name: '7. Attendance Daily Query', method: 'GET', path: '/api/Sam_Att/attendance?date=2026-10-29', expectedStatus: 200, requiresAuth: true },
    { name: '8. Raw Scans Query', method: 'GET', path: '/api/Sam_Att/raw-scans?limit=100', expectedStatus: 200, requiresAuth: true },
    { name: '9. IIS Reverse Proxy Subpath (/api/Sam_Att/api/shifts)', method: 'GET', path: '/api/Sam_Att/api/shifts', expectedStatus: 200, requiresAuth: true }
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of endpointsToTest) {
    try {
      const url = `http://127.0.0.1:${TEST_PORT}${tc.path}`;
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };
      if (tc.requiresAuth && authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const options = {
        method: tc.method,
        headers
      };
      if (tc.body) {
        options.body = JSON.stringify(tc.body);
      }

      const res = await fetch(url, options);
      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const body = await res.json().catch(() => null);

      if (res.status === tc.expectedStatus && isJson) {
        console.log(`  ✅ [PASS] ${tc.name}`);
        console.log(`     HTTP ${res.status} | Content-Type: ${contentType}`);
        if (body && typeof body === 'object') {
          const keys = Object.keys(body).slice(0, 4).join(', ');
          console.log(`     Response Keys: [${keys}] | success: ${body.success !== undefined ? body.success : (body.status || 'true')}`);
        }
        passed++;
      } else {
        console.error(`  ❌ [FAIL] ${tc.name}`);
        console.error(`     Expected HTTP ${tc.expectedStatus}, got ${res.status} (Content-Type: ${contentType})`);
        failed++;
      }
    } catch (err) {
      console.error(`  ❌ [ERROR] ${tc.name}: ${err.message}`);
      failed++;
    }
    console.log('');
  }

  // 4. Test Isolation: Verify ZERO traffic to 3003 and 3004 during Sam_Att operations
  console.log('🔒 ทดสอบการแยกส่วน (Isolation): ตรวจสอบการไม่รั่วไหลไปยังพอร์ต 3003 หรือ 3004');
  if (trafficTo3003Count === 0 && trafficTo3004Count === 0) {
    console.log(`  ✅ [PASS] Zero Traffic to Port 3003 (Procurement: ${trafficTo3003Count}) and Port 3004 (Cash_Cheque: ${trafficTo3004Count})`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] Detected leakage to internal services: 3003=${trafficTo3003Count}, 3004=${trafficTo3004Count}`);
    failed++;
  }

  // 5. Test Router Scoped Dependency Injection (Instance Isolation)
  console.log('\n🧩 ทดสอบ Scoped Dependency Injection: Router A และ Router B ต้องแยก Pool อิสระจากกัน');
  let poolAQueries = 0;
  let poolBQueries = 0;
  const poolA = { query: async () => { poolAQueries++; return [MOCK_SHIFTS]; } };
  const poolB = { query: async () => { poolBQueries++; return [MOCK_SHIFTS]; } };

  const routerA = createSamAttRouter({ dbPool: poolA });
  const routerB = createSamAttRouter({ dbPool: poolB });

  const testApp = express();
  testApp.use('/instanceA', routerA);
  testApp.use('/instanceB', routerB);

  const testServer = http.createServer(testApp);
  await new Promise(r => testServer.listen(0, '127.0.0.1', r));
  const testPort = testServer.address().port;

  await fetch(`http://127.0.0.1:${testPort}/instanceA/shifts`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  await fetch(`http://127.0.0.1:${testPort}/instanceB/shifts`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  testServer.close();

  if (poolAQueries === 1 && poolBQueries === 1) {
    console.log('  ✅ [PASS] Scoped DI Isolation Confirmed (Pool A = 1, Pool B = 1, ไม่มีตัวแปร Global เขียนทับ)');
    passed++;
  } else {
    console.error(`  ❌ [FAIL] Scoped DI Failure: Pool A=${poolAQueries}, Pool B=${poolBQueries}`);
    failed++;
  }

  // 6. Test Explicit Schema Migration Permission Check
  console.log('\n🛡️ ทดสอบความปลอดภัย Schema Migration: ป้องกันการ Migrate ตารางโดยไม่ได้รับอนุญาต');
  const { ensureTablesExist } = require('./modules/sam_att/index.cjs');
  delete process.env.ALLOW_SCHEMA_MIGRATION;
  const unauthMigrate = await ensureTablesExist();
  if (unauthMigrate.skipped === true) {
    console.log('  ✅ [PASS] ensureTablesExist() ข้ามการ DDL สำเร็จเมื่อไม่ได้รับอนุญาต (Zero Auto-DDL on Import)');
    passed++;
  } else {
    console.error('  ❌ [FAIL] ensureTablesExist() executed DDL without explicit permission');
    failed++;
  }

  // 7. Direct Test of real src/services/apiClient.ts against Central Gateway
  console.log('\n🌐 ทดสอบการทำงานร่วมกับ src/services/apiClient.ts ของจริง (Direct TS Test)');
  try {
    const { apiClient } = await import('../src/services/apiClient.ts');
    apiClient.setAuthToken(authToken);
    const directHealth = await apiClient.request(`http://127.0.0.1:${TEST_PORT}/api/Sam_Att/health`);
    const directShifts = await apiClient.request(`http://127.0.0.1:${TEST_PORT}/api/Sam_Att/shifts`);
    if (directHealth && directHealth.status === 'ONLINE' && directShifts && Array.isArray(directShifts.data)) {
      console.log(`  ✅ [PASS] apiClient.ts เชื่อมต่อ Gateway ได้สมบูรณ์ (Health: ${directHealth.status}, Shifts: ${directShifts.data.length})`);
      passed++;
    } else {
      console.error('  ❌ [FAIL] apiClient.ts direct test failed to validate response payload');
      failed++;
    }
  } catch (apiErr) {
    console.error('  ❌ [FAIL] apiClient.ts import/call error:', apiErr.message);
    failed++;
  }

  // Restore http.request
  http.request = originalHttpRequest;
  server.close();

  const totalTests = endpointsToTest.length + 4;
  console.log('\n================================================================');
  console.log(`📊 สรุปผลการทดสอบ Gateway: ผ่าน ${passed} / ${totalTests} หัวข้อ (${failed === 0 ? 'สมบูรณ์ 100%' : 'พบข้อผิดพลาด'})`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runMockGatewayTests().catch(err => {
    console.error('Mock Gateway Test Error:', err);
    process.exit(1);
  });
}

module.exports = { runMockGatewayTests };
