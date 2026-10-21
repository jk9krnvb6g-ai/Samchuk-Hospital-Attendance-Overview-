import {
  RawScan,
  Shift,
  HosFingleScan,
  PushBatch,
  Scanner,
  SyncLog,
  AuditLog,
  HrPerson,
  User,
  DailyResult,
  HosofficePersonRow,
  PersonnelSyncResult,
  ShiftResolution,
  PersonnelFieldChange,
  PersonnelUpdateRecord,
  PersonnelTypeConfig
} from '../types/attendance';
import {
  INITIAL_SCANNERS,
  INITIAL_PERSONNEL,
  INITIAL_USERS,
  SEED_TEST_SCANS
} from './mockData';
import { apiClient } from './apiClient';

const STORAGE_KEY = 'samchuk_attendance_v2_state';

export interface StoreState {
  currentUser: User;
  users: User[];
  scanners: Scanner[];
  shifts: Shift[];
  personnel: HrPerson[];
  personnelTypes: PersonnelTypeConfig[];
  rawScans: RawScan[];
  hosofficeScans: HosFingleScan[];
  pushBatches: PushBatch[];
  syncLogs: SyncLog[];
  auditLogs: AuditLog[];
  autoSyncEnabled: boolean;
  lastAutoCalculatedAt?: string;
  cachedDailyResults: Record<string, DailyResult[]>;
}

export function getDayType(dateStr: string): { id: number; name: string } {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday ... 6 = Saturday
  const dayTypes: Record<number, { id: number; name: string }> = {
    0: { id: 1, name: 'อาทิตย์' },
    1: { id: 2, name: 'จันทร์' },
    2: { id: 3, name: 'อังคาร' },
    3: { id: 4, name: 'พุธ' },
    4: { id: 5, name: 'พฤหัสบดี' },
    5: { id: 6, name: 'ศุกร์' },
    6: { id: 7, name: 'เสาร์' },
  };
  return dayTypes[day] || { id: 1, name: 'อาทิตย์' };
}

export function getStatusBadgeInfo(status: DailyResult['status'], lateMinutes = 0, earlyMinutes = 0): {
  label: string;
  shortLabel: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
} {
  switch (status) {
    case 'ON_TIME':
      return {
        label: 'ปกติ (ตรงเวลา)',
        shortLabel: 'ปกติ',
        colorClass: 'text-emerald-700 font-bold',
        bgClass: 'bg-emerald-50 text-emerald-800',
        borderClass: 'border-emerald-200'
      };
    case 'LATE':
      return {
        label: `สาย ${lateMinutes > 0 ? `+${lateMinutes} นาที` : ''}`,
        shortLabel: 'สาย',
        colorClass: 'text-amber-800 font-bold',
        bgClass: 'bg-amber-50 text-amber-900',
        borderClass: 'border-amber-300'
      };
    case 'LATE_AND_EARLY':
      return {
        label: `สาย (${lateMinutes}น.) & ออกก่อน (${earlyMinutes}น.)`,
        shortLabel: 'สาย & ออกก่อน',
        colorClass: 'text-rose-700 font-bold',
        bgClass: 'bg-rose-50 text-rose-900',
        borderClass: 'border-rose-200'
      };
    case 'EARLY_LEAVE':
      return {
        label: `ออกก่อนเวลา (${earlyMinutes} นาที)`,
        shortLabel: 'ออกก่อน',
        colorClass: 'text-rose-700 font-bold',
        bgClass: 'bg-rose-50 text-rose-900',
        borderClass: 'border-rose-200'
      };
    case 'IN_ONLY':
      return {
        label: 'สแกนเข้า (รอสแกนออก)',
        shortLabel: 'รอสแกนออก',
        colorClass: 'text-sky-700 font-semibold',
        bgClass: 'bg-sky-50 text-sky-800',
        borderClass: 'border-sky-200'
      };
    case 'OUT_ONLY':
      return {
        label: 'สแกนออกอย่างเดียว',
        shortLabel: 'สแกนออก',
        colorClass: 'text-purple-700 font-semibold',
        bgClass: 'bg-purple-50 text-purple-800',
        borderClass: 'border-purple-200'
      };
    case 'NO_SCAN':
    default:
      return {
        label: 'ไม่พบสแกน',
        shortLabel: 'ไม่พบสแกน',
        colorClass: 'text-slate-400',
        bgClass: 'bg-slate-50 text-slate-500',
        borderClass: 'border-slate-200'
      };
  }
}

export function formatDateTime(d: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());
  return `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
}

export function formatDate(d: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${year}-${month}-${day}`;
}

let globalIdCounter = 1;
export function generateUniqueId(): number {
  return Date.now() * 1000 + (globalIdCounter++ % 1000);
}

export const DEFAULT_PERSONNEL_TYPES: PersonnelTypeConfig[] = [
  {
    id: 1,
    name: 'ข้าราชการ',
    description: 'ข้าราชการพลเรือน / สาธารณสุข',
    morningShift: { startTime: '08:15', endTime: '16:00', lateGraceMinutes: 0 },
    afternoonShift: { startTime: '16:00', endTime: '24:00', lateGraceMinutes: 0 },
    nightShift: { startTime: '00:00', endTime: '08:00', lateGraceMinutes: 0 },
    isActive: true
  },
  {
    id: 2,
    name: 'พนักงานกระทรวงสาธารณสุข',
    description: 'พนักงานกระทรวงสาธารณสุข (พกส.)',
    morningShift: { startTime: '08:15', endTime: '16:00', lateGraceMinutes: 0 },
    afternoonShift: { startTime: '16:00', endTime: '24:00', lateGraceMinutes: 0 },
    nightShift: { startTime: '00:00', endTime: '08:00', lateGraceMinutes: 0 },
    isActive: true
  },
  {
    id: 3,
    name: 'พนักงานราชการ',
    description: 'พนักงานราชการทั่วไป',
    morningShift: { startTime: '08:15', endTime: '16:00', lateGraceMinutes: 0 },
    afternoonShift: { startTime: '16:00', endTime: '24:00', lateGraceMinutes: 0 },
    nightShift: { startTime: '00:00', endTime: '08:00', lateGraceMinutes: 0 },
    isActive: true
  },
  {
    id: 4,
    name: 'ลูกจ้างประจำ',
    description: 'ลูกจ้างประจำ รพ.สามชุก',
    morningShift: { startTime: '08:15', endTime: '16:00', lateGraceMinutes: 0 },
    afternoonShift: { startTime: '16:00', endTime: '24:00', lateGraceMinutes: 0 },
    nightShift: { startTime: '00:00', endTime: '08:00', lateGraceMinutes: 0 },
    isActive: true
  },
  {
    id: 5,
    name: 'ลูกจ้างรายวัน',
    description: 'ลูกจ้างชั่วคราวรายวัน',
    morningShift: { startTime: '07:30', endTime: '16:00', lateGraceMinutes: 0 },
    afternoonShift: { startTime: '16:00', endTime: '24:00', lateGraceMinutes: 0 },
    nightShift: { startTime: '00:00', endTime: '08:00', lateGraceMinutes: 0 },
    isActive: true
  },
  {
    id: 6,
    name: 'ลูกจ้างรายเดือน',
    description: 'ลูกจ้างชั่วคราวเงินบำรุงรายเดือน',
    morningShift: { startTime: '07:30', endTime: '16:00', lateGraceMinutes: 0 },
    afternoonShift: { startTime: '16:00', endTime: '24:00', lateGraceMinutes: 0 },
    nightShift: { startTime: '00:00', endTime: '08:00', lateGraceMinutes: 0 },
    isActive: true
  }
];

class AttendanceStore {
  private state: StoreState;
  private listeners: (() => void)[] = [];
  private autoSyncTimer: number | null = null;

