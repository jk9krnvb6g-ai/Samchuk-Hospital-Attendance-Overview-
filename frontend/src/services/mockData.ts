import { Scanner, Shift, PersonnelGroup, PersonShiftOverride, PersonRoster, RawScan, HosFingleScan, HrPerson, PushBatch, SyncLog, AuditLog, User, HosofficePersonRow } from '../types/attendance';

export const INITIAL_USERS: User[] = [
  {
    id: 1,
    username: 'admin.samchuk',
    fullname: 'ผู้ดูแลระบบ รพ.สามชุก (ADMIN)',
    role: 'ADMIN',
    department: 'ศูนย์เทคโนโลยีสารสนเทศ (IT)',
    email: 'admin.it@samchuk.moph.go.th'
  },
  {
    id: 2,
    username: 'nurse.er',
    fullname: 'พว. นิตยา รัตนสุวรรณ (USER)',
    role: 'USER',
    department: 'กลุ่มงานการพยาบาล (ER)',
    email: 'nitaya.r@samchuk.moph.go.th',
    personId: 2
  },
  {
    id: 3,
    username: 'pharmacist',
    fullname: 'ภญ. กรกนก ภักดี (USER)',
    role: 'USER',
    department: 'กลุ่มงานเภสัชกรรม (OPD Drug)',
    email: 'kornkanok.p@samchuk.moph.go.th',
    personId: 4
  },
  {
    id: 4,
    username: 'driver.ems',
    fullname: 'นาย สมชาย ทองคำ (USER)',
    role: 'USER',
    department: 'งานยานพาหนะและส่งต่อ',
    email: 'somchai.t@samchuk.moph.go.th',
    personId: 7
  },
  {
    id: 5,
    username: 'hr.officer',
    fullname: 'เจ้าหน้าที่บริหารบุคคล (USER)',
    role: 'USER',
    department: 'กลุ่มงานทรัพยากรบุคคล (HR)',
    email: 'hr.staff@samchuk.moph.go.th',
    personId: 6
  }
];

export const INITIAL_SCANNERS: Scanner[] = [
  {
    id: 1,
    machineNo: 1,
    name: 'Scanner 1 - หน้าตึกอำนวยการ',
    ip: '192.168.111.163',
    port: 5005,
    model: 'CMiF68S',
    serial: '6802004210',
    password: '0',
    enabled: true,
    status: 'ONLINE',
    lastSync: '2026-10-14 08:00:12',
    syncIntervalSec: 60,
    totalLoadedRecords: 1420
  },
  {
    id: 2,
    machineNo: 2,
    name: 'Scanner 2 - ตึกอุบัติเหตุและฉุกเฉิน (ER)',
    ip: '192.168.111.164',
    port: 5005,
    model: 'CMiF68S',
    serial: '6802004486',
    password: '0',
    enabled: true,
    status: 'ONLINE',
    lastSync: '2026-10-14 08:00:18',
    syncIntervalSec: 60,
    totalLoadedRecords: 2854
  },
  {
    id: 3,
    machineNo: 3,
    name: 'Scanner 3 - ตึกผู้ป่วยใน (IPD)',
    ip: '192.168.111.165',
    port: 5005,
    model: 'CMiF68S',
    serial: 'ยังไม่ระบุ',
    password: '0',
    enabled: true,
    status: 'ONLINE',
    lastSync: '2026-10-14 08:00:24',
    syncIntervalSec: 60,
    totalLoadedRecords: 960
  }
];

export const INITIAL_SHIFTS: Shift[] = [
  {
    id: 1,
    shiftCode: 'M',
    shiftName: 'เช้า (ปกติ)',
    startTime: '08:15',
    endTime: '16:00',
    crossesMidnight: false,
    workDateBasis: 'START_DATE',
    lateGraceMinutes: 0,
    inWindowBeforeMin: 120,
    outWindowAfterMin: 120,
    earlyLeaveMin: 0,
    duplicateScanMin: 5,
    color: '#0284c7', // Sky Blue
    isActive: true,
    isSystemDefault: true,
    createdAt: '2026-01-01 00:00:00',
    updatedAt: '2026-10-01 08:00:00'
  },
  {
    id: 2,
    shiftCode: 'A',
    shiftName: 'บ่าย',
    startTime: '16:00',
    endTime: '24:00',
    crossesMidnight: false,
    workDateBasis: 'START_DATE',
    lateGraceMinutes: 0,
    inWindowBeforeMin: 120,
    outWindowAfterMin: 120,
    earlyLeaveMin: 0,
    duplicateScanMin: 5,
    color: '#d97706', // Amber
    isActive: true,
    createdAt: '2026-01-01 00:00:00',
    updatedAt: '2026-10-01 08:00:00'
  },
  {
    id: 3,
    shiftCode: 'N',
    shiftName: 'ดึก',
    startTime: '00:00',
    endTime: '08:00',
    crossesMidnight: false,
    workDateBasis: 'START_DATE',
    lateGraceMinutes: 0,
    inWindowBeforeMin: 120,
    outWindowAfterMin: 120,
    earlyLeaveMin: 0,
    duplicateScanMin: 5,
    color: '#6366f1', // Indigo
    isActive: true,
    createdAt: '2026-01-01 00:00:00',
    updatedAt: '2026-10-01 08:00:00'
  },
  {
    id: 4,
    shiftCode: 'MA',
    shiftName: 'เช้าควบบ่าย (16 ชม.)',
    startTime: '08:15',
    endTime: '24:00',
    crossesMidnight: false,
    workDateBasis: 'START_DATE',
    lateGraceMinutes: 0,
    inWindowBeforeMin: 120,
    outWindowAfterMin: 120,
    earlyLeaveMin: 0,
    duplicateScanMin: 5,
    color: '#059669', // Emerald
    isActive: true,
    createdAt: '2026-01-01 00:00:00',
    updatedAt: '2026-10-01 08:00:00'
  }
];

