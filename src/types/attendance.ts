export type PushStatus = 'PENDING' | 'PUSHED' | 'SKIPPED_EXISTS' | 'FAILED' | 'EXCLUDED';

export type UserRole = 'ADMIN' | 'USER';

export interface User {
  id: number;
  username: string;
  fullname: string;
  role: UserRole;
  department: string;
  email: string;
  personId?: number; // linked HR person
}

export interface Scanner {
  id: number;
  machineNo: number;
  name: string;
  ip: string;
  port: number;
  model: string;
  serial: string;
  password: string;
  enabled: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
  lastSync?: string;
  lastError?: string;
  syncIntervalSec: number;
  totalLoadedRecords: number;
}

export interface Shift {
  id: number;
  shiftCode: string; // M, A, N, MA, etc.
  shiftName: string; // เช้า, บ่าย, ดึก, เช้าควบบ่าย
  startTime: string; // "08:15"
  endTime: string; // "16:00"
  crossesMidnight: boolean;
  workDateBasis: 'START_DATE' | 'END_DATE';
  lateGraceMinutes: number; // e.g. 0 or 15
  inWindowBeforeMin: number; // e.g. 120
  outWindowAfterMin: number; // e.g. 120
  earlyLeaveMin: number;
  duplicateScanMin: number; // e.g. 5 min
  color: string; // Hex color code
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  isSystemDefault?: boolean;
}

export interface ShiftTimeConfig {
  startTime: string; // e.g. "08:15"
  endTime: string;   // e.g. "16:00"
  lateGraceMinutes: number; // e.g. 0
}

export interface PersonnelTypeConfig {
  id: number;
  name: string; // e.g. 'ข้าราชการ', 'พนักงานกระทรวงสาธารณสุข', 'ลูกจ้างรายวัน'
  code?: string;
  description?: string;
  morningShift: ShiftTimeConfig;   // กะเช้า
  afternoonShift: ShiftTimeConfig; // กะบ่าย
  nightShift: ShiftTimeConfig;     // กะดึก
  isActive: boolean;
  memberCount?: number;
}

export interface RawScan {
  id: number;
  machineNo: number;
  deviceIp: string;
  fingleId: number;
  scanDateTime: string; // YYYY-MM-DD HH:mm:ss in Gregorian (A.D.)
  verifyMode: number;
  inOutMode: number;
  source?: string; // 'DEVICE' | 'IMPORT' | 'MANUAL'
  
  // HR Snapshot from hosoffice.hr_person
  personId?: number;
  hrFullname?: string;
  hrPositionName?: string;
  hrLeavelName?: string;
  hrDepName?: string;
  hrDepSubName?: string;
  hrPersonTypeName?: string;
  hrPersonTypeId?: number;
  hrDepartmentId?: number;
  hrDepartmentSubId?: number;
  hrMapped: boolean;

  // hosoffice push status
  pushStatus: PushStatus;
  pushedAt?: string;
  pushedBy?: number;
  pushBatchId?: number;
  pushError?: string;
  receivedAt: string; // Time pulled into attendance DB
}

export interface HosFingleScan {
  id: number;
  personId?: number;
  fingleId: number;
  scanDateTime: string;
  scanDate: string;
  scanTime: string;
  dayTypeId: number;
  dayTypeName: string;
  hrFullname?: string;
  hrPositionName?: string;
  hrLeavelName?: string;
  hrDepName?: string;
  hrDepSubName?: string;
  hrPersonTypeName?: string;
  hrPersonTypeId?: number;
  hrDepartmentId?: number;
  hrDepartmentSubId?: number;
  machinId: number;
  appTypeSave: string; // 'SCAN'
  scanSource: string; // 'FINGER'
  isConfirm: boolean;
  isInput: string; // 'SIGN'
  dateTimeSave: string; // Actual push execution timestamp
  createBy: string; // 'SCAN_SYNC' or 'SCAN_PUSH'
}

export interface PushBatch {
  id: number;
  requestedBy: string;
  requestedAt: string;
  filterDateFrom?: string;
  filterDateTo?: string;
  filterMachineNo?: number;
  totalSelected: number;
  totalInserted: number;
  totalSkippedExists: number;
  totalFailed: number;
  status: 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
  finishedAt?: string;
  errorMessage?: string;
}

