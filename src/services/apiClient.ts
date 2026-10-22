/**
 * Samchuk Attendance System - API Client Service
 * พอร์ต 3002: API สำหรับรับ-ส่งข้อมูล HOSxP/Hosoffice และควบคุมเครื่องสแกน HIP CMiF68S
 * Endpoint หลัก: https://10.2.0.13:3002
 * Web Frontend: https://10.2.0.13:3001/Sam_Att/
 */

export interface ApiHealthResponse {
  status: string;
  service: string;
  version: string;
  port: number;
  endpoint: string;
  frontendUrl: string;
  architecture: string;
  thaiSupport: string;
  serverTime: string;
}

export interface ApiPushBatchPayload {
  dateFrom?: string;
  dateTo?: string;
  machineNo?: number;
  pendingOnly?: boolean;
  includeUnmapped?: boolean;
  performedBy?: string;
}

export interface ApiPushBatchResponse {
  success: boolean;
  message: string;
  data?: {
    batchId: string;
    insertedCount: number;
    skippedCount: number;
    failedCount: number;
    executedAt: string;
    details?: string;
  };
}

const STORAGE_API_KEY = 'samchuk_api_endpoint_url';

export const resolveDefaultApiUrl = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname || 'localhost';
    return `http://${host}:3002/api/Sam_Att`;
  }
  return 'http://localhost:3002/api/Sam_Att';
};

export const DEFAULT_API_URL = resolveDefaultApiUrl();
export const HOSPITAL_WEB_URL = 'http://10.2.0.13:3001/Sam_Att/';