export const INITIAL_PERSONNEL: HrPerson[] = [
  {
    personId: 1,
    hrCid: '3-7204-00123-45-6',
    fingleId: 57,
    hrFullname: 'นพ. กิตติภูมิ นวมินทร์',
    hrPositionName: 'นายแพทย์เชี่ยวชาญ',
    hrLevelName: 'เชี่ยวชาญ',
    hrDepName: 'กลุ่มงานการแพทย์',
    hrDepSubName: 'กลุ่มงานอายุรกรรม',
    hrPersonTypeName: 'ข้าราชการ',
    hrPersonTypeId: 1,
    hrDepartmentId: 101,
    hrDepartmentSubId: 1001,
    status: 'ACTIVE'
  },
  {
    personId: 2,
    hrCid: '3-7204-00234-56-7',
    fingleId: 102,
    hrFullname: 'พว. นิตยา รัตนสุวรรณ',
    hrPositionName: 'พยาบาลวิชาชีพชำนาญการ',
    hrLevelName: 'ชำนาญการ',
    hrDepName: 'กลุ่มงานการพยาบาล',
    hrDepSubName: 'งานอุบัติเหตุและฉุกเฉิน (ER)',
    hrPersonTypeName: 'ข้าราชการ',
    hrPersonTypeId: 1,
    hrDepartmentId: 102,
    hrDepartmentSubId: 1002,
    status: 'ACTIVE'
  },
  {
    personId: 3,
    hrCid: '3-7204-00345-67-8',
    fingleId: 114,
    hrFullname: 'พว. วราภรณ์ แจ่มใส',
    hrPositionName: 'พยาบาลวิชาชีพปฏิบัติการ',
    hrLevelName: 'ปฏิบัติการ',
    hrDepName: 'กลุ่มงานการพยาบาล',
    hrDepSubName: 'งานผู้ป่วยนอก (OPD)',
    hrPersonTypeName: 'พนักงานกระทรวงสาธารณสุข',
    hrPersonTypeId: 2,
    hrDepartmentId: 102,
    hrDepartmentSubId: 1003,
    status: 'ACTIVE'
  },
  {
    personId: 4,
    hrCid: '3-7204-00456-78-9',
    fingleId: 201,
    hrFullname: 'ภญ. กรกนก ภักดี',
    hrPositionName: 'เภสัชกรชำนาญการ',
    hrLevelName: 'ชำนาญการ',
    hrDepName: 'กลุ่มงานเภสัชกรรม',
    hrDepSubName: 'งานบริการจ่ายยาผู้ป่วยนอก',
    hrPersonTypeName: 'ข้าราชการ',
    hrPersonTypeId: 1,
    hrDepartmentId: 103,
    hrDepartmentSubId: 1004,
    status: 'ACTIVE'
  },
  {
    personId: 5,
    hrCid: '3-7204-00567-89-0',
    fingleId: 305,
    hrFullname: 'ทนพ. อนุชา เลิศศิริ',
    hrPositionName: 'นักเทคนิคการแพทย์ปฏิบัติการ',
    hrLevelName: 'ปฏิบัติการ',
    hrDepName: 'กลุ่มงานเทคนิคการแพทย์',
    hrDepSubName: 'งานธนาคารเลือดและตรวจวิเคราะห์',
    hrPersonTypeName: 'พนักงานกระทรวงสาธารณสุข',
    hrPersonTypeId: 2,
    hrDepartmentId: 104,
    hrDepartmentSubId: 1005,
    status: 'ACTIVE'
  },
  {
    personId: 6,
    hrCid: '3-7204-00678-90-1',
    fingleId: 410,
    hrFullname: 'นางสาว สุภาพร บุญมา',
    hrPositionName: 'เจ้าหน้าที่ธุรการปฏิบัติการ',
    hrLevelName: 'ปฏิบัติการ',
    hrDepName: 'ฝ่ายบริหารทั่วไป',
    hrDepSubName: 'งานสารบรรณและบุคคล',
    hrPersonTypeName: 'ข้าราชการ',
    hrPersonTypeId: 1,
    hrDepartmentId: 105,
    hrDepartmentSubId: 1006,
    status: 'ACTIVE'
  },
  {
    personId: 7,
    hrCid: '3-7204-00789-01-2',
    fingleId: 501,
    hrFullname: 'นาย สมชาย ทองคำ',
    hrPositionName: 'พนักงานขับรถพยาบาล',
    hrLevelName: 'ลูกจ้าง',
    hrDepName: 'กลุ่มงานอุบัติเหตุและฉุกเฉิน',
    hrDepSubName: 'งานยานพาหนะและส่งต่อ',
    hrPersonTypeName: 'ลูกจ้างประจำ/ลูกจ้างชั่วคราว',
    hrPersonTypeId: 3,
    hrDepartmentId: 102,
    hrDepartmentSubId: 1007,
    status: 'ACTIVE'
  },
  {
    personId: 8,
    hrCid: '3-7204-00890-12-3',
    fingleId: 502,
    hrFullname: 'นาย มานพ ปานแก้ว',
    hrPositionName: 'พนักงานรักษาความปลอดภัย',
    hrLevelName: 'ลูกจ้าง',
    hrDepName: 'ฝ่ายบริหารทั่วไป',
    hrDepSubName: 'งานรักษาความปลอดภัย',
    hrPersonTypeName: 'ลูกจ้างประจำ/ลูกจ้างชั่วคราว',
    hrPersonTypeId: 3,
    hrDepartmentId: 105,
    hrDepartmentSubId: 1008,
    status: 'ACTIVE'
  },
  {
    personId: 9,
    hrCid: '3-7204-00901-23-4',
    fingleId: 503,
    hrFullname: 'นาง จินตนา เพิ่มพูน',
    hrPositionName: 'พนักงานบริการ',
    hrLevelName: 'ลูกจ้าง',
    hrDepName: 'ฝ่ายบริหารทั่วไป',
    hrDepSubName: 'งานสถานที่และแม่บ้าน',
    hrPersonTypeName: 'ลูกจ้างประจำ/ลูกจ้างชั่วคราว',
    hrPersonTypeId: 3,
    hrDepartmentId: 105,
    hrDepartmentSubId: 1009,
    status: 'ACTIVE'
  },
  {
    personId: 10,
    hrCid: '3-7204-00012-34-5',
    fingleId: 504,
    hrFullname: 'นาย ประสิทธิ์ สายสมบูรณ์',
    hrPositionName: 'นายช่างเทคนิค',
    hrLevelName: 'พนักงานกระทรวง',
    hrDepName: 'ฝ่ายบริหารทั่วไป',
    hrDepSubName: 'งานซ่อมบำรุงและวิศวกรรมการแพทย์',
    hrPersonTypeName: 'พนักงานกระทรวงสาธารณสุข',
    hrPersonTypeId: 2,
    hrDepartmentId: 105,
    hrDepartmentSubId: 1010,
    status: 'ACTIVE'
  }
];

