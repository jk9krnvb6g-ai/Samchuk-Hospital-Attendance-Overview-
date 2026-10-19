import { Scanner, HrPerson, User, RawScan } from '../types/attendance';

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
    hrPositionName: 'เจ้าพนักงานธุรการชำนาญงาน',
    hrLevelName: 'ชำนาญงาน',
    hrDepName: 'ฝ่ายบริหารทั่วไป',
    hrDepSubName: 'งานบริหารยุทธศาสตร์และบุคคล',
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
    hrPersonTypeName: 'ลูกจ้างรายเดือน',
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
    hrPersonTypeName: 'ลูกจ้างรายวัน',
    hrPersonTypeId: 4,
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
    hrPersonTypeName: 'ลูกจ้างรายวัน',
    hrPersonTypeId: 4,
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

export const SEED_TEST_SCANS: RawScan[] = [
  // 1. นพ. กิตติภูมิ (ข้าราชการ - กะเช้า 08:15-16:00) -> เข้า 08:08, ออก 16:15 -> ผล: "ตรงเวลา"
  {
    id: 1, machineNo: 1, deviceIp: '192.168.111.163', fingleId: 57,
    scanDateTime: '2026-10-14 08:08:12', verifyMode: 1, inOutMode: 0,
    personId: 1, hrFullname: 'นพ. กิตติภูมิ นวมินทร์', hrPositionName: 'นายแพทย์เชี่ยวชาญ',
    hrDepName: 'กลุ่มงานการแพทย์', hrPersonTypeName: 'ข้าราชการ', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 08:08:20'
  },
  {
    id: 2, machineNo: 1, deviceIp: '192.168.111.163', fingleId: 57,
    scanDateTime: '2026-10-14 16:15:30', verifyMode: 1, inOutMode: 1,
    personId: 1, hrFullname: 'นพ. กิตติภูมิ นวมินทร์', hrPositionName: 'นายแพทย์เชี่ยวชาญ',
    hrDepName: 'กลุ่มงานการแพทย์', hrPersonTypeName: 'ข้าราชการ', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 16:15:35'
  },

  // 2. ภญ. กรกนก (ข้าราชการ - กะเช้า 08:15-16:00) -> เข้า 08:27, ออก 16:20 -> ผล: "สาย 12 นาที" (เกิน 08:15 ไป 12 นาที)
  {
    id: 3, machineNo: 1, deviceIp: '192.168.111.163', fingleId: 201,
    scanDateTime: '2026-10-14 08:27:00', verifyMode: 1, inOutMode: 0,
    personId: 4, hrFullname: 'ภญ. กรกนก ภักดี', hrPositionName: 'เภสัชกรชำนาญการ',
    hrDepName: 'กลุ่มงานเภสัชกรรม', hrPersonTypeName: 'ข้าราชการ', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 08:27:05'
  },
  {
    id: 4, machineNo: 1, deviceIp: '192.168.111.163', fingleId: 201,
    scanDateTime: '2026-10-14 16:20:10', verifyMode: 1, inOutMode: 1,
    personId: 4, hrFullname: 'ภญ. กรกนก ภักดี', hrPositionName: 'เภสัชกรชำนาญการ',
    hrDepName: 'กลุ่มงานเภสัชกรรม', hrPersonTypeName: 'ข้าราชการ', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 16:20:15'
  },

  // 3. พว. นิตยา (ข้าราชการ - กะบ่าย 16:00-24:00) -> เข้า 15:55, ออก 24:05 -> ผล: "ตรงเวลา"
  {
    id: 5, machineNo: 2, deviceIp: '192.168.111.164', fingleId: 102,
    scanDateTime: '2026-10-14 15:55:20', verifyMode: 1, inOutMode: 0,
    personId: 2, hrFullname: 'พว. นิตยา รัตนสุวรรณ', hrPositionName: 'พยาบาลวิชาชีพชำนาญการ',
    hrDepName: 'กลุ่มงานการพยาบาล', hrPersonTypeName: 'ข้าราชการ', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 15:55:25'
  },
  {
    id: 6, machineNo: 2, deviceIp: '192.168.111.164', fingleId: 102,
    scanDateTime: '2026-10-14 24:05:00', verifyMode: 1, inOutMode: 1,
    personId: 2, hrFullname: 'พว. นิตยา รัตนสุวรรณ', hrPositionName: 'พยาบาลวิชาชีพชำนาญการ',
    hrDepName: 'กลุ่มงานการพยาบาล', hrPersonTypeName: 'ข้าราชการ', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 24:05:10'
  },

  // 4. พว. วราภรณ์ (พนักงานกระทรวง พกส. - กะบ่าย 16:00-24:00) -> เข้า 16:18, ออก 24:10 -> ผล: "สาย 18 นาที" (เกิน 16:00 ไป 18 นาที)
  {
    id: 7, machineNo: 2, deviceIp: '192.168.111.164', fingleId: 114,
    scanDateTime: '2026-10-14 16:18:40', verifyMode: 1, inOutMode: 0,
    personId: 3, hrFullname: 'พว. วราภรณ์ แจ่มใส', hrPositionName: 'พยาบาลวิชาชีพปฏิบัติการ',
    hrDepName: 'กลุ่มงานการพยาบาล', hrPersonTypeName: 'พนักงานกระทรวงสาธารณสุข', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 16:18:45'
  },
  {
    id: 8, machineNo: 2, deviceIp: '192.168.111.164', fingleId: 114,
    scanDateTime: '2026-10-14 24:10:15', verifyMode: 1, inOutMode: 1,
    personId: 3, hrFullname: 'พว. วราภรณ์ แจ่มใส', hrPositionName: 'พยาบาลวิชาชีพปฏิบัติการ',
    hrDepName: 'กลุ่มงานการพยาบาล', hrPersonTypeName: 'พนักงานกระทรวงสาธารณสุข', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 24:10:20'
  },

  // 5. ทนพ. อนุชา (พนักงานกระทรวง พกส. - กะดึก 24:00-08:00) -> เข้า 00:00, ออก 08:02 -> ผล: "ตรงเวลา"
  {
    id: 9, machineNo: 2, deviceIp: '192.168.111.164', fingleId: 305,
    scanDateTime: '2026-10-14 00:00:10', verifyMode: 1, inOutMode: 0,
    personId: 5, hrFullname: 'ทนพ. อนุชา เลิศศิริ', hrPositionName: 'นักเทคนิคการแพทย์ปฏิบัติการ',
    hrDepName: 'กลุ่มงานเทคนิคการแพทย์', hrPersonTypeName: 'พนักงานกระทรวงสาธารณสุข', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 00:00:15'
  },
  {
    id: 10, machineNo: 2, deviceIp: '192.168.111.164', fingleId: 305,
    scanDateTime: '2026-10-14 08:02:40', verifyMode: 1, inOutMode: 1,
    personId: 5, hrFullname: 'ทนพ. อนุชา เลิศศิริ', hrPositionName: 'นักเทคนิคการแพทย์ปฏิบัติการ',
    hrDepName: 'กลุ่มงานเทคนิคการแพทย์', hrPersonTypeName: 'พนักงานกระทรวงสาธารณสุข', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 08:02:45'
  },

  // 6. นาย มานพ ปานแก้ว (ลูกจ้างรายวัน - กะเช้า 07:30-16:00) -> เข้า 07:22, ออก 16:05 -> ผล: "ตรงเวลา" (เข้าก่อน 07:30)
  {
    id: 11, machineNo: 1, deviceIp: '192.168.111.163', fingleId: 502,
    scanDateTime: '2026-10-14 07:22:15', verifyMode: 1, inOutMode: 0,
    personId: 8, hrFullname: 'นาย มานพ ปานแก้ว', hrPositionName: 'พนักงานรักษาความปลอดภัย',
    hrDepName: 'ฝ่ายบริหารทั่วไป', hrPersonTypeName: 'ลูกจ้างรายวัน', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 07:22:20'
  },
  {
    id: 12, machineNo: 1, deviceIp: '192.168.111.163', fingleId: 502,
    scanDateTime: '2026-10-14 16:05:00', verifyMode: 1, inOutMode: 1,
    personId: 8, hrFullname: 'นาย มานพ ปานแก้ว', hrPositionName: 'พนักงานรักษาความปลอดภัย',
    hrDepName: 'ฝ่ายบริหารทั่วไป', hrPersonTypeName: 'ลูกจ้างรายวัน', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 16:05:05'
  },

  // 7. นาง จินตนา เพิ่มพูน (ลูกจ้างรายวัน - กะเช้า 07:30-16:00) -> เข้า 07:44, ออก 16:02 -> ผล: "สาย 14 นาที" (เกิน 07:30 ไป 14 นาที)
  {
    id: 13, machineNo: 1, deviceIp: '192.168.111.163', fingleId: 503,
    scanDateTime: '2026-10-14 07:44:30', verifyMode: 1, inOutMode: 0,
    personId: 9, hrFullname: 'นาง จินตนา เพิ่มพูน', hrPositionName: 'พนักงานบริการ',
    hrDepName: 'ฝ่ายบริหารทั่วไป', hrPersonTypeName: 'ลูกจ้างรายวัน', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 07:44:35'
  },
  {
    id: 14, machineNo: 1, deviceIp: '192.168.111.163', fingleId: 503,
    scanDateTime: '2026-10-14 16:02:10', verifyMode: 1, inOutMode: 1,
    personId: 9, hrFullname: 'นาง จินตนา เพิ่มพูน', hrPositionName: 'พนักงานบริการ',
    hrDepName: 'ฝ่ายบริหารทั่วไป', hrPersonTypeName: 'ลูกจ้างรายวัน', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 16:02:15'
  },

  // 8. นาย สมชาย ทองคำ (ลูกจ้างรายเดือน - กะเช้า 07:30-16:00) -> เข้า 07:28, ออก 16:08 -> ผล: "ตรงเวลา"
  {
    id: 15, machineNo: 2, deviceIp: '192.168.111.164', fingleId: 501,
    scanDateTime: '2026-10-14 07:28:45', verifyMode: 1, inOutMode: 0,
    personId: 7, hrFullname: 'นาย สมชาย ทองคำ', hrPositionName: 'พนักงานขับรถพยาบาล',
    hrDepName: 'กลุ่มงานอุบัติเหตุและฉุกเฉิน', hrPersonTypeName: 'ลูกจ้างรายเดือน', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 07:28:50'
  },
  {
    id: 16, machineNo: 2, deviceIp: '192.168.111.164', fingleId: 501,
    scanDateTime: '2026-10-14 16:08:20', verifyMode: 1, inOutMode: 1,
    personId: 7, hrFullname: 'นาย สมชาย ทองคำ', hrPositionName: 'พนักงานขับรถพยาบาล',
    hrDepName: 'กลุ่มงานอุบัติเหตุและฉุกเฉิน', hrPersonTypeName: 'ลูกจ้างรายเดือน', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 16:08:25'
  },

  // 9. นางสาว สุภาพร บุญมา (ข้าราชการ - กะเช้า 08:15-16:00) -> เข้า 08:12, ไม่มีสแกนออก -> ผล: "สแกนเข้าอย่างเดียว (IN_ONLY)"
  {
    id: 17, machineNo: 1, deviceIp: '192.168.111.163', fingleId: 410,
    scanDateTime: '2026-10-14 08:12:00', verifyMode: 1, inOutMode: 0,
    personId: 6, hrFullname: 'นางสาว สุภาพร บุญมา', hrPositionName: 'เจ้าพนักงานธุรการชำนาญงาน',
    hrDepName: 'ฝ่ายบริหารทั่วไป', hrPersonTypeName: 'ข้าราชการ', hrMapped: true,
    pushStatus: 'PENDING', receivedAt: '2026-10-14 08:12:05'
  }
];