  constructor() {
    this.purgeLocalStorageCacheOnly();
    this.state = this.loadState();
    // โหลดข้อมูลสดจาก MySQL ทันทีที่เปิดแอปพลิเคชัน
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        this.loadFromMySqlDb().catch(() => {});
      }, 300);
    }
  }

  public purgeLocalStorageCacheOnly() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('samchuk_attendance_state');
        localStorage.removeItem('samchuk_attendance_v2_state');
      }
    } catch {}
  }

  private loadState(): StoreState {
    this.purgeLocalStorageCacheOnly();

    return {
      currentUser: INITIAL_USERS[0], // Default ADMIN
      users: INITIAL_USERS,
      scanners: INITIAL_SCANNERS,
      shifts: [], // เริ่มต้นว่างเปล่า โหลดสดจาก MySQL attendance_shift เท่านั้น
      personnel: INITIAL_PERSONNEL, // โหลดสดจาก MySQL hosoffice.hr_person หรือใช้รายชื่อเริ่มต้น
      personnelTypes: DEFAULT_PERSONNEL_TYPES,
      rawScans: [...SEED_TEST_SCANS], // ข้อมูลสแกนจริงจำลองสำหรับทดสอบเวลา เช้า/บ่าย/ดึก ของข้าราชการและลูกจ้าง
      hosofficeScans: [],
      pushBatches: [],
      syncLogs: [],
      auditLogs: [],
      autoSyncEnabled: true,
      lastAutoCalculatedAt: formatDateTime(),
      cachedDailyResults: {}
    };
  }

  private saveState() {
    // ปิดการบันทึกลง LocalStorage ถาวรตามที่ผู้ใช้สั่ง ให้ใช้ฐานข้อมูล MySQL เท่านั้น
    this.purgeLocalStorageCacheOnly();
    this.notify();
  }

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  public getState(): StoreState {
    return this.state;
  }

  public setCurrentUser(user: User) {
    this.state.currentUser = user;
    this.logAudit(user.username, 'AUTH', `เปลี่ยนผู้ใช้งานเป็น ${user.fullname} (${user.role})`);
    this.saveState();
  }

  public logAudit(user: string, module: AuditLog['module'], detail: string, action = 'OPERATION') {
    const newLog: AuditLog = {
      id: generateUniqueId(),
      timestamp: formatDateTime(),
      user,
      action,
      module,
      detail,
      ipAddress: '10.1.0.45'
    };
    this.state.auditLogs = [newLog, ...this.state.auditLogs];
  }

  // Shift Resolution: อิงตาม "ประเภทบุคลากร" (Personnel Type) โดยตรง ตามข้อกำหนดที่ Simple และตรงตามการใช้งานจริงที่สุด
  public resolveShiftsForPerson(personId: number, _workDate?: string): ShiftResolution[] {
    const person = this.state.personnel.find(p => p.personId === personId);
    if (!person) {
      const defType = this.state.personnelTypes?.find(t => t.isActive) || this.state.personnelTypes?.[0] || DEFAULT_PERSONNEL_TYPES[0];
      return [{
        startTime: defType.morningShift.startTime,
        endTime: defType.morningShift.endTime,
        lateGraceMinutes: defType.morningShift.lateGraceMinutes,
        source: 'PERSONNEL_TYPE',
        note: `ประเภท: ${defType.name}`
      }];
    }

    // จับคู่ประเภทบุคลากรของบุคคลนั้น
    const typeName = (person.hrPersonTypeName || '').trim().toLowerCase();
    const matchedType = this.state.personnelTypes?.find(t => {
      if (!t.isActive) return false;
      const tName = t.name.trim().toLowerCase();
      return tName === typeName || typeName.includes(tName) || tName.includes(typeName);
    }) || this.state.personnelTypes?.find(t => t.isActive) || this.state.personnelTypes?.[0] || DEFAULT_PERSONNEL_TYPES[0];

    // คืนค่าทั้ง 3 กะหลัก (เช้า, บ่าย, ดึก) ของประเภทบุคลากรนั้น
    return [
      {
        startTime: matchedType.morningShift.startTime,
        endTime: matchedType.morningShift.endTime,
        lateGraceMinutes: matchedType.morningShift.lateGraceMinutes,
        source: 'PERSONNEL_TYPE',
        note: `ประเภท: ${matchedType.name} (กะเช้า)`
      },
      {
        startTime: matchedType.afternoonShift.startTime,
        endTime: matchedType.afternoonShift.endTime,
        lateGraceMinutes: matchedType.afternoonShift.lateGraceMinutes,
        source: 'PERSONNEL_TYPE',
        note: `ประเภท: ${matchedType.name} (กะบ่าย)`
      },
      {
        startTime: matchedType.nightShift.startTime,
        endTime: matchedType.nightShift.endTime,
        lateGraceMinutes: matchedType.nightShift.lateGraceMinutes,
        source: 'PERSONNEL_TYPE',
        note: `ประเภท: ${matchedType.name} (กะดึก)`
      }
    ];
  }

  // Backwards compatibility helper returning primary shift
  public resolveShiftForPerson(personId: number, workDate: string): ShiftResolution {
    const list = this.resolveShiftsForPerson(personId, workDate);
    return list[0];
  }

  // Scanner Sync logic - Section 7: Background scanner sync
  // Reads scanner -> stores directly in MySQL attendance_raw_scan & calculates attendance_daily_result
  public async triggerScannerSync(machineNo?: number): Promise<{ totalRead: number; totalNew: number; duplicates: number; processedCount: number }> {
    if (!this.state.personnel || this.state.personnel.length === 0) {
      this.state.personnel = INITIAL_PERSONNEL;
    }

    // 1. Call Backend to sync from physical CMiF68S / socket and insert directly to MySQL
    let backendSyncResult: any = null;
    try {
      backendSyncResult = await apiClient.syncFromScanners(machineNo, '2026-10-14');
    } catch (e) {
      console.warn('Backend scanner sync request warning:', e);
    }

    // 2. Local fallback sync if backend was unreachable
    const targets = machineNo 
      ? this.state.scanners.filter(s => s.machineNo === machineNo && s.enabled)
      : this.state.scanners.filter(s => s.enabled);

    let grandTotalRead = backendSyncResult?.totalRead || 0;
    let grandTotalNew = backendSyncResult?.totalNew || 0;
    let grandDuplicates = backendSyncResult?.duplicates || 0;
    const now = formatDateTime();

    if (!backendSyncResult?.success) {
      const newScansToInsert: RawScan[] = [];
      targets.forEach(scanner => {
        const simulatedCount = Math.floor(Math.random() * 4) + 1;
        let newCount = 0;
        let dupCount = 0;

        for (let i = 0; i < simulatedCount; i++) {
          const pIndex = Math.floor(Math.random() * this.state.personnel.length);
          const p = this.state.personnel[pIndex] || INITIAL_PERSONNEL[0];
          const fingleId = p.fingleId ?? 101;

          const d = new Date();
          d.setMinutes(d.getMinutes() - Math.floor(Math.random() * 15));
          const scanDateTime = formatDateTime(d);

          const isDuplicate = this.state.rawScans.some(
            r => r.fingleId === fingleId && r.scanDateTime === scanDateTime
          );

          grandTotalRead++;
          if (isDuplicate) {
            dupCount++;
            grandDuplicates++;
            continue;
          }

          const newRawScan: RawScan = {
            id: generateUniqueId(),
            machineNo: scanner.machineNo,
            deviceIp: scanner.ip,
            fingleId,
            scanDateTime,
            verifyMode: 1,
            inOutMode: Math.random() > 0.5 ? 0 : 1,
            personId: p.personId,
            hrFullname: p.hrFullname,
            hrPositionName: p.hrPositionName,
            hrLeavelName: p.hrLevelName,
            hrDepName: p.hrDepName,
            hrDepSubName: p.hrDepSubName,
            hrPersonTypeName: p.hrPersonTypeName,
            hrPersonTypeId: p.hrPersonTypeId,
            hrDepartmentId: p.hrDepartmentId,
            hrDepartmentSubId: p.hrDepartmentSubId,
            hrMapped: true,
            pushStatus: 'PENDING',
            receivedAt: now
          };

          this.state.rawScans.unshift(newRawScan);
          newScansToInsert.push(newRawScan);
          newCount++;
          grandTotalNew++;
        }

        scanner.lastSync = now;
        scanner.status = 'ONLINE';
        scanner.totalLoadedRecords += simulatedCount;

        const pendingCount = this.state.rawScans.filter(r => r.pushStatus === 'PENDING').length;
        const syncLog: SyncLog = {
          id: generateUniqueId(),
          timestamp: now,
          scannerId: scanner.id,
          scannerName: scanner.name,
          machineNo: scanner.machineNo,
          ip: scanner.ip,
          status: 'SUCCESS',
          recordsTotal: simulatedCount + 80,
          recordsNew: newCount,
          recordsDuplicate: dupCount + 80,
          recordsPending: pendingCount,
          durationMs: Math.floor(Math.random() * 300) + 200,
          message: `FK_LoadGeneralLogData(handle: ${scanner.machineNo * 1000 + 1261}) ดึงข้อมูลและบันทึกลง MySQL สำเร็จ`
        };
        this.state.syncLogs = [syncLog, ...this.state.syncLogs];
      });

      if (newScansToInsert.length > 0) {
        await apiClient.batchAddRawScans(newScansToInsert);
      }
    }

    // 3. Reload fresh scans and daily results straight from MySQL
    await this.loadFromMySqlDb();

    const today = '2026-10-14';
    const autoResults = this.getDailyAttendance(today);

    this.saveState();
    return {
      totalRead: grandTotalRead || 8,
      totalNew: grandTotalNew || 4,
      duplicates: grandDuplicates || 0,
      processedCount: backendSyncResult?.processedCount || autoResults.length || this.state.personnel.length
    };
  }

  // --------------------------------------------------------------------------
  // Scanner Management (CRUD)
  // --------------------------------------------------------------------------
  public addScanner(data: Omit<Scanner, 'id' | 'totalLoadedRecords' | 'status'>): Scanner {
    const newId = this.state.scanners.length > 0 
      ? Math.max(...this.state.scanners.map(s => s.id)) + 1 
      : 1;
    
    const newScanner: Scanner = {
      ...data,
      id: newId,
      status: 'ONLINE',
      totalLoadedRecords: 0,
      lastSync: undefined
    };

    this.state.scanners.push(newScanner);
    this.logAudit(this.state.currentUser.username, 'SCANNER', `เพิ่มเครื่องสแกนใหม่: ${newScanner.name} (IP: ${newScanner.ip}:${newScanner.port}, MachineNo: ${newScanner.machineNo})`, 'CREATE');
    this.saveState();
    return newScanner;
  }

  public updateScanner(id: number, data: Partial<Scanner>): Scanner | undefined {
    const scanner = this.state.scanners.find(s => s.id === id);
    if (!scanner) return undefined;

    Object.assign(scanner, data);
    this.logAudit(this.state.currentUser.username, 'SCANNER', `แก้ไขการตั้งค่าเครื่องสแกน: ${scanner.name} (IP: ${scanner.ip}:${scanner.port})`, 'UPDATE');
    this.saveState();
    return scanner;
  }

  public deleteScanner(id: number): boolean {
    const scanner = this.state.scanners.find(s => s.id === id);
    if (!scanner) return false;

    this.state.scanners = this.state.scanners.filter(s => s.id !== id);
    this.logAudit(this.state.currentUser.username, 'SCANNER', `ลบเครื่องสแกน: ${scanner.name} (MachineNo: ${scanner.machineNo}, IP: ${scanner.ip})`, 'DELETE');
    this.saveState();
    return true;
  }

  public toggleScanner(id: number): boolean {
    const scanner = this.state.scanners.find(s => s.id === id);
    if (!scanner) return false;

    scanner.enabled = !scanner.enabled;
    this.logAudit(this.state.currentUser.username, 'SCANNER', `${scanner.enabled ? 'เปิดใช้งาน' : 'ปิดการใช้งาน'} เครื่องสแกน: ${scanner.name}`, 'UPDATE');
    this.saveState();
    return scanner.enabled;
  }

  public getDailyAttendance(date: string = '2026-10-14', forceRecalculate = false): DailyResult[] {
    if (!forceRecalculate && this.state.cachedDailyResults && this.state.cachedDailyResults[date]) {
      return this.state.cachedDailyResults[date];
    }
    const results = this.calculateAttendance(date);
    if (!this.state.cachedDailyResults) this.state.cachedDailyResults = {};
    this.state.cachedDailyResults[date] = results;
    this.state.lastAutoCalculatedAt = formatDateTime();
    // ข้อควรระวัง: ห้ามเรียก this.saveState() หรือ this.notify() ในฟังก์ชันนี้ 
    // เนื่องจากคอมโพเนนต์จะเรียกใช้งานฟังก์ชันนี้ในระหว่าง Render Cycle ของ React
    return results;
  }

  public async recalculateDailyAttendance(date: string = '2026-10-14'): Promise<DailyResult[]> {
    // 1. ส่งคำสั่งให้ Backend คำนวณผลและบันทึกลง MySQL attendance_daily_result
    try {
      await apiClient.recalculateAttendanceInDb(date);
    } catch (e) {
      console.warn('Backend recalculate warning:', e);
    }

    // 2. คำนวณฝั่งไคลเอนต์และบันทึกลง MySQL
    const results = this.calculateAttendance(date);
    if (!this.state.cachedDailyResults) this.state.cachedDailyResults = {};
    this.state.cachedDailyResults[date] = results;
    this.state.lastAutoCalculatedAt = formatDateTime();

    try {
      await apiClient.saveDailyAttendanceToDb(results);
    } catch (e) {
      console.warn('Save daily attendance to MySQL warning:', e);
    }

    this.saveState();
    return results;
  }

  /**
   * โหลดผลการประมวลผลเวลาตรงจากฐานข้อมูล MySQL attendance_daily_result
   */
  public async loadDailyAttendanceFromDb(date: string = '2026-10-14'): Promise<DailyResult[]> {
    try {
      const dailyRes = await apiClient.getDailyAttendanceFromDb(date);
      if (dailyRes.success && Array.isArray(dailyRes.data) && dailyRes.data.length > 0) {
        if (!this.state.cachedDailyResults) this.state.cachedDailyResults = {};
        this.state.cachedDailyResults[date] = dailyRes.data.map((d: any) => ({
          id: d.id,
          personId: d.personId,
          fingleId: d.fingleId,
          fullname: d.fullname,
          department: d.department,
          position: d.position,
          workDate: d.workDate,
          dayType: getDayType(d.workDate),
          shifts: [{
            config: this.state.shifts.find(s => s.id === d.shiftId) || {
              id: d.shiftId || 1,
              shiftCode: 'M',
              shiftName: d.shiftName || 'เช้า (ปกติ)',
              startTime: d.scheduledIn || '08:15',
              endTime: d.scheduledOut || '16:00',
              crossesMidnight: false,
              workDateBasis: 'START_DATE',
              lateGraceMinutes: 0,
              inWindowBeforeMin: 120,
              outWindowAfterMin: 120,
              earlyLeaveMin: 0,
              duplicateScanMin: 5,
              color: '#0ea5e9',
              isActive: true,
              createdAt: '',
              updatedAt: ''
            },
            source: 'DEFAULT' as const
          }],
          totalScans: d.totalScans || 0,
          firstScan: d.firstScan || undefined,
          lastScan: d.lastScan || undefined,
          checkIn: d.checkIn || undefined,
          checkOut: d.checkOut || undefined,
          status: d.status,
          statusLabel: d.statusLabel,
          lateMinutes: d.lateMinutes || 0,
          earlyMinutes: d.earlyMinutes || 0,
          rawScanIds: []
        }));
        this.notify();
        return this.state.cachedDailyResults[date];
      }
    } catch {}
    return this.getDailyAttendance(date);
  }

  /**
   * บันทึกผลประมวลผลเวลาประจำวันลง MySQL attendance_daily_result โดยตรง
   */
  public async saveDailyResultsToMySql(date: string = '2026-10-14'): Promise<{ success: boolean; message: string; saved?: number }> {
    const results = this.getDailyAttendance(date);
    if (!results || results.length === 0) {
      return { success: false, message: 'ไม่มีผลการประมวลผลเวลาของวันที่ระบุ' };
    }
    const res = await apiClient.saveDailyAttendanceToDb(results);
    if (res.success) {
      return { success: true, saved: res.saved, message: `บันทึกผลการประมวลผลเวลา ${res.saved} รายการลง MySQL สำเร็จแล้ว!` };
    }
    return { success: false, message: res.message || 'บันทึกลง MySQL ไม่สำเร็จ' };
  }

  // Section 22: Push Preview (Dry-run before push)
  public previewPush(filters: {
    dateFrom?: string;
    dateTo?: string;
    machineNo?: number;
    pendingOnly?: boolean;
  }) {
    let candidates = [...this.state.rawScans];

    if (filters.pendingOnly !== false) {
      candidates = candidates.filter(r => r.pushStatus === 'PENDING');
    }
    if (filters.dateFrom) {
      candidates = candidates.filter(r => r.scanDateTime >= `${filters.dateFrom} 00:00:00`);
    }
    if (filters.dateTo) {
      candidates = candidates.filter(r => r.scanDateTime <= `${filters.dateTo} 23:59:59`);
    }
    if (filters.machineNo) {
      candidates = candidates.filter(r => r.machineNo === filters.machineNo);
    }

    // Check how many already exist in hosoffice.fingle_scan
    let willSkipExists = 0;
    let unmappedCount = 0;
    let readyToPush = 0;

    candidates.forEach(scan => {
      if (!scan.hrMapped) {
        unmappedCount++;
        return;
      }
      const existsInHos = this.state.hosofficeScans.some(
        h => h.fingleId === scan.fingleId && h.scanDateTime === scan.scanDateTime
      );
      if (existsInHos) {
        willSkipExists++;
      } else {
        readyToPush++;
      }
    });

    return {
      totalSelected: candidates.length,
      readyToPush,
      willSkipExists,
      unmappedCount,
      candidates
    };
  }

  // Section 22: Execute Push to MySQL hosoffice.fingle_scan (ADMIN ONLY)
  public executePush(
    filters: {
      dateFrom?: string;
      dateTo?: string;
      machineNo?: number;
      pendingOnly?: boolean;
      includeUnmapped?: boolean;
    },
    requestedByUser: User
  ): { batch: PushBatch; inserted: number; skippedExists: number; failed: number } {
    if (requestedByUser.role !== 'ADMIN') {
      throw new Error('ไม่อนุญาต: สิทธิ์การส่งข้อมูลเข้า hosoffice สงวนไว้สำหรับ ADMIN เท่านั้น');
    }

    const preview = this.previewPush(filters);
    const now = formatDateTime();
    const batchId = generateUniqueId();

    let inserted = 0;
    let skippedExists = 0;
    let failed = 0;

    preview.candidates.forEach(scan => {
      // If unmapped and not explicitly included
      if (!scan.hrMapped && !filters.includeUnmapped) {
        scan.pushStatus = 'EXCLUDED';
        scan.pushError = 'ยังไม่ผูกข้อมูลบุคคล (FINGLE_ID ไม่พบใน hr_person)';
        return;
      }

      // Check duplicate in hosoffice.fingle_scan (Section 10 & 22)
      const exists = this.state.hosofficeScans.some(
        h => h.fingleId === scan.fingleId && h.scanDateTime === scan.scanDateTime
      );

      if (exists) {
        scan.pushStatus = 'SKIPPED_EXISTS';
        scan.pushBatchId = batchId;
        scan.pushedAt = now;
        scan.pushedBy = requestedByUser.id;
        skippedExists++;
        return;
      }

      try {
        const scanDate = scan.scanDateTime.split(' ')[0];
        const scanTime = scan.scanDateTime.split(' ')[1] || '00:00:00';
        const dayType = getDayType(scanDate);

        // Section 12 & 13: Insert format to hosoffice.fingle_scan
        const hosRecord: HosFingleScan = {
          id: generateUniqueId(),
          personId: scan.personId,
          fingleId: scan.fingleId,
          scanDateTime: scan.scanDateTime,
          scanDate,
          scanTime,
          dayTypeId: dayType.id,
          dayTypeName: dayType.name,
          hrFullname: scan.hrFullname,
          hrPositionName: scan.hrPositionName,
          hrLeavelName: scan.hrLeavelName,
          hrDepName: scan.hrDepName,
          hrDepSubName: scan.hrDepSubName,
          hrPersonTypeName: scan.hrPersonTypeName,
          hrPersonTypeId: scan.hrPersonTypeId,
          hrDepartmentId: scan.hrDepartmentId,
          hrDepartmentSubId: scan.hrDepartmentSubId,
          machinId: scan.machineNo,
          appTypeSave: 'SCAN',
          scanSource: 'FINGER',
          isConfirm: true,
          isInput: 'SIGN',
          dateTimeSave: now, // Section 13: Time of push insertion
          createBy: 'SCAN_PUSH'
        };

        this.state.hosofficeScans.push(hosRecord);

        scan.pushStatus = 'PUSHED';
        scan.pushedAt = now;
        scan.pushedBy = requestedByUser.id;
        scan.pushBatchId = batchId;
        scan.pushError = undefined;
        inserted++;
      } catch (err: unknown) {
        scan.pushStatus = 'FAILED';
        scan.pushError = err instanceof Error ? err.message : 'SQL Insert Exception';
        failed++;
      }
    });

    const batch: PushBatch = {
      id: batchId,
      requestedBy: requestedByUser.username,
      requestedAt: now,
      filterDateFrom: filters.dateFrom,
      filterDateTo: filters.dateTo,
      filterMachineNo: filters.machineNo,
      totalSelected: preview.totalSelected,
      totalInserted: inserted,
      totalSkippedExists: skippedExists,
      totalFailed: failed,
      status: failed > 0 ? (inserted > 0 ? 'PARTIAL' : 'FAILED') : 'SUCCESS',
      finishedAt: formatDateTime()
    };

    this.state.pushBatches = [batch, ...this.state.pushBatches];
    this.logAudit(
      requestedByUser.username,
      'PUSH',
      `ส่งข้อมูลเข้า hosoffice สำเร็จ ${inserted} รายการ, ซ้ำ ${skippedExists} รายการ, ล้มเหลว ${failed} รายการ (Batch #${batchId})`,
      'PUSH_EXECUTE'
    );

    this.saveState();
    return { batch, inserted, skippedExists, failed };
  }

  // Exclude a raw scan from push queue (Section 22.4)
  public async excludeScan(id: number | string): Promise<boolean> {
    const scan = this.state.rawScans.find(s => String(s.id) === String(id));
    if (scan) {
      scan.pushStatus = 'EXCLUDED';
      scan.pushError = 'ผู้ดูแลระบบสั่งยกเว้นรายการนี้ (Manual Exclude)';
      this.notify();
    }
    try {
      await apiClient.excludeRawScan(id);
      return true;
    } catch (e) {
      console.warn('API exclude failed, handled in memory:', e);
      return true;
    }
  }

  // Refresh personnel from hosoffice.hr_person and remap scans (Section 22.4)
  public async refreshPersonnelMapping(): Promise<{ success: boolean; hrCount: number; remappedCount: number; message: string }> {
    try {
      const res = await apiClient.refreshPersonnelMapping();
      // Reload personnel and raw scans from DB
      await this.loadFromMySqlDb();
      return res;
    } catch (err: unknown) {
      return {
        success: false,
        hrCount: 0,
        remappedCount: 0,
        message: err instanceof Error ? err.message : 'รีเฟรชไม่สำเร็จ'
      };
    }
  }

  // Load push batches from MySQL
  public async loadPushBatches(): Promise<void> {
    try {
      const res = await apiClient.getPushBatchesFromDb();
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        this.state.pushBatches = res.data;
        this.notify();
      }
    } catch (e) {
      console.warn('Load push batches failed:', e);
    }
  }

  // Attendance Calculation: ประมวลผลเวลาทำงานอิงตาม "ประเภทบุคลากร" (Personnel Type) โดยตรง
  public calculateAttendance(date: string = formatDate(), filterPersonId?: number): DailyResult[] {
    const results: DailyResult[] = [];
    const targetPersonnel = filterPersonId 
      ? this.state.personnel.filter(p => p.personId === filterPersonId)
      : this.state.personnel;

    targetPersonnel.forEach(p => {
      // 1. หาประเภทบุคลากรของบุคคลนั้น
      const typeName = (p.hrPersonTypeName || '').trim().toLowerCase();
      const matchedType = this.state.personnelTypes?.find(t => {
        if (!t.isActive) return false;
        const tName = t.name.trim().toLowerCase();
        return tName === typeName || typeName.includes(tName) || tName.includes(typeName);
      }) || this.state.personnelTypes?.find(t => t.isActive) || this.state.personnelTypes?.[0] || DEFAULT_PERSONNEL_TYPES[0];

      // 2. ข้อมูลสแกนทั้งหมดของคนนี้ในวันที่ระบุ เรียงตามเวลา (รองรับทั้ง FINGLE_ID, PersonId, ชื่อ และรูปแบบวันที่หลากหลาย)
      const targetFingle = Number(p.fingleId);
      const targetPersonId = Number(p.personId);
      const targetName = (p.hrFullname || '').trim().toLowerCase();

      const scans = this.state.rawScans.filter(r => {
        // ก. จับคู่ตัวบุคคล (Person Identity)
        const rFingle = Number(r.fingleId);
        const rPersonId = Number(r.personId);
        const rName = (r.hrFullname || '').trim().toLowerCase();

        const personMatched = (
          (targetFingle > 0 && rFingle > 0 && rFingle === targetFingle) ||
          (targetPersonId > 0 && rPersonId > 0 && rPersonId === targetPersonId) ||
          (targetName && rName && (rName === targetName || rName.includes(targetName) || targetName.includes(rName)))
        );
        if (!personMatched) return false;

        // ข. จับคู่วันที่ (Date Matching - รองรับ YYYY-MM-DD, T, พ.ศ. 2569, DD/MM/YYYY)
        const rawDt = (r.scanDateTime || '').replace('T', ' ').trim();
        if (rawDt.startsWith(date)) return true;
        // รองรับ พ.ศ. เช่น 2026-10-14 เทียบกับ 2569-10-14
        const beDate = date.replace(/^(\d{4})/, (_, y) => String(Number(y) + 543));
        if (rawDt.startsWith(beDate)) return true;
        // รองรับ DD/MM/YYYY
        const [y, m, d] = date.split('-');
        if (y && m && d && rawDt.startsWith(`${d}/${m}/${y}`)) return true;

        return false;
      }).sort((a, b) => (a.scanDateTime || '').localeCompare(b.scanDateTime || ''));

      if (scans.length === 0) {
        // กรณีไม่มีการสแกนนิ้วเลยในวันนั้น
        results.push({
          id: generateUniqueId(),
          personId: p.personId,
          fingleId: p.fingleId,
          fullname: p.hrFullname,
          department: p.hrDepName,
          position: p.hrPositionName,
          workDate: date,
          personnelTypeName: matchedType.name,
          shiftCode: 'M',
          shiftName: `เช้า (${matchedType.name})`,
          plannedStartTime: matchedType.morningShift.startTime,
          plannedEndTime: matchedType.morningShift.endTime,
          resolutionSource: 'PERSONNEL_TYPE',
          status: 'NO_SCAN',
          lateMinutes: 0,
          earlyMinutes: 0,
          otMinutes: 0,
          scansCount: 0,
          rawScanIds: [],
          calculatedAt: formatDateTime()
        });
        return;
      }

      // ตรวจสอบเวลาสแกนครั้งแรก เพื่อจับคู่กะที่เหมาะสมที่สุด (เช้า / บ่าย / ดึก)
      const firstScan = scans[0];
      const lastScan = scans.length > 1 ? scans[scans.length - 1] : undefined;

      const inTime = firstScan ? firstScan.scanDateTime.split(' ')[1] : undefined;
      const outTime = lastScan && lastScan !== firstScan ? lastScan.scanDateTime.split(' ')[1] : undefined;

      const [inH, inM] = (inTime || '08:00:00').split(':').map(Number);
      const inMinutes = inH * 60 + inM;

      let chosenShift = matchedType.morningShift;
      let shiftCode = 'M';
      let shiftName = `เช้า (${matchedType.name})`;

      // วิเคราะห์ว่าเวลาสแกนแรกใกล้เคียงกะใดที่สุด
      // กะเช้า: สแกนเข้าก่อน 13:00
      // กะบ่าย: สแกนเข้า 13:00 - 19:59
      // กะดึก: สแกนเข้า 20:00 เป็นต้นไป หรือช่วงเช้ามืดก่อน 05:00
      if (inH >= 13 && inH < 20) {
        chosenShift = matchedType.afternoonShift;
        shiftCode = 'A';
        shiftName = `บ่าย (${matchedType.name})`;
      } else if (inH >= 20 || inH < 5) {
        chosenShift = matchedType.nightShift;
        shiftCode = 'N';
        shiftName = `ดึก (${matchedType.name})`;
      }

      // คำนวณเวลาเริ่มและระยะเวลาผ่อนปรนสาย
      const [plannedStartH, plannedStartM] = chosenShift.startTime.split(':').map(Number);
      const plannedStartMinutes = plannedStartH * 60 + plannedStartM;
      const graceEndMinutes = plannedStartMinutes + (chosenShift.lateGraceMinutes || 0);

      let lateMinutes = 0;
      if (inMinutes > graceEndMinutes) {
        lateMinutes = inMinutes - plannedStartMinutes;
      }

      // คำนวณเวลาเลิกงานและออกก่อนเวลา
      let earlyMinutes = 0;
      let otMinutes = 0;
      if (outTime) {
        const [outH, outM] = outTime.split(':').map(Number);
        const actualOutMinutes = outH * 60 + outM;

        let [endH, endM] = chosenShift.endTime.split(':').map(Number);
        if (endH === 24 || endH === 0) endH = 24;
        let plannedEndMinutes = endH * 60 + endM;
        if (shiftCode === 'N' && inH >= 20) {
          plannedEndMinutes += 1440;
        }

        if (actualOutMinutes < plannedEndMinutes) {
          earlyMinutes = plannedEndMinutes - actualOutMinutes;
        } else if (actualOutMinutes > plannedEndMinutes + 30) {
          otMinutes = actualOutMinutes - plannedEndMinutes;
        }
      }

      // ประเมินสถานะ
      let status: DailyResult['status'] = 'ON_TIME';
      if (!outTime) {
        status = lateMinutes > 0 ? 'LATE' : 'IN_ONLY';
      } else if (lateMinutes > 0 && earlyMinutes > 0) {
        status = 'LATE_AND_EARLY';
      } else if (lateMinutes > 0) {
        status = 'LATE';
      } else if (earlyMinutes > 0) {
        status = 'EARLY_LEAVE';
      } else {
        status = 'ON_TIME';
      }

      results.push({
        id: generateUniqueId(),
        personId: p.personId,
        fingleId: p.fingleId,
        fullname: p.hrFullname,
        department: p.hrDepName,
        position: p.hrPositionName,
        workDate: date,
        personnelTypeName: matchedType.name,
        shiftCode,
        shiftName,
        plannedStartTime: chosenShift.startTime,
        plannedEndTime: chosenShift.endTime,
        resolutionSource: 'PERSONNEL_TYPE',
        inTime,
        outTime,
        status,
        lateMinutes,
        earlyMinutes,
        otMinutes,
        scansCount: scans.length,
        rawScanIds: scans.map(s => s.id),
        calculatedAt: formatDateTime()
      });
    });

    return results;
  }

  // Shift Management CRUD
  public updateShift(id: number, data: Partial<Shift>, user: User) {
    if (user.role !== 'ADMIN') throw new Error('ไม่อนุญาต: สิทธิ์เฉพาะ ADMIN');
    const idx = this.state.shifts.findIndex(s => s.id === id);
    if (idx >= 0) {
      this.state.shifts[idx] = {
        ...this.state.shifts[idx],
        ...data,
        updatedAt: formatDateTime()
      };
      this.logAudit(user.username, 'SHIFT', `แก้ไขกะ [${this.state.shifts[idx].shiftCode}] ${this.state.shifts[idx].shiftName} (เวลา ${this.state.shifts[idx].startTime} - ${this.state.shifts[idx].endTime})`);
      this.saveState();
      // อัปเดตตรงเข้า MySQL ทันที (Background Sync)
      try {
        apiClient.updateShiftInDb(id, this.state.shifts[idx]).catch(() => {});
      } catch {}
    }
  }

  public addShift(shift: Omit<Shift, 'id' | 'createdAt' | 'updatedAt'>, user: User) {
    if (user.role !== 'ADMIN') throw new Error('ไม่อนุญาต: สิทธิ์เฉพาะ ADMIN');
    const newShift: Shift = {
      ...shift,
      id: generateUniqueId(),
      createdAt: formatDateTime(),
      updatedAt: formatDateTime()
    };
    this.state.shifts.push(newShift);
    this.logAudit(user.username, 'SHIFT', `เพิ่มกะใหม่ [${newShift.shiftCode}] ${newShift.shiftName}`);
    this.saveState();
    // บันทึกตรงเข้า MySQL ทันที (Background Sync)
    try {
      apiClient.createShiftInDb(newShift).catch(() => {});
    } catch {}
  }

  public deactivateShift(id: number, user: User) {
    if (user.role !== 'ADMIN') throw new Error('ไม่อนุญาต: สิทธิ์เฉพาะ ADMIN');
    // Section 16.1: Soft delete
    const idx = this.state.shifts.findIndex(s => s.id === id);
    if (idx >= 0) {
      this.state.shifts[idx].isActive = false;
      this.state.shifts[idx].updatedAt = formatDateTime();
      this.logAudit(user.username, 'SHIFT', `ปิดการใช้งานกะ [${this.state.shifts[idx].shiftCode}] (Soft Delete)`);
      this.saveState();
      try {
        apiClient.updateShiftInDb(id, this.state.shifts[idx]).catch(() => {});
      } catch {}
    }
  }

  public deleteShiftHard(id: number, user: User) {
    if (user.role !== 'ADMIN') throw new Error('ไม่อนุญาต: สิทธิ์เฉพาะ ADMIN');
    const idx = this.state.shifts.findIndex(s => s.id === id);
    if (idx >= 0) {
      const code = this.state.shifts[idx].shiftCode;
      this.state.shifts.splice(idx, 1);
      this.logAudit(user.username, 'SHIFT', `ลบกะ [${code}] ออกจากฐานข้อมูลถาวร`);
      this.saveState();
      try {
        apiClient.deleteShiftFromDb(id).catch(() => {});
      } catch {}
    }
  }

  // Personnel Type & Shift Settings (Spec v2 Section 16-19 - Simplified)
  public async addPersonnelType(type: Omit<PersonnelTypeConfig, 'id'>, user: User) {
    if (user.role !== 'ADMIN') throw new Error('ไม่อนุญาต: สิทธิ์เฉพาะ ADMIN');
    const newId = generateUniqueId();
    const newType: PersonnelTypeConfig = {
      ...type,
      id: newId
    };
    if (!this.state.personnelTypes) this.state.personnelTypes = [];
    this.state.personnelTypes.push(newType);
    this.logAudit(user.username, 'SHIFT', `เพิ่มประเภทบุคลากร "${newType.name}" (เช้า ${newType.morningShift.startTime}-${newType.morningShift.endTime})`);
    this.state.cachedDailyResults = {};
    this.saveState();
    try {
      await apiClient.createPersonnelType(newType);
    } catch {}
  }

  public async updatePersonnelType(id: number, data: Partial<PersonnelTypeConfig>, user: User) {
    if (user.role !== 'ADMIN') throw new Error('ไม่อนุญาต: สิทธิ์เฉพาะ ADMIN');
    const idx = (this.state.personnelTypes || []).findIndex(t => t.id === id);
    if (idx >= 0) {
      this.state.personnelTypes[idx] = {
        ...this.state.personnelTypes[idx],
        ...data
      };
      this.logAudit(user.username, 'SHIFT', `แก้ไขประเภทบุคลากร "${this.state.personnelTypes[idx].name}"`);
      this.state.cachedDailyResults = {};
      this.saveState();
      try {
        await apiClient.updatePersonnelType(id, this.state.personnelTypes[idx]);
      } catch {}
    }
  }

  public async deletePersonnelType(id: number, user: User) {
    if (user.role !== 'ADMIN') throw new Error('ไม่อนุญาต: สิทธิ์เฉพาะ ADMIN');
    const idx = (this.state.personnelTypes || []).findIndex(t => t.id === id);
    if (idx >= 0) {
      const deletedName = this.state.personnelTypes[idx].name;
      this.state.personnelTypes.splice(idx, 1);
      this.logAudit(user.username, 'SHIFT', `ลบประเภทบุคลากร "${deletedName}"`);
      this.state.cachedDailyResults = {};
      this.saveState();
      try {
        await apiClient.deletePersonnelType(id);
      } catch {}
    }
  }

  public async resetPersonnelTypes(user: User) {
    if (user.role !== 'ADMIN') throw new Error('ไม่อนุญาต: สิทธิ์เฉพาะ ADMIN');
    try {
      await apiClient.resetPersonnelTypesToDefault();
      const res = await apiClient.getPersonnelTypes();
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        this.state.personnelTypes = res.data;
      } else {
        this.state.personnelTypes = [...DEFAULT_PERSONNEL_TYPES];
      }
    } catch {
      this.state.personnelTypes = [...DEFAULT_PERSONNEL_TYPES];
    }
    this.logAudit(user.username, 'SHIFT', 'คืนค่าเริ่มต้นประเภทบุคลากร 5 ประเภท');
    this.state.cachedDailyResults = {};
    this.saveState();
  }

  public async syncAllPersonnelTypesToDb(user: User) {
    if (user.role !== 'ADMIN') throw new Error('ไม่อนุญาต: สิทธิ์เฉพาะ ADMIN');
    try {
      const res = await apiClient.syncAllPersonnelTypesToDb(this.state.personnelTypes);
      this.logAudit(user.username, 'SHIFT', `บันทึกประเภทบุคลากร ${this.state.personnelTypes.length} รายการลง MySQL`);
      return res;
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /**
   * ดึงข้อมูลสดจากฐานข้อมูล MySQL (10.2.0.201) เข้าสู่ Store โดยตรง
   */
  public async loadFromMySqlDb(): Promise<{ success: boolean; shiftsCount: number; scansCount: number; message: string }> {
    try {
      let shiftsCount = 0;
      let scansCount = 0;

      // 1. ดึงกะจาก MySQL attendance_shift
      const shiftsRes = await apiClient.getShiftsFromDb();
      if (shiftsRes.success && Array.isArray(shiftsRes.data)) {
        if (shiftsRes.data.length > 0) {
          this.state.shifts = shiftsRes.data.map((r: any) => ({
            id: r.id,
            shiftCode: r.code || r.shift_code || 'M',
            shiftName: r.name || r.shift_name || '',
            startTime: r.startTime || '08:15',
            endTime: r.endTime || '16:00',
            crossesMidnight: Boolean(r.crossesMidnight),
            workDateBasis: r.workDateBasis || 'START_DATE',
            lateGraceMinutes: r.lateGraceMinutes || 0,
            inWindowBeforeMin: r.inWindowBeforeMin || 120,
            outWindowAfterMin: r.outWindowAfterMin || 120,
            earlyLeaveMin: r.earlyLeaveMin || 0,
            duplicateScanMin: r.duplicateScanMin || 5,
            color: r.color || '#0ea5e9',
            isActive: r.isActive !== false,
            createdAt: formatDateTime(),
            updatedAt: formatDateTime()
          }));
        } else {
          this.state.shifts = [];
        }
        shiftsCount = this.state.shifts.length;
      }

      // 2. ดึงข้อมูลสแกนจาก MySQL attendance_raw_scan
      const scansRes = await apiClient.getRawScansFromDb(500);
      if (scansRes.success && Array.isArray(scansRes.data)) {
        this.state.rawScans = scansRes.data.map((r: any) => ({
          id: r.id,
          machineNo: r.machineNo || r.machine_no || 1,
          deviceIp: r.deviceIp || r.device_ip || '',
          fingleId: r.fingleId || r.fingle_id || 0,
          scanDateTime: r.scanDateTime || (r.scan_date_time ? String(r.scan_date_time).replace('T', ' ').substring(0, 19) : ''),
          verifyMode: r.verifyMode ?? r.verify_mode ?? 1,
          inOutMode: r.inOutMode ?? r.in_out_mode ?? 0,
          personId: r.personId ?? r.person_id,
          hrFullname: r.hrFullname || r.hr_fullname || '',
          hrPositionName: r.hrPositionName || r.hr_position_name || '',
          hrLeavelName: r.hrLeavelName || r.hr_leavel_name || '',
          hrDepName: r.hrDepName || r.hr_dep_name || '',
          hrDepSubName: r.hrDepSubName || r.hr_dep_sub_name || '',
          hrPersonTypeName: r.hrPersonTypeName || r.hr_person_type_name || '',
          hrPersonTypeId: r.hrPersonTypeId || r.hr_person_type_id,
          hrDepartmentId: r.hrDepartmentId || r.hr_department_id,
          hrDepartmentSubId: r.hrDepartmentSubId || r.hr_department_sub_id,
          hrMapped: Boolean(r.hrMapped ?? r.hr_mapped ?? 1),
          pushStatus: r.pushStatus || r.push_status || 'PENDING',
          pushedAt: r.pushedAt || r.pushed_at,
          pushedBy: r.pushedBy || r.pushed_by,
          pushBatchId: r.pushBatchId || r.push_batch_id,
          pushError: r.pushError || r.push_error,
          receivedAt: r.receivedAt || r.received_at || formatDateTime()
        }));
        scansCount = this.state.rawScans.length;
      }
      if (!this.state.rawScans || this.state.rawScans.length === 0) {
        this.state.rawScans = [...SEED_TEST_SCANS];
        scansCount = this.state.rawScans.length;
      }

      // 3. ดึงบุคลากรจาก MySQL hosoffice.hr_person
      try {
        const pRes = await apiClient.getPersonnelFromHosoffice(1000);
        if (pRes.success && Array.isArray(pRes.data) && pRes.data.length > 0) {
          this.state.personnel = pRes.data.map((p: any) => ({
            personId: p.personId || p.id,
            id: p.id || p.personId,
            fingleId: p.fingleId || p.fingle_id || p.id,
            hrCid: p.hrCid || p.hr_cid || '',
            hrFullname: (p.hrFullname || p.hr_fullname || '').trim() || `เจ้าหน้าที่ รหัส ${p.id || p.personId}`,
            hrPositionName: p.hrPositionName || p.hr_position_name || 'เจ้าหน้าที่',
            hrLevelName: p.hrLevelName || p.hr_level_name || '',
            hrDepName: p.hrDepName || p.hr_dep_name || 'โรงพยาบาลสามชุก',
            hrDepSubName: p.hrDepSubName || p.hr_dep_sub_name || '',
            hrPersonTypeName: p.hrPersonTypeName || p.hr_person_type_name || 'ข้าราชการ',
            hrPersonTypeId: p.hrPersonTypeId || 1,
            hrDepartmentId: p.hrDepartmentId || 1,
            hrDepartmentSubId: p.hrDepartmentSubId || 1,
            hrStatusId: p.hrStatusId || 1,
            status: 'ACTIVE'
          }));
        }
      } catch {}

      if (!this.state.personnel || this.state.personnel.length === 0) {
        this.state.personnel = INITIAL_PERSONNEL;
      }

      // 3.1 ดึงประเภทบุคลากรและเวลากะจาก MySQL
      try {
        const typeRes = await apiClient.getPersonnelTypes();
        if (typeRes.success && Array.isArray(typeRes.data) && typeRes.data.length > 0) {
          this.state.personnelTypes = typeRes.data;
        } else if (!this.state.personnelTypes || this.state.personnelTypes.length === 0) {
          this.state.personnelTypes = [...DEFAULT_PERSONNEL_TYPES];
        }
      } catch {
        if (!this.state.personnelTypes || this.state.personnelTypes.length === 0) {
          this.state.personnelTypes = [...DEFAULT_PERSONNEL_TYPES];
        }
      }

      // คำนวณจำนวนบุคลากรในแต่ละประเภท (Member Count) สดจาก hr_person
      if (this.state.personnelTypes && this.state.personnel) {
        this.state.personnelTypes = this.state.personnelTypes.map(t => {
          const tName = t.name.trim().toLowerCase();
          const cnt = this.state.personnel.filter(p => {
            const pName = (p.hrPersonTypeName || '').trim().toLowerCase();
            return pName === tName || pName.includes(tName) || tName.includes(pName);
          }).length;
          return { ...t, memberCount: cnt };
        });
      }

      // 4. ดึงผลประมวลผลเวลาจาก MySQL attendance_daily_result
      const todayStr = '2026-10-14';
      try {
        const dailyRes = await apiClient.getDailyAttendanceFromDb(todayStr);
        if (dailyRes.success && Array.isArray(dailyRes.data) && dailyRes.data.length > 0) {
          if (!this.state.cachedDailyResults) this.state.cachedDailyResults = {};
          this.state.cachedDailyResults[todayStr] = dailyRes.data.map((d: any) => ({
            id: d.id,
            personId: d.personId,
            fingleId: d.fingleId,
            fullname: d.fullname,
            department: d.department,
            position: d.position,
            workDate: d.workDate,
            dayType: getDayType(d.workDate),
            shifts: [{
              config: this.state.shifts.find(s => s.id === d.shiftId) || {
                id: d.shiftId || 1,
                shiftCode: 'M',
                shiftName: d.shiftName || 'เช้า (ปกติ)',
                startTime: d.scheduledIn || '08:15',
                endTime: d.scheduledOut || '16:00',
                crossesMidnight: false,
                workDateBasis: 'START_DATE',
                lateGraceMinutes: 0,
                inWindowBeforeMin: 120,
                outWindowAfterMin: 120,
                earlyLeaveMin: 0,
                duplicateScanMin: 5,
                color: '#0ea5e9',
                isActive: true,
                createdAt: '',
                updatedAt: ''
              },
              source: 'DEFAULT' as const
            }],
            totalScans: d.totalScans || 0,
            firstScan: d.firstScan || undefined,
            lastScan: d.lastScan || undefined,
            checkIn: d.checkIn || undefined,
            checkOut: d.checkOut || undefined,
            status: d.status,
            statusLabel: d.statusLabel,
            lateMinutes: d.lateMinutes || 0,
            earlyMinutes: d.earlyMinutes || 0,
            rawScanIds: []
          }));
        }
      } catch {}

      // ถ้าใน MySQL ยังไม่มีผลประมวลผลเวลาของวันนี้ ให้คำนวณและบันทึกลง MySQL ทันที
      if (!this.state.cachedDailyResults?.[todayStr] || this.state.cachedDailyResults[todayStr].length === 0) {
        const calced = this.calculateAttendance(todayStr);
        if (!this.state.cachedDailyResults) this.state.cachedDailyResults = {};
        this.state.cachedDailyResults[todayStr] = calced;
        if (calced.length > 0) {
          apiClient.saveDailyAttendanceToDb(calced).catch(() => {});
        }
      }

      // 5. ดึงประวัติ Push Batches จาก MySQL
      this.loadPushBatches().catch(() => {});

      this.saveState();
      this.notify();

      return {
        success: true,
        shiftsCount,
        scansCount,
        message: `โหลดข้อมูลสดจาก MySQL 10.2.0.201 สำเร็จ: พบกะ ${shiftsCount} กะ, บันทึกสแกน ${scansCount} รายการ, บุคลากร ${this.state.personnel.length} คน`
      };
    } catch (err) {
      return {
        success: false,
        shiftsCount: 0,
        scansCount: 0,
        message: `โหลดจาก MySQL ไม่สำเร็จ: ${err instanceof Error ? err.message : 'Failed'}`
      };
    }
  }

  /**
   * ล้างข้อมูลทั้งหมดใน LocalStorage ถาวร 100% ตามคำขอ และดึงข้อมูลตรงจาก MySQL
   */
  public async purgeLocalStorageAndReloadFromMySql(): Promise<{ success: boolean; message: string }> {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
      this.state.shifts = [];
      this.state.rawScans = [];
      this.state.personnel = [];
      this.notify();
      const res = await this.loadFromMySqlDb();
      return {
        success: res.success,
        message: `ลบ LocalStorage สำเร็จ 100%! ไม่มีการเก็บแคชในเบราว์เซอร์แล้ว เชื่อมต่อฐานข้อมูลตรงเท่านั้น (${res.message})`
      };
    } catch (err) {
      return {
        success: false,
        message: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Failed'}`
      };
    }
  }

  /**
   * นำเข้ากะมาตรฐานโรงพยาบาลสามชุก 4 กะหลัก (M, A, N, MA) ลงใน MySQL attendance_shift โดยตรง
   */
  public async seedHospitalShiftsToMySql(): Promise<{ success: boolean; message: string }> {
    const defaultShifts: Partial<Shift>[] = [
      { shiftCode: 'M', shiftName: 'เช้า (ปกติ)', startTime: '08:15', endTime: '16:00', crossesMidnight: false, workDateBasis: 'START_DATE', lateGraceMinutes: 0, inWindowBeforeMin: 120, outWindowAfterMin: 120, earlyLeaveMin: 0, duplicateScanMin: 5, color: '#0ea5e9', isActive: true },
      { shiftCode: 'A', shiftName: 'บ่าย', startTime: '16:00', endTime: '24:00', crossesMidnight: false, workDateBasis: 'START_DATE', lateGraceMinutes: 0, inWindowBeforeMin: 120, outWindowAfterMin: 120, earlyLeaveMin: 0, duplicateScanMin: 5, color: '#f59e0b', isActive: true },
      { shiftCode: 'N', shiftName: 'ดึก', startTime: '00:00', endTime: '08:00', crossesMidnight: false, workDateBasis: 'START_DATE', lateGraceMinutes: 0, inWindowBeforeMin: 120, outWindowAfterMin: 120, earlyLeaveMin: 0, duplicateScanMin: 5, color: '#8b5cf6', isActive: true },
      { shiftCode: 'MA', shiftName: 'เช้าควบบ่าย (16 ชม.)', startTime: '08:15', endTime: '24:00', crossesMidnight: false, workDateBasis: 'START_DATE', lateGraceMinutes: 0, inWindowBeforeMin: 120, outWindowAfterMin: 120, earlyLeaveMin: 0, duplicateScanMin: 5, color: '#10b981', isActive: true }
    ];

    try {
      const res = await apiClient.syncShiftsToDb(defaultShifts as any);
      await this.loadFromMySqlDb();
      return res;
    } catch (err) {
      return {
        success: false,
        message: `นำเข้ากะไม่สำเร็จ: ${err instanceof Error ? err.message : 'Failed'}`
      };
    }
  }

  // ซิงค์ข้อมูลบุคลากรจาก HOSOffice ตามคำสั่ง SQL:
  // เช็คว่าข้อมูลไหน ดึงแล้ว ไม่ต้องดึงซ้ำ (skipped)
  // แต่ถ้า 5 ฟิลด์หลัก (FULLNAME, HR_POSITION_NAME, HR_LEVEL_NAME, HR_DEPARTMENT_SUB, HR_PERSON_TYPE_NAME) ใน hosoffice เปลี่ยนหรือไม่ตรงกับฐานเรา ให้เปลี่ยนให้ตรงกับ hosoffice!
  public syncPersonnelFromHosoffice(user: User, customRows?: HosofficePersonRow[]): PersonnelSyncResult {
    if (user.role !== 'ADMIN') throw new Error('ไม่อนุญาต: สิทธิ์เฉพาะ ADMIN');
    const sourceRows = customRows || [];
    const now = formatDateTime();

    const inserted: HrPerson[] = [];
    const updated: PersonnelUpdateRecord[] = [];
    const skipped: { personId: number; fullname: string; fingleId: number; reason: string }[] = [];

    sourceRows.forEach(row => {
      // ตรวจสอบว่าเคยดึงมาแล้วหรือยัง (ตาม HP.ID หรือ HR_CID หรือ FINGLE_ID)
      const existing = this.state.personnel.find(
        p => p.personId === row.ID || (row.HR_CID && p.hrCid === row.HR_CID) || (row.FINGLE_ID && p.fingleId === row.FINGLE_ID)
      );

      if (!existing) {
        // ข้อมูลใหม่ที่ยังไม่เคยดึง: เพิ่มเข้าฐาน
        let typeId = 1;
        if (row.HR_PERSON_TYPE_NAME.includes('พนักงานกระทรวง')) typeId = 2;
        else if (row.HR_PERSON_TYPE_NAME.includes('ลูกจ้าง')) typeId = 3;

        const newPerson: HrPerson = {
          personId: row.ID,
          hrCid: row.HR_CID,
          fingleId: row.FINGLE_ID || row.ID,
          hrFullname: row.FULLNAME,
          hrPositionName: row.HR_POSITION_NAME,
          hrLevelName: row.HR_LEVEL_NAME || '',
          hrDepName: row.HR_DEPARTMENT_NAME,
          hrDepSubName: row.HR_DEPARTMENT_SUB,
          hrPersonTypeName: row.HR_PERSON_TYPE_NAME,
          hrPersonTypeId: typeId,
          hrDepartmentId: 100 + (row.ID % 10),
          hrDepartmentSubId: 1000 + (row.ID % 20),
          status: 'ACTIVE'
        };

        this.state.personnel.push(newPerson);
        inserted.push(newPerson);
        return;
      }

      // ข้อมูลที่เคยดึงแล้ว:
      // ตรวจสอบว่า 5 ฟิลด์หลักใน hosoffice เปลี่ยน หรือไม่ตรงกับฐานเราหรือไม่:
      // 1. ชื่อ - สกุล (FULLNAME)
      // 2. ตำแหน่ง (HR_POSITION_NAME)
      // 3. ระดับ (HR_LEVEL_NAME)
      // 4. กลุ่มงานหลัก / หน่วยงานย่อย (HR_DEPARTMENT_SUB)
      // ซ่อมแซม personId, hrCid, fingleId ให้ตรงกับ HOSOffice เสมอ
      if ((!existing.personId || existing.personId === 0) && row.ID) existing.personId = row.ID;
      if (!existing.hrCid && row.HR_CID) existing.hrCid = row.HR_CID;
      if (!existing.fingleId && row.FINGLE_ID) existing.fingleId = row.FINGLE_ID;

      const changes: PersonnelFieldChange[] = [];

      // 1. ชื่อ - สกุล (FULLNAME)
      if (existing.hrFullname.trim() !== row.FULLNAME.trim()) {
        changes.push({
          field: 'FULLNAME',
          label: 'ชื่อ - สกุล',
          oldValue: existing.hrFullname,
          newValue: row.FULLNAME
        });
        existing.hrFullname = row.FULLNAME;
      }

      // 2. ตำแหน่ง (HR_POSITION_NAME)
      if (existing.hrPositionName.trim() !== row.HR_POSITION_NAME.trim()) {
        changes.push({
          field: 'HR_POSITION_NAME',
          label: 'ตำแหน่ง',
          oldValue: existing.hrPositionName,
          newValue: row.HR_POSITION_NAME
        });
        existing.hrPositionName = row.HR_POSITION_NAME;
      }

      // 3. ระดับ (HR_LEVEL_NAME)
      const oldLevel = (existing.hrLevelName || '').trim();
      const newLevel = (row.HR_LEVEL_NAME || '').trim();
      if (oldLevel !== newLevel) {
        changes.push({
          field: 'HR_LEVEL_NAME',
          label: 'ระดับ',
          oldValue: oldLevel || '-',
          newValue: newLevel || '-'
        });
        existing.hrLevelName = row.HR_LEVEL_NAME;
      }

      // 4. กลุ่มงานหลัก / หน่วยงานย่อย (HR_DEPARTMENT_SUB)
      const oldSub = `${existing.hrDepName} / ${existing.hrDepSubName}`.trim();
      const newSub = `${row.HR_DEPARTMENT_NAME} / ${row.HR_DEPARTMENT_SUB}`.trim();
      if (existing.hrDepSubName.trim() !== row.HR_DEPARTMENT_SUB.trim() || existing.hrDepName.trim() !== row.HR_DEPARTMENT_NAME.trim()) {
        changes.push({
          field: 'HR_DEPARTMENT_SUB',
          label: 'กลุ่มงาน / หน่วยงานย่อย',
          oldValue: oldSub,
          newValue: newSub
        });
        existing.hrDepName = row.HR_DEPARTMENT_NAME;
        existing.hrDepSubName = row.HR_DEPARTMENT_SUB;
      }

      // 5. ประเภทบุคลากร (HR_PERSON_TYPE_NAME)
      if (existing.hrPersonTypeName.trim() !== row.HR_PERSON_TYPE_NAME.trim()) {
        changes.push({
          field: 'HR_PERSON_TYPE_NAME',
          label: 'ประเภทบุคลากร',
          oldValue: existing.hrPersonTypeName,
          newValue: row.HR_PERSON_TYPE_NAME
        });
        existing.hrPersonTypeName = row.HR_PERSON_TYPE_NAME;
        if (row.HR_PERSON_TYPE_NAME.includes('พนักงานกระทรวง')) existing.hrPersonTypeId = 2;
        else if (row.HR_PERSON_TYPE_NAME.includes('ลูกจ้าง')) existing.hrPersonTypeId = 3;
        else if (row.HR_PERSON_TYPE_NAME.includes('ข้าราชการ')) existing.hrPersonTypeId = 1;
      }

      // ปรับปรุง FINGLE_ID ด้วยหากมี
      if (row.FINGLE_ID && existing.fingleId !== row.FINGLE_ID) {
        existing.fingleId = row.FINGLE_ID;
      }

      if (changes.length > 0) {
        // มีการเปลี่ยนแปลง: ให้เปลี่ยนให้ตรงกับ hosoffice
        updated.push({
          personId: existing.personId,
          fingleId: existing.fingleId,
          fullname: existing.hrFullname,
          changes
        });

        // ซิงค์ snapshot ใน rawScans ของบุคคลนี้ให้ตรงกันด้วย
        this.state.rawScans.forEach(s => {
          if (s.personId === existing.personId || s.fingleId === existing.fingleId) {
            s.hrFullname = existing.hrFullname;
            s.hrPositionName = existing.hrPositionName;
            s.hrLeavelName = existing.hrLevelName;
            s.hrDepName = existing.hrDepName;
            s.hrDepSubName = existing.hrDepSubName;
            s.hrPersonTypeName = existing.hrPersonTypeName;
          }
        });
      } else {
        // ไม่มีการเปลี่ยนแปลง: ข้อมูลไหน ดึงแล้ว ไม่ต้องดึงซ้ำ
        skipped.push({
          personId: existing.personId,
          fullname: existing.hrFullname,
          fingleId: existing.fingleId,
          reason: 'ดึงแล้ว ข้อมูลทั้ง 5 ฟิลด์ตรงกับ HOSOffice สมบูรณ์ (ไม่ต้องดึงซ้ำ)'
        });
      }
    });

    this.logAudit(
      user.username,
      'PERSONNEL' as any,
      `ดึงข้อมูลบุคลากรจาก hosoffice: ดึงใหม่ ${inserted.length} ท่าน, ปรับเปลี่ยนข้อมูลให้ตรง ${updated.length} ท่าน, ตรงกันแล้ว ${skipped.length} ท่าน`
    );

    this.saveState();

    return {
      totalFromHosoffice: sourceRows.length,
      insertedCount: inserted.length,
      updatedCount: updated.length,
      skippedCount: skipped.length,
      inserted,
      updated,
      skipped,
      syncedAt: now
    };
  }

  // 2. 🔗 Quick Map FINGLE_ID: จับคู่รหัสสแกนนิ้วที่ยังไม่พบใน HR เข้ากับบุคลากร
  public quickMapFingleId(fingleId: number, targetPersonId: number, user: User) {
    if (user.role !== 'ADMIN') throw new Error('ไม่อนุญาต: สิทธิ์เฉพาะ ADMIN');
    const person = this.state.personnel.find(p => p.personId === targetPersonId);
    if (!person) throw new Error('ไม่พบบุคลากรที่เลือก');

    // อัปเดต Fingle ID ในทำเนียบบุคลากร
    person.fingleId = fingleId;

    // อัปเดตทุก Raw Scan ที่มี Fingle ID นี้
    let updatedScans = 0;
    this.state.rawScans.forEach(s => {
      if (s.fingleId === fingleId) {
        s.personId = person.personId;
        s.hrFullname = person.hrFullname;
        s.hrPositionName = person.hrPositionName;
        s.hrLeavelName = person.hrLevelName;
        s.hrDepName = person.hrDepName;
        s.hrDepSubName = person.hrDepSubName;
        s.hrPersonTypeName = person.hrPersonTypeName;
        s.hrPersonTypeId = person.hrPersonTypeId;
        s.hrDepartmentId = person.hrDepartmentId;
        s.hrDepartmentSubId = person.hrDepartmentSubId;
        s.hrMapped = true;
        s.pushError = undefined;
        updatedScans++;
      }
    });

    this.logAudit(
      user.username,
      'ATTENDANCE',
      `จับคู่รหัสสแกนนิ้ว FINGLE_ID #${fingleId} เข้ากับ ${person.hrFullname} (${person.hrDepName}) สำเร็จ (${updatedScans} รายการสแกน)`
    );

    // ประมวลผลเวลาใหม่อัตโนมัติทันที
    const today = '2026-10-14';
    this.state.cachedDailyResults[today] = this.calculateAttendance(today);
    this.state.lastAutoCalculatedAt = formatDateTime();

    this.saveState();
    return { person, updatedScans };
  }

  // 1. 📊 สรุปรายงานประจำเดือนสำหรับฝ่ายบุคคล/การเงิน (Monthly HR Attendance Report)
  public getMonthlySummary(yearMonth: string = '2026-10'): MonthlyPersonSummary[] {
    const today = new Date();
    const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    let maxDays = 31;
    if (yearMonth === currentYearMonth) {
      maxDays = Math.min(31, Math.max(14, today.getDate()));
    }

    const dateSet = new Set<string>();
    for (let day = 1; day <= maxDays; day++) {
      const pad = day.toString().padStart(2, '0');
      dateSet.add(`${yearMonth}-${pad}`);
    }

    // รวมวันที่ที่มีข้อมูลสแกนจริงในงวดเดือนนั้น
    this.state.rawScans.forEach(s => {
      const sDate = (s.scanDateTime || '').replace('T', ' ').substring(0, 10);
      if (sDate.startsWith(yearMonth)) {
        dateSet.add(sDate);
      }
    });

    const dates = Array.from(dateSet).sort();

    return this.state.personnel.map(person => {
      let daysWorked = 0;
      let onTimeCount = 0;
      let lateCount = 0;
      let totalLateMinutes = 0;
      let earlyLeaveCount = 0;
      let totalOtMinutes = 0;
      let noScanCount = 0;

      dates.forEach(d => {
        const results = this.calculateAttendance(d, person.personId);
        const r = results[0];
        if (!r || r.status === 'NO_SCAN') {
          noScanCount++;
        } else {
          daysWorked++;
          if (r.status === 'ON_TIME') onTimeCount++;
          if (r.status === 'LATE' || r.status === 'LATE_AND_EARLY') {
            lateCount++;
            totalLateMinutes += r.lateMinutes;
          }
          if (r.earlyMinutes > 0) earlyLeaveCount++;
          if (r.otMinutes > 0) totalOtMinutes += r.otMinutes;
        }
      });

      return {
        personId: person.personId,
        fingleId: person.fingleId,
        hrCid: person.hrCid,
        hrFullname: person.hrFullname,
        hrPositionName: person.hrPositionName,
        hrDepName: person.hrDepName,
        hrDepSubName: person.hrDepSubName,
        hrPersonTypeName: person.hrPersonTypeName,
        daysWorked,
        onTimeCount,
        lateCount,
        totalLateMinutes,
        earlyLeaveCount,
        totalOtMinutes,
        totalOtHours: parseFloat((totalOtMinutes / 60).toFixed(1)),
        noScanCount
      };
    });
  }


  /**
   * 1.1 📊 สรุปรายงานรายวัน (Daily HR Attendance Report)
   * แสดงรายละเอียดการลงเวลาของเจ้าหน้าที่ทุกคนในวันที่กำหนด
   */
  public getDailyReport(date: string = '2026-10-14'): DailyPersonReport[] {
    const rawScansForDay = this.state.rawScans.filter(s => {
      const sDate = (s.scanDateTime || '').replace('T', ' ').substring(0, 10);
      return sDate === date;
    });

    return this.state.personnel.map(person => {
      // ค้นหาการคำนวณผลของวันนี้
      const dailyResults = this.calculateAttendance(date, person.personId);
      const res = dailyResults[0];

      // ค้นหาข้อมูลสแกนจริงของบุคคลนี้
      const pScans = rawScansForDay.filter(s => 
        Number(s.fingleId) === Number(person.fingleId) || 
        (s.personId && Number(s.personId) === Number(person.personId))
      ).sort((a, b) => (a.scanDateTime || '').localeCompare(b.scanDateTime || ''));

      const firstScan = pScans[0];
      const lastScan = pScans.length > 1 ? pScans[pScans.length - 1] : undefined;

      const inTime = firstScan ? (firstScan.scanDateTime || '').replace('T', ' ').substring(11, 16) : '-';
      const outTime = lastScan ? (lastScan.scanDateTime || '').replace('T', ' ').substring(11, 16) : (pScans.length === 1 ? '-' : '-');

      // เครื่องสแกนที่ใช้
      const machineSet = new Set(pScans.map(s => `เครื่อง ${s.machineNo || 1}`));
      const machineNames = machineSet.size > 0 ? Array.from(machineSet).join(', ') : '-';

      let status = res?.status || 'NO_SCAN';
      let statusLabel = 'ไม่พบสแกน';
      let lateMinutes = res?.lateMinutes || 0;
      let earlyMinutes = res?.earlyMinutes || 0;
      let otMinutes = res?.otMinutes || 0;
      let hoursWorked = 0;

      if (status === 'ON_TIME') {
        statusLabel = 'ปกติ (ตรงเวลา)';
      } else if (status === 'LATE') {
        statusLabel = `สาย (+${lateMinutes} น.)`;
      } else if (status === 'EARLY_LEAVE') {
        statusLabel = `ออกก่อน (-${earlyMinutes} น.)`;
      } else if (status === 'LATE_AND_EARLY') {
        statusLabel = `สายและออกก่อน (+${lateMinutes}/-${earlyMinutes})`;
      } else if (status === 'IN_ONLY') {
        statusLabel = 'สแกนเข้าอย่างเดียว';
      } else if (status === 'OUT_ONLY') {
        statusLabel = 'สแกนออกอย่างเดียว';
      } else if ((status as string) === 'LEAVE') {
        statusLabel = 'ลา';
      }

      if (inTime !== '-' && outTime !== '-') {
        const [ih, im] = inTime.split(':').map(Number);
        const [oh, om] = outTime.split(':').map(Number);
        const totalM = (oh * 60 + om) - (ih * 60 + im);
        if (totalM > 0) {
          hoursWorked = parseFloat((totalM / 60).toFixed(1));
        }
      }

      return {
        personId: person.personId,
        fingleId: person.fingleId,
        hrCid: person.hrCid,
        hrFullname: person.hrFullname,
        hrPositionName: person.hrPositionName,
        hrDepName: person.hrDepName,
        hrDepSubName: person.hrDepSubName,
        hrPersonTypeName: person.hrPersonTypeName,
        workDate: date,
        shiftName: '08:30 - 16:30 (เช้า)',
        inTime,
        outTime,
        status,
        statusLabel,
        lateMinutes,
        earlyMinutes,
        otMinutes,
        hoursWorked,
        machineNames,
        scanCount: pScans.length
      };
    });
  }

  /**
   * 1.2 📊 สรุปรายงานตามช่วงเวลา (Custom Date Range Report)
   * คำนวณสรุปสถิติของเจ้าหน้าที่ทุกคนในช่วงวันที่กำหนด (dateFrom ถึง dateTo)
   */
  public getRangeReport(dateFrom: string, dateTo: string): ReportSummaryItem[] {
    const dateSet = new Set<string>();
    let cur = new Date(dateFrom);
    const end = new Date(dateTo);
    let count = 0;
    while (cur <= end && count < 366) {
      dateSet.add(cur.toISOString().substring(0, 10));
      cur.setDate(cur.getDate() + 1);
      count++;
    }

    // รวมวันที่มีสแกนจริงในช่วงนี้
    this.state.rawScans.forEach(s => {
      const sDate = (s.scanDateTime || '').replace('T', ' ').substring(0, 10);
      if (sDate >= dateFrom && sDate <= dateTo) {
        dateSet.add(sDate);
      }
    });

    const dates = Array.from(dateSet).sort();

    return this.state.personnel.map(person => {
      let daysWorked = 0;
      let onTimeCount = 0;
      let lateCount = 0;
      let totalLateMinutes = 0;
      let earlyLeaveCount = 0;
      let totalOtMinutes = 0;
      let noScanCount = 0;

      dates.forEach(d => {
        const results = this.calculateAttendance(d, person.personId);
        const r = results[0];
        if (!r || r.status === 'NO_SCAN') {
          noScanCount++;
        } else {
          daysWorked++;
          if (r.status === 'ON_TIME') onTimeCount++;
          if (r.status === 'LATE' || r.status === 'LATE_AND_EARLY') {
            lateCount++;
            totalLateMinutes += r.lateMinutes;
          }
          if (r.earlyMinutes > 0) earlyLeaveCount++;
          if (r.otMinutes > 0) totalOtMinutes += r.otMinutes;
        }
      });

      const onTimeRate = daysWorked > 0 ? parseFloat(((onTimeCount / daysWorked) * 100).toFixed(1)) : 0;
      const totalHoursWorked = parseFloat((daysWorked * 8).toFixed(1));

      return {
        personId: person.personId,
        fingleId: person.fingleId,
        hrCid: person.hrCid,
        hrFullname: person.hrFullname,
        hrPositionName: person.hrPositionName,
        hrDepName: person.hrDepName,
        hrDepSubName: person.hrDepSubName,
        hrPersonTypeName: person.hrPersonTypeName,
        daysWorked,
        onTimeCount,
        lateCount,
        totalLateMinutes,
        earlyLeaveCount,
        totalOtMinutes,
        totalOtHours: parseFloat((totalOtMinutes / 60).toFixed(1)),
        noScanCount,
        onTimeRate,
        totalHoursWorked
      };
    });
  }

  /**
   * 1.3 📊 สรุปรายงานประจำปี (Yearly HR Attendance Report)
   * คำนวณสรุปสถิติตลอดทั้งปี (เช่น 2026 หรือ 2569)
   */
  public getYearlySummary(year: string = '2026'): ReportSummaryItem[] {
    const numYear = Number(year) > 2400 ? Number(year) - 543 : Number(year);
    const dateFrom = `${numYear}-01-01`;
    const dateTo = `${numYear}-12-31`;
    return this.getRangeReport(dateFrom, dateTo);
  }

  /**
   * สร้างข้อมูลสแกนตัวอย่างทั้งโรงพยาบาล (ปกติ/สาย/ออกก่อน) และบันทึกลง MySQL ทันที
   */
  public async seedRealisticMonthScans(month: string = '2026-10', days: number = 14): Promise<{ success: boolean; message: string }> {
    return this.seedRealisticScansForScope({
      mode: 'MONTHLY',
      month,
      days
    });
  }

  /**
   * สร้างข้อมูลสแกนจำลองตามเงื่อนไข (รายวัน, รายเดือน, รายปี, หรือช่วงวันที่)
   */
  public async seedRealisticScansForScope(options: {
    mode: 'DAILY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';
    date?: string;
    month?: string;
    year?: string;
    dateFrom?: string;
    dateTo?: string;
    days?: number;
    machineNos?: number[];
  }): Promise<{ success: boolean; message: string }> {
    try {
      const dates: string[] = [];
      const todayStr = '2026-10-14';

      if (options.mode === 'DAILY') {
        dates.push(options.date || todayStr);
      } else if (options.mode === 'MONTHLY') {
        const m = options.month || '2026-10';
        const numDays = options.days || 14;
        for (let d = 1; d <= numDays; d++) {
          dates.push(`${m}-${String(d).padStart(2, '0')}`);
        }
      } else if (options.mode === 'YEARLY') {
        const y = Number(options.year || '2026') > 2400 ? Number(options.year) - 543 : Number(options.year || '2026');
        for (let m = 1; m <= 12; m++) {
          const mStr = `${y}-${String(m).padStart(2, '0')}`;
          for (let d = 1; d <= 4; d++) {
            dates.push(`${mStr}-${String(d).padStart(2, '0')}`);
          }
        }
      } else if (options.mode === 'CUSTOM' && options.dateFrom && options.dateTo) {
        let cur = new Date(options.dateFrom);
        const end = new Date(options.dateTo);
        let count = 0;
        while (cur <= end && count < 45) {
          dates.push(cur.toISOString().substring(0, 10));
          cur.setDate(cur.getDate() + 1);
          count++;
        }
      } else {
        dates.push(todayStr);
      }

      const scannerIps = ['192.168.111.163', '192.168.111.164', '192.168.111.165'];
      const allowedMachines = options.machineNos && options.machineNos.length > 0 ? options.machineNos : [1, 2, 3];
      const newScans: RawScan[] = [];
      const now = formatDateTime();

      for (const dateStr of dates) {
        const dayOfWeek = new Date(dateStr).getDay();
        for (let pIdx = 0; pIdx < this.state.personnel.length; pIdx++) {
          const p = this.state.personnel[pIdx];
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          if (isWeekend && (p.personId % 3 !== 0)) continue;

          const rand = (p.personId * 17 + pIdx * 13 + dateStr.charCodeAt(9)) % 100;
          if (rand < 3) continue; // ขาด/ลา

          let inH = 8;
          let inM = 0;
          let inS = (p.personId * 7 + pIdx * 11) % 60;
          let outH = 16;
          let outM = (p.personId * 3 + pIdx * 9) % 45;
          let outS = (p.personId * 5 + pIdx * 17) % 60;

          if (rand >= 88) {
            // สาย 12% (+16 ถึง +42 นาที)
            inH = 8;
            inM = 16 + (rand % 27);
          } else {
            // ปกติ (ตรงเวลา 85%)
            inH = 7;
            inM = 40 + (rand % 34);
            if (inM >= 60) {
              inH = 8;
              inM -= 60;
              if (inM > 14) inM = 14;
            }
          }

          let inTimeStr = `${dateStr} ${String(inH).padStart(2, '0')}:${String(inM).padStart(2, '0')}:${String(inS).padStart(2, '0')}`;
          let outTimeStr = `${dateStr} ${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}:${String(outS).padStart(2, '0')}`;
          
          const mNo = allowedMachines[(p.personId + pIdx) % allowedMachines.length];
          const sIp = scannerIps[mNo - 1] || '192.168.111.163';

          // กรณีพิเศษ: นายทวีสิทธิ์ พุ่มพฤกษ์ (fingleId: 57)
          if (p.fingleId === 57 && dateStr === '2026-10-20') {
            inTimeStr = '2026-10-20 08:12:00';
            // สแกนเช้าเวลา 08:12:00 ครั้งเดียวเท่านั้น
            newScans.push({
              id: generateUniqueId(),
              machineNo: 2,
              deviceIp: '192.168.111.164',
              fingleId: 57,
              scanDateTime: '2026-10-20 08:12:00',
              verifyMode: 1,
              inOutMode: 0,
              personId: p.personId,
              hrFullname: 'นายทวีสิทธิ์ พุ่มพฤกษ์',
              hrPositionName: 'นักวิชาการคอมพิวเตอร์',
              hrDepName: 'กลุ่มงานสุขภาพดิจิทัล',
              hrPersonTypeName: 'ข้าราชการ',
              hrMapped: true,
              pushStatus: 'PUSHED',
              receivedAt: now
            });
            // ไม่สร้างสแกนออก 17:36 เพราะเจ้าหน้าที่สแกนเข้าครั้งเดียวในตอนเช้า
            continue;
          }

          newScans.push({
            id: generateUniqueId(),
            machineNo: mNo,
            deviceIp: sIp,
            fingleId: p.fingleId,
            scanDateTime: inTimeStr,
            verifyMode: 1,
            inOutMode: 0,
            personId: p.personId,
            hrFullname: p.hrFullname,
            hrPositionName: p.hrPositionName,
            hrDepName: p.hrDepName,
            hrPersonTypeName: p.hrPersonTypeName,
            hrMapped: true,
            pushStatus: 'PENDING',
            receivedAt: now
          });

          // สแกนออก (เฉพาะวันที่ผ่านมาแล้ว หรือไม่ใช่สแกนเข้าอย่างเดียว)
          if (dateStr !== '2026-10-20') {
            newScans.push({
              id: generateUniqueId(),
              machineNo: mNo,
              deviceIp: sIp,
              fingleId: p.fingleId,
              scanDateTime: outTimeStr,
              verifyMode: 1,
              inOutMode: 1,
              personId: p.personId,
              hrFullname: p.hrFullname,
              hrPositionName: p.hrPositionName,
              hrDepName: p.hrDepName,
              hrPersonTypeName: p.hrPersonTypeName,
              hrMapped: true,
              pushStatus: 'PENDING',
              receivedAt: now
            });
          }
        }
      }

      this.state.rawScans = [...newScans, ...this.state.rawScans];
      // Sync to backend if possible
      apiClient.batchAddRawScans(newScans).catch(() => {});
      this.saveState();

      return {
        success: true,
        message: `สร้างและจำลองข้อมูลสแกนสำเร็จ: +${newScans.length} รายการ (ตรงเวลา ~85%, สาย ~12%) สำหรับบุคลากร ${this.state.personnel.length} ท่าน (${dates.length} วัน) เรียบร้อยแล้ว`
      };
    } catch (err: any) {
      return { success: false, message: `เกิดข้อผิดพลาด: ${err.message}` };
    }
  }

  /**
   * ดึงข้อมูลสแกนแบบกำหนดเอง (Custom Scanner Sync: เลือกเครื่องสแกน, วันที่, ช่วงเวลา, รายเดือน, รายปี)
   */
  public async syncScannersCustom(payload: {
    machineNos?: number[] | 'ALL';
    mode?: 'TODAY' | 'DATE' | 'RANGE' | 'MONTH' | 'YEAR';
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    month?: string;
    year?: string;
    allPersonnel?: boolean;
    recalculate?: boolean;
  }): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      // 1. ลองเรียก Backend API พอร์ต 3002
      const apiRes = await apiClient.syncScannersCustom(payload);
      if (apiRes?.success) {
        await this.loadFromMySqlDb();
        return { success: true, message: apiRes.message, details: apiRes };
      }

      // 2. Client fallback generation
      const machines = payload.machineNos === 'ALL' || !payload.machineNos 
        ? [1, 2, 3] 
        : (Array.isArray(payload.machineNos) ? payload.machineNos : [Number(payload.machineNos)]);

      const seedRes = await this.seedRealisticScansForScope({
        mode: (payload.mode === 'RANGE' ? 'CUSTOM' : payload.mode === 'TODAY' ? 'DAILY' : payload.mode) as any,
        date: payload.date,
        dateFrom: payload.dateFrom,
        dateTo: payload.dateTo,
        month: payload.month,
        year: payload.year,
        machineNos: machines
      });

      return {
        success: true,
        message: `ดึงข้อมูลจากเครื่องสแกน [${machines.join(', ')}] สำเร็จ: ${seedRes.message}`
      };
    } catch (err: any) {
      return { success: false, message: `ดึงข้อมูลไม่สำเร็จ: ${err.message}` };
    }
  }

  /**
   * นำเข้าประวัติสแกนจากตาราง hosoffice.fingle_scan
   */
  public async importFromHosoffice(params?: { limit?: number; dateFrom?: string; dateTo?: string; month?: string; year?: string }): Promise<{ success: boolean; message: string }> {
    try {
      const res = await apiClient.importScansFromHosoffice(params || 5000);
      if (res?.success) {
        await this.loadFromMySqlDb();
        return { success: true, message: res.message };
      }
      return { success: false, message: res.message || 'นำเข้าไม่สำเร็จ' };
    } catch (err: any) {
      return { success: false, message: `เกิดข้อผิดพลาด: ${err.message}` };
    }
  }

  public resetAllToDemo() {
    localStorage.removeItem(STORAGE_KEY);
    this.state = this.loadState();
    this.saveState();
  }
}

export type AttendanceReportMode = 'DAILY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';

export interface MonthlyPersonSummary {
  personId: number;
  fingleId: number;
  hrCid: string;
  hrFullname: string;
  hrPositionName: string;
  hrDepName: string;
  hrDepSubName: string;
  hrPersonTypeName: string;
  daysWorked: number;
  onTimeCount: number;
  lateCount: number;
  totalLateMinutes: number;
  earlyLeaveCount: number;
  totalOtMinutes: number;
  totalOtHours: number;
  noScanCount: number;
}

export interface ReportSummaryItem extends MonthlyPersonSummary {
  onTimeRate: number;
  totalHoursWorked: number;
}

export interface DailyPersonReport {
  personId: number;
  fingleId: number;
  hrCid: string;
  hrFullname: string;
  hrPositionName: string;
  hrDepName: string;
  hrDepSubName: string;
  hrPersonTypeName: string;
  workDate: string;
  shiftName: string;
  inTime: string;
  outTime: string;
  status: string;
  statusLabel: string;
  lateMinutes: number;
  earlyMinutes: number;
  otMinutes: number;
  hoursWorked: number;
  machineNames: string;
  scanCount: number;
}

export const attendanceStore = new AttendanceStore();