export const INITIAL_GROUPS: PersonnelGroup[] = [
  {
    id: 1,
    groupName: 'กลุ่มข้าราชการ',
    groupKind: 'PERSON_TYPE',
    priority: 100,
    isActive: true,
    note: 'บุคลากรประเภทข้าราชการ ใช้เวลากะมาตรฐาน 08:15 - 16:00',
    createdAt: '2026-01-01 08:00:00',
    updatedAt: '2026-10-01 08:00:00',
    personTypeIds: [1],
    memberPersonIds: [],
    shiftOverrides: {
      1: { startTime: '08:15', endTime: '16:00', lateGraceMinutes: 0 },
      2: { startTime: '16:00', endTime: '24:00', lateGraceMinutes: 0 },
      3: { startTime: '00:00', endTime: '08:00', lateGraceMinutes: 0 },
      4: { startTime: '08:15', endTime: '24:00', lateGraceMinutes: 0 }
    }
  },
  {
    id: 2,
    groupName: 'กลุ่มลูกจ้างและพนักงานทั่วไป',
    groupKind: 'PERSON_TYPE',
    priority: 100,
    isActive: true,
    note: 'ลูกจ้างเข้างานเช้า 07:30 น. (ตามตัวอย่างในสเปคข้อ 17.3)',
    createdAt: '2026-01-01 08:00:00',
    updatedAt: '2026-10-01 08:00:00',
    personTypeIds: [3],
    memberPersonIds: [],
    shiftOverrides: {
      1: { startTime: '07:30', endTime: '16:00', lateGraceMinutes: 5 },
      2: { startTime: '16:00', endTime: '24:00', lateGraceMinutes: 0 },
      3: { startTime: '00:00', endTime: '08:00', lateGraceMinutes: 0 },
      4: { startTime: '07:30', endTime: '24:00', lateGraceMinutes: 5 }
    }
  },
  {
    id: 3,
    groupName: 'ทีมเวรฉุกเฉินและกู้ชีพ (ER Fast-Response)',
    groupKind: 'CUSTOM',
    priority: 10, // Higher priority than person-type
    isActive: true,
    note: 'กลุ่มกำหนดเองสำหรับทีม ER และยานพาหนะฉุกเฉิน',
    createdAt: '2026-02-01 08:00:00',
    updatedAt: '2026-10-01 08:00:00',
    personTypeIds: [],
    memberPersonIds: [2, 7], // พว. นิตยา, นายสมชาย
    shiftOverrides: {
      1: { startTime: '08:00', endTime: '16:00', lateGraceMinutes: 0 },
      2: { startTime: '16:00', endTime: '24:00', lateGraceMinutes: 0 },
      3: { startTime: '00:00', endTime: '08:00', lateGraceMinutes: 0 }
    }
  }
];

