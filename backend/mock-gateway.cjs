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

  // 3. เริ่มต้น Test Server บน Localhost พอร์ตชั่วคราว (3095)
  const TEST_PORT = 3095;
  const server = http.createServer(gateway);

  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`🚀 Mock Gateway พร้อมให้บริการสำหรับการทดสอบที่: http://127.0.0.1:${TEST_PORT}\n`);

  const endpointsToTest = [
    { name: '1. Gateway Root Health Check', method: 'GET', path: '/api/Sam_Att/health', expectedStatus: 200 },
    { name: '2. Gateway Direct Root', method: 'GET', path: '/api/Sam_Att', expectedStatus: 200 },
    { name: '3. Shifts Directory', method: 'GET', path: '/api/Sam_Att/shifts', expectedStatus: 200 },
    { name: '4. Personnel Types', method: 'GET', path: '/api/Sam_Att/personnel-types', expectedStatus: 200 },
    { name: '5. Personnel Directory', method: 'GET', path: '/api/Sam_Att/personnel', expectedStatus: 200 },
    { name: '6. HOSOffice Personnel Sync', method: 'POST', path: '/api/Sam_Att/personnel/sync-from-hosoffice', body: {}, expectedStatus: 200 },
    { name: '7. Attendance Daily Query', method: 'GET', path: '/api/Sam_Att/attendance?date=2026-10-29', expectedStatus: 200 },
    { name: '8. Raw Scans Query', method: 'GET', path: '/api/Sam_Att/raw-scans?limit=100', expectedStatus: 200 },
    { name: '9. IIS Reverse Proxy Subpath (/api/Sam_Att/api/shifts)', method: 'GET', path: '/api/Sam_Att/api/shifts', expectedStatus: 200 }
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of endpointsToTest) {
    try {
      const url = `http://127.0.0.1:${TEST_PORT}${tc.path}`;
      const options = {
        method: tc.method,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
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

  server.close();

  console.log('================================================================');
  console.log(`📊 สรุปผลการทดสอบ Gateway: ผ่าน ${passed} / ${endpointsToTest.length} หัวข้อ (${failed === 0 ? 'สมบูรณ์ 100%' : 'พบข้อผิดพลาด'})`);
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