export interface DailyResult {
  id: number;
  personId: number;
  fingleId: number;
  fullname: string;
  department: string;
  position: string;
  workDate: string; // YYYY-MM-DD
  personnelTypeName?: string;
  shiftId?: number;
  shiftCode?: string;
  shiftName?: string;
  plannedStartTime?: string;
  plannedEndTime?: string;
  resolutionSource: 'PERSONNEL_TYPE' | 'SYSTEM_DEFAULT' | 'NONE';
  inTime?: string;
  outTime?: string;
  status: 'ON_TIME' | 'LATE' | 'EARLY_LEAVE' | 'LATE_AND_EARLY' | 'NO_SCAN' | 'NO_SHIFT' | 'IN_ONLY' | 'OUT_ONLY';
  lateMinutes: number;
  earlyMinutes: number;
  otMinutes: number;
  scansCount: number;
  rawScanIds: number[];
  calculatedAt: string;
}

export interface SyncLog {
  id: number;
  timestamp: string;
  scannerId: number;
  scannerName: string;
  machineNo: number;
  ip: string;
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
  recordsTotal: number;
  recordsNew: number;
  recordsDuplicate: number;
  recordsPending: number;
  durationMs: number;
  message?: string;
}

export interface AuditLog {
  id: number;
  timestamp: string;
  user: string;
  action: string;
  module: 'AUTH' | 'PUSH' | 'SHIFT' | 'SCANNER' | 'ATTENDANCE';
  detail: string;
  ipAddress?: string;
}

export interface HrPerson {
  personId: number; // HP.ID
  hrCid: string; // HP.HR_CID (เลขประจำตัวประชาชน 13 หลัก)
  fingleId: number; // HP.FINGLE_ID
  hrFullname: string; // CONCAT(HF.HR_PREFIX_NAME, HP.HR_FNAME, ' ', HP.HR_LNAME) AS FULLNAME
  hrPositionName: string; // HT.HR_POSITION_NAME
  hrLevelName: string; // HL.HR_LEVEL_NAME
  hrDepName: string; // HD.HR_DEPARTMENT_NAME
  hrDepSubName: string; // HDS.HR_DEPARTMENT_SUB_NAME AS HR_DEPARTMENT_SUB
  hrPersonTypeName: string; // HPT.HR_PERSON_TYPE_NAME
  hrPersonTypeId?: number;
  hrDepartmentId?: number;
  hrDepartmentSubId?: number;
  phone?: string;
  status: 'ACTIVE' | 'INACTIVE';
  hrStatusId?: string | number; // HP.HR_STATUS_ID เช่น '01'
  hrStatusName?: string; // HS.HR_STATUS_NAME เช่น 'ปฏิบัติราชการ'
}

export interface HosofficePersonRow {
  ID: number;
  HR_CID: string;
  FULLNAME: string;
  HR_POSITION_NAME: string;
  HR_DEPARTMENT_NAME: string;
  HR_DEPARTMENT_SUB: string;
  HR_PERSON_TYPE_NAME: string;
  HR_LEVEL_NAME: string;
  FINGLE_ID?: number;
  HR_STATUS_ID?: string | number;
  HR_STATUS_NAME?: string;
}

export interface PersonnelFieldChange {
  field: 'FULLNAME' | 'HR_POSITION_NAME' | 'HR_LEVEL_NAME' | 'HR_DEPARTMENT_SUB' | 'HR_PERSON_TYPE_NAME' | 'HR_STATUS_NAME';
  label: string;
  oldValue: string;
  newValue: string;
}

export interface PersonnelUpdateRecord {
  personId: number;
  fingleId: number;
  fullname: string;
  changes: PersonnelFieldChange[];
}

export interface PersonnelSyncResult {
  totalFromHosoffice: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  inserted: HrPerson[];
  updated: PersonnelUpdateRecord[];
  skipped: { personId: number; fullname: string; fingleId: number; reason: string }[];
  syncedAt: string;
}

export interface ShiftResolution {
  shift?: Shift;
  startTime: string;
  endTime: string;
  lateGraceMinutes: number;
  source: 'PERSONNEL_TYPE' | 'SYSTEM_DEFAULT' | 'NONE';
  note?: string;
}