export const INITIAL_PERSON_OVERRIDES: PersonShiftOverride[] = [
  {
    id: 1,
    personId: 1, // ผู้อำนวยการ
    shiftId: 1,
    startTime: '08:00',
    endTime: '16:30',
    effectiveFrom: '2026-01-01',
    isActive: true,
    note: 'กะพิเศษผู้บริหารและตรวจคลินิกเช้า'
  }
];

// Today is 2026-10-14
const TODAY = '2026-10-14';
const YESTERDAY = '2026-10-13';

export const INITIAL_ROSTER: PersonRoster[] = [
  { id: 1, personId: 2, workDate: TODAY, shiftId: 1, note: 'เวรเช้า ER (08:15-16:00)' },
  { id: 101, personId: 2, workDate: TODAY, shiftId: 2, note: 'เวรบ่าย ER ควบกะ (16:00-24:00)' },
  { id: 2, personId: 3, workDate: TODAY, shiftId: 1, note: 'เวรเช้า OPD' },
  { id: 3, personId: 4, workDate: TODAY, shiftId: 1, note: 'เวรห้องยา' },
  { id: 4, personId: 5, workDate: TODAY, shiftId: 2, note: 'เวรบ่าย LAB' },
  { id: 5, personId: 7, workDate: TODAY, shiftId: 1, note: 'เวรเช้า ยานพาหนะ (08:15-16:00)' },
  { id: 102, personId: 7, workDate: TODAY, shiftId: 2, note: 'เวรบ่าย ยานพาหนะส่งต่อ (16:00-24:00)' },
  { id: 6, personId: 8, workDate: TODAY, shiftId: 3, note: 'เวรดึก รปภ.' },
  { id: 7, personId: 2, workDate: YESTERDAY, shiftId: 1, note: 'เวรเช้า' },
  { id: 8, personId: 7, workDate: YESTERDAY, shiftId: 1, note: 'เวรเช้า' },
];

export const INITIAL_HOSOFFICE_FINGLE_SCANS: HosFingleScan[] = [
  {
    id: 10001,
    personId: 2,
    fingleId: 102,
    scanDateTime: `${YESTERDAY} 07:58:12`,
    scanDate: YESTERDAY,
    scanTime: '07:58:12',
    dayTypeId: 3, // Tuesday
    dayTypeName: 'อังคาร',
    hrFullname: 'พว. นิตยา รัตนสุวรรณ',
    hrPositionName: 'พยาบาลวิชาชีพชำนาญการ',
    hrLeavelName: 'ชำนาญการ',
    hrDepName: 'กลุ่มงานการพยาบาล',
    hrDepSubName: 'งานอุบัติเหตุและฉุกเฉิน (ER)',
    hrPersonTypeName: 'ข้าราชการ',
    hrPersonTypeId: 1,
    hrDepartmentId: 102,
    hrDepartmentSubId: 1002,
    machinId: 2,
    appTypeSave: 'SCAN',
    scanSource: 'FINGER',
    isConfirm: true,
    isInput: 'SIGN',
    dateTimeSave: `${YESTERDAY} 17:00:00`,
    createBy: 'SCAN_PUSH'
  },
  {
    id: 10002,
    personId: 2,
    fingleId: 102,
    scanDateTime: `${YESTERDAY} 16:04:45`,
    scanDate: YESTERDAY,
    scanTime: '16:04:45',
    dayTypeId: 3,
    dayTypeName: 'อังคาร',
    hrFullname: 'พว. นิตยา รัตนสุวรรณ',
    hrPositionName: 'พยาบาลวิชาชีพชำนาญการ',
    hrLeavelName: 'ชำนาญการ',
    hrDepName: 'กลุ่มงานการพยาบาล',
    hrDepSubName: 'งานอุบัติเหตุและฉุกเฉิน (ER)',
    hrPersonTypeName: 'ข้าราชการ',
    hrPersonTypeId: 1,
    hrDepartmentId: 102,
    hrDepartmentSubId: 1002,
    machinId: 2,
    appTypeSave: 'SCAN',
    scanSource: 'FINGER',
    isConfirm: true,
    isInput: 'SIGN',
    dateTimeSave: `${YESTERDAY} 17:00:00`,
    createBy: 'SCAN_PUSH'
  }
];