class ApiClientService {
  private customBaseUrl: string = resolveDefaultApiUrl();
  private isOnline: boolean = false;
  private lastPingMs: number = 0;
  private lastCheckTime: string = '';
  private listeners: Array<() => void> = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_API_KEY);
      if (saved && saved.trim()) {
        this.customBaseUrl = saved.trim();
      } else {
        this.customBaseUrl = resolveDefaultApiUrl();
      }
    }
  }

  public isMixedContentBlocked(): boolean {
    if (typeof window === 'undefined') return false;
    return window.location.protocol === 'https:' && this.customBaseUrl.startsWith('http://');
  }

  public getHttpFallbackUrl(): string {
    if (typeof window === 'undefined') return 'http://10.2.0.13:3001/Sam_Att/';
    return window.location.href.replace(/^https:/i, 'http:');
  }

  public getBaseUrl(): string {
    return this.customBaseUrl;
  }

  public setBaseUrl(url: string) {
    this.customBaseUrl = url.trim().replace(/\/+$/, '');
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_API_KEY, this.customBaseUrl);
    }
    this.notify();
    this.checkHealth();
  }

  public resetToDefault() {
    this.setBaseUrl(DEFAULT_API_URL);
  }

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(cb => {
      try {
        cb();
      } catch (e) {
        console.error('Error in API listener', e);
      }
    });
  }

  public getStatus() {
    const is3005 = this.customBaseUrl.includes(':3005');
    return {
      baseUrl: this.customBaseUrl,
      isOnline: this.isOnline,
      lastPingMs: this.lastPingMs,
      lastCheckTime: this.lastCheckTime,
      frontendUrl: HOSPITAL_WEB_URL,
      apiPort: is3005 ? 3005 : 3002,
      frontendPort: 3001
    };
  }

  /**
   * ทดสอบการเชื่อมต่อ API พร้อม Auto-Fallback ระหว่างพอร์ต 3002 และ 3005
   */
  public async checkHealth(): Promise<{ online: boolean; latencyMs: number; data?: ApiHealthResponse; error?: string }> {
    const start = performance.now();
    const tryPing = async (url: string): Promise<{ ok: boolean; data?: ApiHealthResponse; status?: number; statusText?: string }> => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(`${url}/api/health`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data: ApiHealthResponse = await res.json();
          return { ok: true, data };
        }
        return { ok: false, status: res.status, statusText: res.statusText };
      } catch {
        return { ok: false };
      }
    };

    // 1. ลอง Ping ที่ URL ปัจจุบันก่อน
    const primaryResult = await tryPing(this.customBaseUrl);
    if (primaryResult.ok && primaryResult.data) {
      const elapsed = Math.round(performance.now() - start);
      this.lastPingMs = elapsed;
      this.lastCheckTime = new Date().toLocaleTimeString('th-TH');
      this.isOnline = true;
      this.notify();
      return { online: true, latencyMs: elapsed, data: primaryResult.data };
    }

    // 2. ถ้าไม่สำเร็จ ลอง Ping Candidate สำรอง (3005 หรือ 3002)
    const host = typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost';
    const fallbackUrls = [
      `http://${host}:3005`,
      `http://${host}:3002/api/Sam_Att`
    ].filter(u => u !== this.customBaseUrl);

    for (const altUrl of fallbackUrls) {
      const altResult = await tryPing(altUrl);
      if (altResult.ok && altResult.data) {
        const elapsed = Math.round(performance.now() - start);
        this.customBaseUrl = altUrl;
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_API_KEY, altUrl);
        }
        this.lastPingMs = elapsed;
        this.lastCheckTime = new Date().toLocaleTimeString('th-TH');
        this.isOnline = true;
        this.notify();
        return { online: true, latencyMs: elapsed, data: altResult.data };
      }
    }

    const elapsed = Math.round(performance.now() - start);
    this.isOnline = false;
    this.lastPingMs = elapsed;
    this.lastCheckTime = new Date().toLocaleTimeString('th-TH');
    this.notify();
    return { online: false, latencyMs: elapsed, error: 'Cannot connect to API (:3002 or :3005)' };
  }

  /**
   * ส่ง Batch ไปยัง API พอร์ต 3002 (POST /api/push/batch)
   */
  public async pushBatch(payload: ApiPushBatchPayload): Promise<ApiPushBatchResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(`${this.customBaseUrl}/api/push/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`API Error (${res.status}): ${errorText || res.statusText}`);
      }

      const data: ApiPushBatchResponse = await res.json();
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ API :3002';
      throw new Error(msg);
    }
  }

  /**
   * สั่งเครื่องสแกนดึงข้อมูลทันทีผ่านพอร์ต 3002
   */
  public async testScannerSocket(ip: string, port: number = 5005) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/scanners/test-socket?ip=${encodeURIComponent(ip)}&port=${port}`);
      return await res.json();
    } catch (err: unknown) {
      return {
        reachable: false,
        ip,
        port,
        error: err instanceof Error ? err.message : 'Connection failed'
      };
    }
  }

  /**
   * ทดสอบเชื่อมต่อเครื่องสแกนผ่าน POST /api/scanners/test-connection
   */
  public async testScannerConnection(req: { machineNo: number; ipAddress: string; port?: number; license?: number }) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/scanners/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineNo: req.machineNo,
          ipAddress: req.ipAddress,
          port: req.port || 5005,
          license: req.license || 1261,
          timeoutMs: 3000
        })
      });

      const rawText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(rawText);
      } catch {
        return {
          success: false,
          ipAddress: req.ipAddress,
          port: req.port || 5005,
          message: `Backend พอร์ต 3002 ตอบกลับ Status ${res.status} (ยังไม่ได้ลงทะเบียน Route /api/scanners/test-connection ใน Backend Service)`
        };
      }

      if (!res.ok) {
        return {
          success: false,
          ipAddress: req.ipAddress,
          port: req.port || 5005,
          message: data?.message || `Backend ส่งรหัสผิดพลาด (${res.status})`
        };
      }

      return data;
    } catch (err: unknown) {
      return {
        success: false,
        ipAddress: req.ipAddress,
        port: req.port || 5005,
        message: (err instanceof Error && err.message !== 'Failed to fetch')
          ? err.message
          : `ไม่สามารถติดต่อ Backend API ที่ ${this.customBaseUrl} ได้ (กรุณาตรวจสอบว่า Service พอร์ต 3002 เปิดรันอยู่หรือไม่)`
      };
    }
  }

  /**
   * ทดสอบทุกเครื่องพร้อมกันผ่าน POST /api/scanners/test-all
   */
  public async testAllScanners(scanners: Array<{ machineNo: number; ipAddress: string; port?: number; license?: number }>) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/scanners/test-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanners)
      });

      const rawText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(rawText);
      } catch {
        return {
          success: false,
          message: `Backend พอร์ต 3002 ตอบกลับ Status ${res.status} (ยังไม่มี Route /api/scanners/test-all)`
        };
      }

      return data;
    } catch (err: unknown) {
      return {
        success: false,
        message: (err instanceof Error && err.message !== 'Failed to fetch')
          ? err.message
          : `ไม่สามารถติดต่อ Backend API ที่ ${this.customBaseUrl} ได้`
      };
    }
  }

  /**
   * สั่งให้ Backend ดึงข้อมูลสแกนจริงจากเครื่องสแกนและบันทึกลง MySQL ทันที
   */
  public async syncFromScanners(machineNo?: number, date?: string) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/scanners/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineNo, date })
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Sync failed'
      };
    }
  }

  /**
   * สั่งให้ Backend คำนวณผลเวลาทำงานและบันทึกลง MySQL attendance_daily_result ทันที
   */
  public async recalculateAttendanceInDb(date?: string) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/attendance/recalculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date })
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Recalculate failed'
      };
    }
  }

  /**
   * สั่งให้ Backend สร้างและบันทึกประวัติการสแกนนิ้วประจำเดือน (ปกติ/สาย/ออกก่อน) สำหรับบุคลากรทุกคน
   */
  public async seedMonthAttendance(month: string = '2026-10', days: number = 14) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/attendance/seed-month`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, days })
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        success: false,
        message: this.getFriendlyFetchError(err, 'Backend API (Seed Month)')
      };
    }
  }

  /**
   * นำเข้าข้อมูลประวัติสแกนดิบจากตาราง hosoffice.fingle_scan เข้าสู่ attendance_raw_scan
   */
  public async importScansFromHosoffice(options: number | { 
    limit?: number; 
    dateFrom?: string; 
    dateTo?: string; 
    month?: string; 
    year?: string;
    strategy?: 'SKIP_DUPLICATES' | 'OVERWRITE';
    preview?: boolean;
  } = 5000) {
    try {
      const payload = typeof options === 'number' ? { limit: options } : options;
      const res = await fetch(`${this.customBaseUrl}/api/scans/import-from-hosoffice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        success: false,
        message: this.getFriendlyFetchError(err, 'Backend API (Hosoffice Import)')
      };
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
    strategy?: 'SKIP_DUPLICATES' | 'OVERWRITE';
    preview?: boolean;
  }) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/scanners/sync-custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        success: false,
        message: this.getFriendlyFetchError(err, 'Backend API (Custom Scanner Sync)')
      };
    }
  }

  /**
   * ข้อมูลสรุปภาพรวมฐานข้อมูลทั้งหมดในระบบ (Dual Database Overview)
   */
  public async getDatabaseOverview() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/db/overview`);
      return await res.json();
    } catch {
      return {
        success: true,
        totalDatabases: 2,
        databases: [
          {
            id: 1,
            name: 'samchuk_attendance',
            role: 'ฐานข้อมูลระบบลงเวลาและตารางเวร (Dedicated Attendance DB)',
            description: 'จัดเก็บสแกนดิบ, ตารางกะ, และผลการคำนวณเวลาเข้า-ออก แยกอิสระเพื่อความเร็วและปลอดภัย'
          },
          {
            id: 2,
            name: 'hosoffice',
            role: 'ฐานข้อมูลระบบโรงพยาบาล HOSxP / HosOffice (HR Master DB)',
            description: 'จัดเก็บข้อมูลบุคลากรทั้งโรงพยาบาล, กลุ่มงาน, ตำแหน่ง, และตารางสแกนเดิม fingle_scan'
          }
        ]
      };
    }
  }

  private getFriendlyFetchError(err: unknown, serviceName: string = 'Backend API'): string {
    const rawMsg = err instanceof Error ? err.message : 'Failed';
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    if (rawMsg.toLowerCase().includes('failed to fetch') || rawMsg.toLowerCase().includes('networkerror')) {
      if (isHttps) {
        return `ไม่สามารถติดต่อ ${serviceName} พอร์ต 3002 ได้ (เกิดจากบราวเซอร์บล็อก Mixed Content เพราะเข้าเว็บด้วย HTTPS) -> กรุณาเปลี่ยน URL หน้าเว็บเป็น http://10.2.0.13:3001/Sam_Att/ (ใช้ http:// แทน https://)`;
      }
      return `ไม่สามารถติดต่อ ${serviceName} พอร์ต 3002 ได้ (${rawMsg}) -> กรุณาตรวจสอบว่าได้รัน Backend Gateway พอร์ต 3002 บนเซิร์ฟเวอร์แล้วหรือไม่ และ Windows Firewall เปิดพอร์ต 3002 หรือยัง`;
    }
    return `ไม่สามารถติดต่อ ${serviceName} ได้ (${rawMsg})`;
  }

  /**
   * ทดสอบการเชื่อมต่อฐานข้อมูล MySQL samchuk_attendance ผ่าน Backend API
   */
  public async testDatabaseConnection() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/db/test`);
      const data = await res.json();
      return data;
    } catch (err: unknown) {
      return {
        success: false,
        message: this.getFriendlyFetchError(err, 'Backend API (samchuk_attendance)')
      };
    }
  }

  /**
   * ทดสอบการเชื่อมต่อฐานข้อมูล hosoffice ผ่าน Backend API
   */
  public async testHosofficeDatabase() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/db/test-hosoffice`);
      const data = await res.json();
      return data;
    } catch (err: unknown) {
      return {
        success: false,
        message: this.getFriendlyFetchError(err, 'Backend API (hosoffice)')
      };
    }
  }

  /**
   * ทดสอบการเชื่อมต่อทั้ง 2 ฐานข้อมูลพร้อมกัน (Dual DB Test)
   */
  public async testBothDatabases() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/db/test-both`);
      const data = await res.json();
      return data;
    } catch (err: unknown) {
      return {
        success: false,
        message: this.getFriendlyFetchError(err, 'Backend API')
      };
    }
  }

  /**
   * สแกนทดสอบบัญชีผู้ใช้ MySQL ทั่วไปอัตโนมัติ (Credentials Diagnostic)
   */
  public async quickProbeAuth(host?: string, port?: number) {
    try {
      const q = new URLSearchParams();
      if (host) q.append('host', host);
      if (port) q.append('port', port.toString());
      const res = await fetch(`${this.customBaseUrl}/api/db/probe-auth?${q.toString()}`);
      return await res.json();
    } catch (err: unknown) {
      return {
        success: false,
        message: `ไม่สามารถติดต่อ Backend API เพื่อสแกนบัญชีผู้ใช้ได้ (${err instanceof Error ? err.message : 'Failed'})`
      };
    }
  }

  /**
   * ปรับแต่งการตั้งค่าการเชื่อมต่อ MySQL บนเซิร์ฟเวอร์ Backend และบันทึก
   */
  public async configureDatabase(payload: { host: string; port?: number; user?: string; password?: string; database?: string; hosofficeDb?: string }) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/db/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        success: false,
        message: `ส่งการตั้งค่าไปยัง Backend ไม่สำเร็จ (${err instanceof Error ? err.message : 'Failed'})`
      };
    }
  }

  /**
   * สั่งให้ Backend สร้างโครงสร้างตาราง samchuk_attendance ลงใน MySQL อัตโนมัติ
   */
  public async initDatabaseTables() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/db/init`, { method: 'POST' });
      return await res.json();
    } catch (err: unknown) {
      return {
        success: false,
        message: `สั่งสร้างตารางไม่สำเร็จ: ${err instanceof Error ? err.message : 'Failed'}`
      };
    }
  }

  /**
   * ดึงรายการกะจาก MySQL โดยตรง
   */
  public async getShiftsFromDb() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/shifts`);
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * สร้างกะใหม่ลงใน MySQL โดยตรง
   */
  public async createShiftInDb(shift: any) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/shifts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shift)
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * แก้ไขกะใน MySQL โดยตรง
   */
  public async updateShiftInDb(id: number, shift: any) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/shifts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shift)
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * ลบกะออกจาก MySQL โดยตรง
   */
  public async deleteShiftFromDb(id: number) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/shifts/${id}`, {
        method: 'DELETE'
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * ซิงค์กะทั้งหมดจากหน้าเว็บเข้าสู่ MySQL
   */
  public async syncShiftsToDb(shifts: any[]) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/shifts/sync-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shifts })
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * ซ่อมแซมและปรับปรุงชื่อภาษาไทย 4 กะหลัก (เช้า, บ่าย, ดึก, เช้าควบบ่าย) ใน MySQL
   */
  public async repairThaiShifts() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/shifts/repair-thai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * ดึงข้อมูลสแกน (attendance_raw_scan) จาก MySQL โดยตรง (รองรับค้นหา, ช่วงวันที่, หรือจำกัดจำนวน)
   */
  public async getRawScansFromDb(params?: number | {
    limit?: number;
    search?: string;
    fingleId?: number;
    personId?: number;
    date?: string;
    month?: string;
    dateFrom?: string;
    dateTo?: string;
    machineNo?: number | string;
    pushStatus?: string;
  }) {
    try {
      let queryStr = '';
      if (typeof params === 'number') {
        queryStr = `limit=${params}`;
      } else if (params && typeof params === 'object') {
        const qp = new URLSearchParams();
        if (params.limit) qp.set('limit', String(params.limit));
        if (params.search) qp.set('search', params.search);
        if (params.fingleId) qp.set('fingleId', String(params.fingleId));
        if (params.personId) qp.set('personId', String(params.personId));
        if (params.date) qp.set('date', params.date);
        if (params.month) qp.set('month', params.month);
        if (params.dateFrom) qp.set('dateFrom', params.dateFrom);
        if (params.dateTo) qp.set('dateTo', params.dateTo);
        if (params.machineNo) qp.set('machineNo', String(params.machineNo));
        if (params.pushStatus) qp.set('pushStatus', params.pushStatus);
        queryStr = qp.toString();
      } else {
        queryStr = 'limit=5000';
      }

      const res = await fetch(`${this.customBaseUrl}/api/raw-scans?${queryStr}`);
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * ลบรายการสแกนดิบ 1 รายการจาก MySQL (กรณีสแกนทดสอบหรือข้อมูลซ้ำ)
   */
  public async deleteRawScanFromDb(id: number | string) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/raw-scans/${id}`, {
        method: 'DELETE'
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * บันทึกข้อมูลสแกนใหม่ 1 รายการลง MySQL โดยตรง
   */
  public async addRawScanToDb(scan: any) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/raw-scans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scan)
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * บันทึกข้อมูลสแกนแบบกลุ่มลง MySQL attendance_raw_scan
   */
  public async batchAddRawScans(scans: any[]) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/raw-scans/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scans })
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * ดึงผลการประมวลผลเวลา (attendance_daily_result) จาก MySQL ตามวันที่
   */
  public async getDailyAttendanceFromDb(date?: string) {
    try {
      const queryDate = date ? `?date=${encodeURIComponent(date)}` : '';
      const res = await fetch(`${this.customBaseUrl}/api/attendance/daily${queryDate}`);
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * บันทึกผลการประมวลผลเวลา (attendance_daily_result) ลง MySQL แบบกลุ่ม
   */
  public async saveDailyAttendanceToDb(results: any[]) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/attendance/daily/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results })
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }


  /**
   * ล้างผลการประมวลผลเวลา (attendance_daily_result) ใน MySQL ทั้งหมด
   */
  public async clearDailyAttendanceFromDb() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/attendance/daily/clear`, {
        method: 'DELETE'
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * ล้างข้อมูลสแกนทั้งหมดใน MySQL
   */
  public async clearAllRawScansFromDb() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/raw-scans/clear-all`, {
        method: 'POST'
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * เติมข้อมูลสแกนตัวอย่างจำลองลง MySQL
   */
  public async seedSampleRawScansToDb() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/raw-scans/seed-sample`, {
        method: 'POST'
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * ดึงข้อมูลบุคลากรจากฐานข้อมูลที่ 1: samchuk_attendance.attendance_personnel (ค่าเริ่มต้นปกติ ไม่แตะต้อง hosoffice)
   */
  public async getPersonnelFromDb() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/personnel`);
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * สั่งซิงค์รายชื่อบุคลากรจาก hosoffice เข้าสู่ฐาน samchuk_attendance (ทำงานเมื่อผู้ใช้กดปุ่มเท่านั้น)
   */
  public async syncPersonnelFromHosoffice() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/personnel/sync-from-hosoffice`, {
        method: 'POST'
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * ล้างข้อมูลบุคลากรในฐาน samchuk_attendance
   */
  public async clearPersonnelInDb() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/personnel/clear`, {
        method: 'DELETE'
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * ดึงข้อมูลบุคลากรจาก hosoffice.hr_person โดยตรง (เมื่อต้องการตรวจสอบข้อมูลต้นทาง)
   */
  public async getPersonnelFromHosoffice(limit: number = 500) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/hosoffice/personnel?limit=${limit}`);
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * ทดสอบบันทึกข้อมูลสแกนเวลาเข้า hosoffice.fingle_scan
   */
  public async testPushToHosoffice(payload?: { fingleId?: number; scanDateTime?: string; machineNo?: number }) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/hosoffice/test-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * Probe ตรวจสอบพอร์ต 3306 บนหลาย IP พร้อมกัน
   */
  public async probeDatabasePorts() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/db/probe`);
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * ดึงประวัติ Push Batches จาก MySQL
   */
  public async getPushBatchesFromDb() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/push/batches`);
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed', data: [] };
    }
  }

  /**
   * ยกเว้นรายการสแกนดิบไม่ให้นำมารวมในคิวส่ง (Exclude)
   */
  public async excludeRawScan(id: number | string) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/raw-scans/${id}/exclude`, {
        method: 'POST'
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * รีเฟรชข้อมูลบุคลากรจาก hosoffice.hr_person และ Map ใหม่อัตโนมัติ
   */
  public async refreshPersonnelMapping() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/hosoffice/personnel/refresh-mapping`, {
        method: 'POST'
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * ดึงรายการประเภทบุคลากรและเวลากะจาก MySQL
   */
  public async getPersonnelTypes() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/personnel-types`);
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed', data: [] };
    }
  }

  /**
   * เพิ่มประเภทบุคลากรใหม่ใน MySQL
   */
  public async createPersonnelType(data: any) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/personnel-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * อัปเดตประเภทบุคลากรใน MySQL
   */
  public async updatePersonnelType(id: number, data: any) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/personnel-types/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * ลบประเภทบุคลากรใน MySQL
   */
  public async deletePersonnelType(id: number) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/personnel-types/${id}`, {
        method: 'DELETE'
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * คืนค่าประเภทบุคลากรเริ่มต้น (Reset to Presets)
   */
  public async resetPersonnelTypesToDefault() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/personnel-types/reset-default`, {
        method: 'POST'
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }

  /**
   * บันทึกประเภทบุคลากรทั้งหมดลง MySQL
   */
  public async syncAllPersonnelTypesToDb(types: any[]) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/personnel-types/sync-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types })
      });
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed' };
    }
  }
}

export const apiClient = new ApiClientService();