export const INITIAL_RAW_SCANS: RawScan[] = [
  // Yesterday scans - already pushed
  {
    id: 1,
    machineNo: 2,
    deviceIp: '192.168.111.164',
    fingleId: 102,
    scanDateTime: `${YESTERDAY} 07:58:12`,
    verifyMode: 1,
    inOutMode: 0,
    personId: 2,
    hrFullname: 'พว. นิตยา รัตนสุวรรณ',
    hrPositionName: 'พยาบาลวิชาชีพชำนาญการ',
    hrLeavelName: 'ชำนาญการ',
    hrDepName: 'กลุ่มงานการพยาบาล',
    hrDepSubName: 'งานอุบัติเหตุและฉุกเฉิน (ER)',
    hrPersonTypeName: 'ข้าราชการ',
    hrPersonTypeId: 1,
    hrDepartmentId: 102,
    hrDepartmentSubId: 1002,
    hrMapped: true,
    pushStatus: 'PUSHED',
    pushedAt: `${YESTERDAY} 17:00:00`,
    pushedBy: 1,
    pushBatchId: 1,
    receivedAt: `${YESTERDAY} 08:00:15`
  },
  {
    id: 2,
    machineNo: 2,
    deviceIp: '192.168.111.164',
    fingleId: 102,
    scanDateTime: `${YESTERDAY} 16:04:45`,
    verifyMode: 1,
    inOutMode: 1,
    personId: 2,
    hrFullname: 'พว. นิตยา รัตนสุวรรณ',
    hrPositionName: 'พยาบาลวิชาชีพชำนาญการ',
    hrLeavelName: 'ชำนาญการ',
    hrDepName: 'กลุ่มงานการพยาบาล',
    hrDepSubName: 'งานอุบัติเหตุและฉุกเฉิน (ER)',
    hrPersonTypeName: 'ข้าราชการ',
    hrPersonTypeId: 1,
    hrDepartmentId: 102,
    hrDepartmentSubId: 1002,
    hrMapped: true,
    pushStatus: 'PUSHED',
    pushedAt: `${YESTERDAY} 17:00:00`,
    pushedBy: 1,
    pushBatchId: 1,
    receivedAt: `${YESTERDAY} 16:10:00`
  },
  // Today scans - PENDING (Ready for Manual Push by ADMIN)
  {
    id: 3,
    machineNo: 1,
    deviceIp: '192.168.111.163',
    fingleId: 57,
    scanDateTime: `${TODAY} 08:08:41`,
    verifyMode: 1,
    inOutMode: 0,
    personId: 1,
    hrFullname: 'นพ. กิตติภูมิ นวมินทร์',
    hrPositionName: 'นายแพทย์เชี่ยวชาญ',
    hrLeavelName: 'เชี่ยวชาญ',
    hrDepName: 'กลุ่มงานการแพทย์',
    hrDepSubName: 'กลุ่มงานอายุรกรรม',
    hrPersonTypeName: 'ข้าราชการ',
    hrPersonTypeId: 1,
    hrDepartmentId: 101,
    hrDepartmentSubId: 1001,
    hrMapped: true,
    pushStatus: 'PENDING',
    receivedAt: `${TODAY} 08:09:00`
  },
  {
    id: 4,
    machineNo: 1,
    deviceIp: '192.168.111.163',
    fingleId: 57,
    scanDateTime: `${TODAY} 08:09:02`, // duplicate scan within 21s
    verifyMode: 1,
    inOutMode: 0,
    personId: 1,
    hrFullname: 'นพ. กิตติภูมิ นวมินทร์',
    hrPositionName: 'นายแพทย์เชี่ยวชาญ',
    hrLeavelName: 'เชี่ยวชาญ',
    hrDepName: 'กลุ่มงานการแพทย์',
    hrDepSubName: 'กลุ่มงานอายุรกรรม',
    hrPersonTypeName: 'ข้าราชการ',
    hrPersonTypeId: 1,
    hrDepartmentId: 101,
    hrDepartmentSubId: 1001,
    hrMapped: true,
    pushStatus: 'PENDING',
    receivedAt: `${TODAY} 08:09:15`
  },
  {
    id: 5,
    machineNo: 2,
    deviceIp: '192.168.111.164',
    fingleId: 102,
    scanDateTime: `${TODAY} 07:54:30`,
    verifyMode: 1,
    inOutMode: 0,
    personId: 2,
    hrFullname: 'พว. นิตยา รัตนสุวรรณ',
    hrPositionName: 'พยาบาลวิชาชีพชำนาญการ',
    hrLeavelName: 'ชำนาญการ',
    hrDepName: 'กลุ่มงานการพยาบาล',
    hrDepSubName: 'งานอุบัติเหตุและฉุกเฉิน (ER)',
    hrPersonTypeName: 'ข้าราชการ',
    hrPersonTypeId: 1,
    hrDepartmentId: 102,
    hrDepartmentSubId: 1002,
    hrMapped: true,
    pushStatus: 'PENDING',
    receivedAt: `${TODAY} 07:55:00`
  },
  {
    id: 6,
    machineNo: 1,
    deviceIp: '192.168.111.163',
    fingleId: 114,
    scanDateTime: `${TODAY} 08:26:15`, // Late by 11 mins (standard shift start 08:15)
    verifyMode: 1,
    inOutMode: 0,
    personId: 3,
    hrFullname: 'พว. วราภรณ์ แจ่มใส',
    hrPositionName: 'พยาบาลวิชาชีพปฏิบัติการ',
    hrLeavelName: 'ปฏิบัติการ',
    hrDepName: 'กลุ่มงานการพยาบาล',
    hrDepSubName: 'งานผู้ป่วยนอก (OPD)',
    hrPersonTypeName: 'พนักงานกระทรวงสาธารณสุข',
    hrPersonTypeId: 2,
    hrDepartmentId: 102,
    hrDepartmentSubId: 1003,
    hrMapped: true,
    pushStatus: 'PENDING',
    receivedAt: `${TODAY} 08:27:00`
  },
  {
    id: 7,
    machineNo: 1,
    deviceIp: '192.168.111.163',
    fingleId: 201,
    scanDateTime: `${TODAY} 08:10:04`,
    verifyMode: 1,
    inOutMode: 0,
    personId: 4,
    hrFullname: 'ภญ. กรกนก ภักดี',
    hrPositionName: 'เภสัชกรชำนาญการ',
    hrLeavelName: 'ชำนาญการ',
    hrDepName: 'กลุ่มงานเภสัชกรรม',
    hrDepSubName: 'งานบริการจ่ายยาผู้ป่วยนอก',
    hrPersonTypeName: 'ข้าราชการ',
    hrPersonTypeId: 1,
    hrDepartmentId: 103,
    hrDepartmentSubId: 1004,
    hrMapped: true,
    pushStatus: 'PENDING',
    receivedAt: `${TODAY} 08:11:00`
  },
  {
    id: 8,
    machineNo: 2,
    deviceIp: '192.168.111.164',
    fingleId: 501,
    scanDateTime: `${TODAY} 07:28:50`, // On-time for labor shift 07:30
    verifyMode: 1,
    inOutMode: 0,
    personId: 7,
    hrFullname: 'นาย สมชาย ทองคำ',
    hrPositionName: 'พนักงานขับรถพยาบาล',
    hrLeavelName: 'ลูกจ้าง',
    hrDepName: 'กลุ่มงานอุบัติเหตุและฉุกเฉิน',
    hrDepSubName: 'งานยานพาหนะและส่งต่อ',
    hrPersonTypeName: 'ลูกจ้างประจำ/ลูกจ้างชั่วคราว',
    hrPersonTypeId: 3,
    hrDepartmentId: 102,
    hrDepartmentSubId: 1007,
    hrMapped: true,
    pushStatus: 'PENDING',
    receivedAt: `${TODAY} 07:30:00`
  },
  {
    id: 9,
    machineNo: 1,
    deviceIp: '192.168.111.163',
    fingleId: 503,
    scanDateTime: `${TODAY} 07:42:10`, // Late for labor shift 07:30 (grace 5 min -> late 7 mins)
    verifyMode: 1,
    inOutMode: 0,
    personId: 9,
    hrFullname: 'นาง จินตนา เพิ่มพูน',
    hrPositionName: 'พนักงานบริการ',
    hrLeavelName: 'ลูกจ้าง',
    hrDepName: 'ฝ่ายบริหารทั่วไป',
    hrDepSubName: 'งานสถานที่และแม่บ้าน',
    hrPersonTypeName: 'ลูกจ้างประจำ/ลูกจ้างชั่วคราว',
    hrPersonTypeId: 3,
    hrDepartmentId: 105,
    hrDepartmentSubId: 1009,
    hrMapped: true,
    pushStatus: 'PENDING',
    receivedAt: `${TODAY} 07:45:00`
  },
  {
    id: 10,
    machineNo: 3,
    deviceIp: '192.168.111.165',
    fingleId: 999, // Unmapped Fingle ID to test section 22.3 requirement!
    scanDateTime: `${TODAY} 08:30:20`,
    verifyMode: 1,
    inOutMode: 0,
    hrMapped: false,
    pushStatus: 'PENDING',
    receivedAt: `${TODAY} 08:31:00`
  }
];

export const INITIAL_PUSH_BATCHES: PushBatch[] = [
  {
    id: 1,
    requestedBy: 'admin.samchuk',
    requestedAt: `${YESTERDAY} 17:00:00`,
    filterDateFrom: YESTERDAY,
    filterDateTo: YESTERDAY,
    totalSelected: 2,
    totalInserted: 2,
    totalSkippedExists: 0,
    totalFailed: 0,
    status: 'SUCCESS',
    finishedAt: `${YESTERDAY} 17:00:02`
  }
];

export const INITIAL_SYNC_LOGS: SyncLog[] = [
  {
    id: 1,
    timestamp: `${TODAY} 08:00:12`,
    scannerId: 1,
    scannerName: 'Scanner 1 - หน้าตึกอำนวยการ',
    machineNo: 1,
    ip: '192.168.111.163',
    status: 'SUCCESS',
    recordsTotal: 125,
    recordsNew: 4,
    recordsDuplicate: 121,
    recordsPending: 4,
    durationMs: 410,
    message: 'FK_LoadGeneralLogData completed successfully (handle: 2841)'
  },
  {
    id: 2,
    timestamp: `${TODAY} 08:00:18`,
    scannerId: 2,
    scannerName: 'Scanner 2 - ตึกอุบัติเหตุและฉุกเฉิน (ER)',
    machineNo: 2,
    ip: '192.168.111.164',
    status: 'SUCCESS',
    recordsTotal: 280,
    recordsNew: 2,
    recordsDuplicate: 278,
    recordsPending: 2,
    durationMs: 520,
    message: 'FK_LoadGeneralLogData completed successfully (handle: 2842)'
  },
  {
    id: 3,
    timestamp: `${TODAY} 08:00:24`,
    scannerId: 3,
    scannerName: 'Scanner 3 - ตึกผู้ป่วยใน (IPD)',
    machineNo: 3,
    ip: '192.168.111.165',
    status: 'SUCCESS',
    recordsTotal: 96,
    recordsNew: 1,
    recordsDuplicate: 95,
    recordsPending: 1,
    durationMs: 380,
    message: 'FK_LoadGeneralLogData completed successfully (handle: 2843)'
  }
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 1,
    timestamp: `${YESTERDAY} 17:00:00`,
    user: 'admin.samchuk',
    action: 'PUSH_EXECUTE',
    module: 'PUSH',
    detail: 'ส่งข้อมูลเข้า hosoffice.fingle_scan จำนวน 2 รายการ สำเร็จ (Batch ID #1)',
    ipAddress: '10.1.0.45'
  },
  {
    id: 2,
    timestamp: `${TODAY} 07:15:00`,
    user: 'admin.samchuk',
    action: 'UPDATE_SHIFT',
    module: 'SHIFT',
    detail: 'ปรับปรุงเวลากะ เช้า (M) เป็น 08:15 - 16:00',
    ipAddress: '10.1.0.45'
  }
];

// Mock database query results from hosoffice (10.1.0.201)
// Query:
// SELECT HP.HR_CID, CONCAT(HF.HR_PREFIX_NAME, HP.HR_FNAME, ' ', HP.HR_LNAME) AS FULLNAME,
//   HT.HR_POSITION_NAME, HD.HR_DEPARTMENT_NAME, HDS.HR_DEPARTMENT_SUB_NAME AS HR_DEPARTMENT_SUB,
//   HPT.HR_PERSON_TYPE_NAME, HL.HR_LEVEL_NAME, HP.FINGLE_ID, HP.ID
// FROM hr_person HP ...
export const HOSOFFICE_MOCK_PERSONNEL_DATA: HosofficePersonRow[] = [
  {
    ID: 1,
    HR_CID: '3-7204-00123-45-6',
    FULLNAME: 'นพ. กิตติภูมิ นวมินทร์',
    HR_POSITION_NAME: 'นายแพทย์เชี่ยวชาญ',
    HR_LEVEL_NAME: 'เชี่ยวชาญ',
    HR_DEPARTMENT_NAME: 'กลุ่มงานการแพทย์',
    HR_DEPARTMENT_SUB: 'กลุ่มงานอายุรกรรม',
    HR_PERSON_TYPE_NAME: 'ข้าราชการ',
    FINGLE_ID: 57
  },
  {
    ID: 2,
    HR_CID: '3-7204-00234-56-7',
    FULLNAME: 'พว. นิตยา รัตนสุวรรณ',
    HR_POSITION_NAME: 'พยาบาลวิชาชีพชำนาญการ',
    HR_LEVEL_NAME: 'ชำนาญการ',
    HR_DEPARTMENT_NAME: 'กลุ่มงานการพยาบาล',
    HR_DEPARTMENT_SUB: 'งานอุบัติเหตุและฉุกเฉิน (ER)',
    HR_PERSON_TYPE_NAME: 'ข้าราชการ',
    FINGLE_ID: 102
  },
  {
    // Updated in HOSOffice: Promoted to ชำนาญการ
    ID: 3,
    HR_CID: '3-7204-00345-67-8',
    FULLNAME: 'พว. วราภรณ์ แจ่มใส',
    HR_POSITION_NAME: 'พยาบาลวิชาชีพชำนาญการ',
    HR_LEVEL_NAME: 'ชำนาญการ',
    HR_DEPARTMENT_NAME: 'กลุ่มงานการพยาบาล',
    HR_DEPARTMENT_SUB: 'งานผู้ป่วยนอก (OPD)',
    HR_PERSON_TYPE_NAME: 'พนักงานกระทรวงสาธารณสุข',
    FINGLE_ID: 114
  },
  {
    ID: 4,
    HR_CID: '3-7204-00456-78-9',
    FULLNAME: 'ภญ. กรกนก ภักดี',
    HR_POSITION_NAME: 'เภสัชกรชำนาญการ',
    HR_LEVEL_NAME: 'ชำนาญการ',
    HR_DEPARTMENT_NAME: 'กลุ่มงานเภสัชกรรม',
    HR_DEPARTMENT_SUB: 'งานบริการจ่ายยาผู้ป่วยนอก',
    HR_PERSON_TYPE_NAME: 'ข้าราชการ',
    FINGLE_ID: 201
  },
  {
    ID: 5,
    HR_CID: '3-7204-00567-89-0',
    FULLNAME: 'ทนพ. อนุชา เลิศศิริ',
    HR_POSITION_NAME: 'นักเทคนิคการแพทย์ปฏิบัติการ',
    HR_LEVEL_NAME: 'ปฏิบัติการ',
    HR_DEPARTMENT_NAME: 'กลุ่มงานเทคนิคการแพทย์',
    HR_DEPARTMENT_SUB: 'งานธนาคารเลือดและตรวจวิเคราะห์',
    HR_PERSON_TYPE_NAME: 'พนักงานกระทรวงสาธารณสุข',
    FINGLE_ID: 305
  },
  {
    // Updated in HOSOffice: Transferred to นักจัดการงานทั่วไป and new sub department
    ID: 6,
    HR_CID: '3-7204-00678-90-1',
    FULLNAME: 'นางสาว สุภาพร บุญมา',
    HR_POSITION_NAME: 'นักจัดการงานทั่วไปปฏิบัติการ',
    HR_LEVEL_NAME: 'ปฏิบัติการ',
    HR_DEPARTMENT_NAME: 'ฝ่ายบริหารทั่วไป',
    HR_DEPARTMENT_SUB: 'งานบริหารยุทธศาสตร์และบุคคล',
    HR_PERSON_TYPE_NAME: 'ข้าราชการ',
    FINGLE_ID: 410
  },
  {
    ID: 7,
    HR_CID: '3-7204-00789-01-2',
    FULLNAME: 'นาย สมชาย ทองคำ',
    HR_POSITION_NAME: 'พนักงานขับรถพยาบาล',
    HR_LEVEL_NAME: 'ลูกจ้าง',
    HR_DEPARTMENT_NAME: 'กลุ่มงานอุบัติเหตุและฉุกเฉิน',
    HR_DEPARTMENT_SUB: 'งานยานพาหนะและส่งต่อ',
    HR_PERSON_TYPE_NAME: 'ลูกจ้างประจำ/ลูกจ้างชั่วคราว',
    FINGLE_ID: 501
  },
  {
    ID: 8,
    HR_CID: '3-7204-00890-12-3',
    FULLNAME: 'นาย มานพ ปานแก้ว',
    HR_POSITION_NAME: 'พนักงานรักษาความปลอดภัย',
    HR_LEVEL_NAME: 'ลูกจ้าง',
    HR_DEPARTMENT_NAME: 'ฝ่ายบริหารทั่วไป',
    HR_DEPARTMENT_SUB: 'งานรักษาความปลอดภัย',
    HR_PERSON_TYPE_NAME: 'ลูกจ้างประจำ/ลูกจ้างชั่วคราว',
    FINGLE_ID: 502
  },
  {
    ID: 9,
    HR_CID: '3-7204-00901-23-4',
    FULLNAME: 'นาง จินตนา เพิ่มพูน',
    HR_POSITION_NAME: 'พนักงานบริการ',
    HR_LEVEL_NAME: 'ลูกจ้าง',
    HR_DEPARTMENT_NAME: 'ฝ่ายบริหารทั่วไป',
    HR_DEPARTMENT_SUB: 'งานสถานที่และแม่บ้าน',
    HR_PERSON_TYPE_NAME: 'ลูกจ้างประจำ/ลูกจ้างชั่วคราว',
    FINGLE_ID: 503
  },
  {
    // Updated in HOSOffice: Appointed as ข้าราชการ
    ID: 10,
    HR_CID: '3-7204-00012-34-5',
    FULLNAME: 'นาย ประสิทธิ์ สายสมบูรณ์',
    HR_POSITION_NAME: 'นายช่างเทคนิคปฏิบัติการ',
    HR_LEVEL_NAME: 'ปฏิบัติการ',
    HR_DEPARTMENT_NAME: 'ฝ่ายบริหารทั่วไป',
    HR_DEPARTMENT_SUB: 'งานซ่อมบำรุงและวิศวกรรมการแพทย์',
    HR_PERSON_TYPE_NAME: 'ข้าราชการ',
    FINGLE_ID: 504
  },
  {
    // NEW STAFF IN HOSOFFICE
    ID: 11,
    HR_CID: '3-7204-00199-88-1',
    FULLNAME: 'พญ. ชิดชนก สุขเกษม',
    HR_POSITION_NAME: 'นายแพทย์ปฏิบัติการ',
    HR_LEVEL_NAME: 'ปฏิบัติการ',
    HR_DEPARTMENT_NAME: 'กลุ่มงานการแพทย์',
    HR_DEPARTMENT_SUB: 'กลุ่มงานเวชปฏิบัติทั่วไป',
    HR_PERSON_TYPE_NAME: 'ข้าราชการ',
    FINGLE_ID: 110
  },
  {
    // NEW STAFF IN HOSOFFICE
    ID: 12,
    HR_CID: '3-7204-00288-77-2',
    FULLNAME: 'นาย ธนากร เมธา',
    HR_POSITION_NAME: 'นักวิชาการคอมพิวเตอร์ปฏิบัติการ',
    HR_LEVEL_NAME: 'ปฏิบัติการ',
    HR_DEPARTMENT_NAME: 'ฝ่ายบริหารทั่วไป',
    HR_DEPARTMENT_SUB: 'งานสารสนเทศและเทคโนโลยี',
    HR_PERSON_TYPE_NAME: 'พนักงานกระทรวงสาธารณสุข',
    FINGLE_ID: 412
  }
];
