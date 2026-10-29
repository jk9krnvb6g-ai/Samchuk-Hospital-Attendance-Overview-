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
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    // สถาปัตยกรรม HTTPS Same-Origin ผ่าน Virtual Directory /Sam_Att บน IIS พอร์ต 3001
    // และ IIS Reverse Proxy จะส่งต่อไปยัง Shared Backend พอร์ต 3002: /api/Sam_Att/*
    const origin = window.location.origin;
    const pathname = window.location.pathname || '';
    const hasSamAtt = pathname.toLowerCase().includes('/sam_att');
    return hasSamAtt ? `${origin}/Sam_Att` : origin;
  }
  return 'http://localhost:3002';
};

export const DEFAULT_API_URL = resolveDefaultApiUrl();
export const HOSPITAL_WEB_URL = 'https://10.2.0.13:3001/Sam_Att/';

class ApiClientService {
  private readonly baseUrl: string = resolveDefaultApiUrl();
  private isOnline: boolean = false;
  private lastPingMs: number = 0;
  private lastCheckTime: string = '';
  private listeners: Array<() => void> = [];
  private authToken: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.authToken = localStorage.getItem('samchuk_auth_token');
    }
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public get customBaseUrl(): string {
    return this.baseUrl;
  }

  public getAuthToken(): string | null {
    if (!this.authToken && typeof window !== 'undefined') {
      this.authToken = localStorage.getItem('samchuk_auth_token');
    }
    return this.authToken;
  }

  public setAuthToken(token: string | null) {
    this.authToken = token;
    if (typeof window !== 'undefined') {
      if (token) localStorage.setItem('samchuk_auth_token', token);
      else localStorage.removeItem('samchuk_auth_token');
    }
    this.notify();
  }

  public getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extraHeaders };
    const token = this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Central Request Method:
   * 1. เรียก API ผ่าน HTTPS Same-Origin ไปยัง Shared Backend API พอร์ต 3002
   * 2. ตรวจสอบ HTTP Status และ Content-Type ก่อน Parse JSON ทุกครั้ง
   * 3. ป้องกันปัญหา HTML Error ทะลักเป็น SyntaxError (เช่น เมื่อได้ 405, 406, 500, 502)
   * 4. แสดง Error ที่ตรงกับสาเหตุจริง
   */
  public async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<{
    success: boolean;
    data?: T;
    message?: string;
    status?: number;
    error?: string;
    [key: string]: any;
  }> {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${cleanEndpoint}`;
    const headers = this.getAuthHeaders((options.headers as Record<string, string>) || {});

    if (!headers['Accept']) {
      headers['Accept'] = 'application/json, text/plain, */*';
    }
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const res = await fetch(url, { ...options, headers });
      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();

      // ตรวจสอบว่าเป็น HTML Error Page หรือไม่
      if (contentType.includes('text/html') || text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
        let msg = `เซิร์ฟเวอร์ส่งกลับหน้า HTML (HTTP ${res.status})`;
        if (res.status === 405) {
          msg = `เซิร์ฟเวอร์แจ้ง HTTP 405 (Method Not Allowed) บนเส้นทาง ${cleanEndpoint}: กรุณาตรวจสอบการตั้งค่า URL Rewrite และ HTTP Verbs บน IIS`;
        } else if (res.status === 406) {
          msg = `เซิร์ฟเวอร์แจ้ง HTTP 406 (Not Acceptable): ปลายทางไม่สามารถส่งผลลัพธ์แบบ JSON ได้`;
        } else if (res.status === 502 || res.status === 503) {
          msg = `เซิร์ฟเวอร์แจ้ง HTTP ${res.status}: ไม่สามารถเชื่อมต่อ Shared Backend API พอร์ต 3002 ได้ (กรุณาตรวจสอบว่า Backend รันอยู่หรือไม่)`;
        }
        return {
          success: false,
          status: res.status,
          error: `HTTP_${res.status}`,
          message: msg
        };
      }

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        return {
          success: false,
          status: res.status,
          error: 'JSON_PARSE_ERROR',
          message: `ผลลัพธ์จากเซิร์ฟเวอร์ไม่ใช่ JSON ที่ถูกต้อง (HTTP ${res.status}): ${text.slice(0, 150)}`
        };
      }

      if (!res.ok) {
        return {
          success: false,
          status: res.status,
          error: parsed?.error || `HTTP_${res.status}`,
          message: parsed?.message || `เซิร์ฟเวอร์ส่งรหัสข้อผิดพลาด HTTP ${res.status}`,
          ...parsed
        };
      }

      return parsed;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Connection failed';
      return {
        success: false,
        error: 'NETWORK_ERROR',
        message: `ไม่สามารถเชื่อมต่อ Shared Backend API พอร์ต 3002 (${errorMsg})`
      };
    }
  }

  public async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const customHeaders: Record<string, string> = (options.headers as Record<string, string>) || {};
    const mergedHeaders = this.getAuthHeaders(customHeaders);
    return fetch(url, { ...options, headers: mergedHeaders });
  }

  public async login(username: string, password: string): Promise<any> {
    const res = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (res.success && res.token) {
      this.setAuthToken(res.token);
    }
    return res;
  }

  public async logout(): Promise<void> {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } catch {}
    this.setAuthToken(null);
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
    return {
      baseUrl: this.baseUrl,
      isOnline: this.isOnline,
      lastPingMs: this.lastPingMs,
      lastCheckTime: this.lastCheckTime,
      frontendUrl: HOSPITAL_WEB_URL,
      apiPort: 3002,
      frontendPort: 3001
    };
  }

  /**
   * ตรวจสอบสถานะการเชื่อมต่อ Shared Backend API พอร์ต 3002
   */
  public async checkHealth(): Promise<{ online: boolean; latencyMs: number; data?: ApiHealthResponse; error?: string }> {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${this.baseUrl}/api/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && !contentType.includes('text/html')) {
        const data: ApiHealthResponse = await res.json();
        const elapsed = Math.round(performance.now() - start);
        this.lastPingMs = elapsed;
        this.lastCheckTime = new Date().toLocaleTimeString('th-TH');
        this.isOnline = true;
        this.notify();
        return { online: true, latencyMs: elapsed, data };
      }
      const elapsed = Math.round(performance.now() - start);
      this.isOnline = false;
      this.lastPingMs = elapsed;
      this.lastCheckTime = new Date().toLocaleTimeString('th-TH');
      this.notify();
      return { online: false, latencyMs: elapsed, error: `Backend HTTP ${res.status}` };
    } catch (err: unknown) {
      const elapsed = Math.round(performance.now() - start);
      this.isOnline = false;
      this.lastPingMs = elapsed;
      this.lastCheckTime = new Date().toLocaleTimeString('th-TH');
      this.notify();
      return { online: false, latencyMs: elapsed, error: err instanceof Error ? err.message : 'Cannot connect to API' };
    }
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
   * สั่งให้ Backend ดึงข้อมูลสแกนจริงจากเครื่องสแกนผ่าน Reader CLI (N1, N2, N5)
   */
  public async syncFromScanners(machineNo?: number, options?: { auto?: boolean; days?: number; preview?: boolean }) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/scanners/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineNo,
          auto: machineNo ? false : (options?.auto !== false),
          days: options?.days || 3,
          preview: options?.preview || false
        })
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
   * ดึงสถานะการซิงค์ล่าสุดของแต่ละเครื่อง (N4)
   */
  public async getScannerSyncLog() {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/scanners/sync-log`);
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed to fetch sync log' };
    }
  }

  /**
   * ดึงประวัติการซิงค์ย้อนหลัง (N4)
   */
  public async getScannerSyncLogs(limit: number = 30) {
    try {
      const res = await fetch(`${this.customBaseUrl}/api/scanners/sync-logs?limit=${limit}`);
      return await res.json();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed to fetch sync logs' };
    }
  }

  /**
   * สั่งให้ Backend คำนวณผลเวลาทำงานและบันทึกลง MySQL attendance_daily_result ทันที
   */
  public async recalculateAttendanceInDb(params?: string | {
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    month?: string;
    year?: string;
    mode?: string;
  }) {
    try {
      const payload = typeof params === 'string' ? { date: params } : (params || {});
      const res = await fetch(`${this.customBaseUrl}/api/attendance/recalculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
      const res = await this.fetchWithAuth(`${this.customBaseUrl}/api/scanners/sync-custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return {
          success: false,
          message: `เซิร์ฟเวอร์ส่งผลลัพธ์ไม่ถูกต้อง (HTTP ${res.status}): ${text.slice(0, 150)}`
        };
      }
    } catch (err: unknown) {
      return {
        success: false,
        message: this.getFriendlyFetchError(err, 'Backend API (Custom Scanner Sync)')
      };
    }
  }

  /**
   * ซิงค์ข้อมูลจาก hosoffice.fingle_scan เข้าสู่ attendance_raw_scan ใน samchuk_attendance โดยตรง
   */
  public async syncHosofficeToRawScan(payload?: { dates?: string[]; dateFrom?: string; dateTo?: string; strategy?: 'SKIP_DUPLICATES' | 'OVERWRITE' }) {
    try {
      const res = await this.fetchWithAuth(`${this.customBaseUrl}/api/scans/sync-to-raw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        success: false,
        message: this.getFriendlyFetchError(err, 'Backend API (Sync to Raw)')
      };
    }
  }

  /**
   * ข้อมูลสรุปภาพรวมฐานข้อมูลทั้งหมดในระบบ (Dual Database Overview)
   */
  public async getDatabaseOverview() {
    try {
      const res = await this.fetchWithAuth(`${this.customBaseUrl}/api/db/overview`);
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
    if (rawMsg.includes("Unexpected token '<'") || rawMsg.includes("<!DOCTYPE")) {
      return `ไม่สามารถติดต่อ ${serviceName} ได้ เนื่องจากเซิร์ฟเวอร์ส่งกลับเป็นหน้าเว็บ Error HTML แทนข้อมูล JSON (เกิดจาก CORS Denied หรือ Backend มีข้อผิดพลาด) -> กรุณาอัปเดตไฟล์ backend/server.cjs เป็นเวอร์ชันล่าสุดบน Server`;
    }
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
    return this.request('/api/shifts', { method: 'GET' });
  }

  /**
   * สร้างกะใหม่ลงใน MySQL โดยตรง
   */
  public async createShiftInDb(shift: any) {
    return this.request('/api/shifts', {
      method: 'POST',
      body: JSON.stringify(shift)
    });
  }

  /**
   * แก้ไขกะใน MySQL โดยตรง
   */
  public async updateShiftInDb(id: number, shift: any) {
    return this.request(`/api/shifts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(shift)
    });
  }

  /**
   * ลบกะออกจาก MySQL โดยตรง
   */
  public async deleteShiftFromDb(id: number) {
    return this.request(`/api/shifts/${id}`, {
      method: 'DELETE'
    });
  }

  /**
   * ซิงค์กะทั้งหมดจากหน้าเว็บเข้าสู่ MySQL
   */
  public async syncShiftsToDb(shifts: any[]) {
    return this.request('/api/shifts/sync-all', {
      method: 'POST',
      body: JSON.stringify({ shifts })
    });
  }

  /**
   * ซ่อมแซมและปรับปรุงชื่อภาษาไทย 4 กะหลัก (เช้า, บ่าย, ดึก, เช้าควบบ่าย) ใน MySQL
   */
  public async repairThaiShifts() {
    return this.request('/api/shifts/repair-thai', {
      method: 'POST'
    });
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
    let queryStr = '';
    if (typeof params === 'number') {
      queryStr = `limit=${params}`;
    } else if (params && typeof params === 'object') {
      const qp = new URLSearchParams();
      qp.set('limit', String(params.limit || 200));
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
      queryStr = 'limit=200';
    }

    return this.request(`/api/raw-scans?${queryStr}`, { method: 'GET' });
  }

  /**
   * ลบรายการสแกนดิบ 1 รายการจาก MySQL (กรณีสแกนทดสอบหรือข้อมูลซ้ำ)
   */
  public async deleteRawScanFromDb(id: number | string) {
    return this.request(`/api/raw-scans/${id}`, {
      method: 'DELETE'
    });
  }

  /**
   * บันทึกข้อมูลสแกนใหม่ 1 รายการลง MySQL โดยตรง
   */
  public async addRawScanToDb(scan: any) {
    return this.request('/api/raw-scans', {
      method: 'POST',
      body: JSON.stringify(scan)
    });
  }

  /**
   * บันทึกข้อมูลสแกนแบบกลุ่มลง MySQL attendance_raw_scan
   */
  public async batchAddRawScans(scans: any[]) {
    return this.request('/api/raw-scans/batch', {
      method: 'POST',
      body: JSON.stringify({ scans })
    });
  }

  /**
   * ดึงผลการประมวลผลเวลา (attendance_daily_result) จาก MySQL ตามวันที่
   */
  public async getDailyAttendanceFromDb(date?: string) {
    const queryDate = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.request(`/api/attendance${queryDate}`, { method: 'GET' });
  }

  /**
   * บันทึกผลการประมวลผลเวลา (attendance_daily_result) ลง MySQL แบบกลุ่ม
   */
  public async saveDailyAttendanceToDb(results: any[]) {
    return this.request('/api/attendance/batch', {
      method: 'POST',
      body: JSON.stringify({ results })
    });
  }

  /**
   * ล้างผลการประมวลผลเวลา (attendance_daily_result) ใน MySQL ทั้งหมด
   */
  public async clearDailyAttendanceFromDb() {
    return this.request('/api/attendance/clear', {
      method: 'DELETE'
    });
  }

  /**
   * ล้างข้อมูลสแกนทั้งหมดใน MySQL
   */
  public async clearAllRawScansFromDb() {
    return this.request('/api/raw-scans/clear-all', {
      method: 'POST'
    });
  }

  /**
   * เติมข้อมูลสแกนตัวอย่างจำลองลง MySQL
   */
  public async seedSampleRawScansToDb() {
    return this.request('/api/raw-scans/seed-sample', {
      method: 'POST'
    });
  }

  /**
   * ดึงข้อมูลบุคลากรจากฐานข้อมูลที่ 1: samchuk_attendance.attendance_personnel
   */
  public async getPersonnelFromDb() {
    return this.request('/api/personnel', { method: 'GET' });
  }

  /**
   * สั่งซิงค์รายชื่อบุคลากรจาก hosoffice เข้าสู่ฐาน samchuk_attendance (ทำงานเมื่อผู้ใช้กดปุ่มเท่านั้น)
   * ใช้คำสั่ง HTTP POST เท่านั้นตามข้อกำหนดความปลอดภัย (ห้ามสลับเป็น GET)
   */
  public async syncPersonnelFromHosoffice() {
    return this.request('/api/personnel/sync-from-hosoffice', {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  /**
   * ล้างข้อมูลบุคลากรในฐาน samchuk_attendance
   */
  public async clearPersonnelInDb() {
    return this.request('/api/personnel/clear', {
      method: 'DELETE'
    });
  }

  /**
   * ดึงข้อมูลบุคลากรจาก hosoffice.hr_person โดยตรง (เมื่อต้องการตรวจสอบข้อมูลต้นทาง)
   */
  public async getPersonnelFromHosoffice(limit: number = 500) {
    return this.request(`/api/hosoffice/personnel?limit=${limit}`, { method: 'GET' });
  }

  /**
   * ทดสอบบันทึกข้อมูลสแกนเวลาเข้า hosoffice.fingle_scan
   */
  public async testPushToHosoffice(payload?: { fingleId?: number; scanDateTime?: string; machineNo?: number }) {
    return this.request('/api/hosoffice/test-push', {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
  }

  /**
   * Probe ตรวจสอบพอร์ต 3306 บนหลาย IP พร้อมกัน
   */
  public async probeDatabasePorts() {
    return this.request('/api/db/probe', { method: 'GET' });
  }

  /**
   * ดึงประวัติ Push Batches จาก MySQL
   */
  public async getPushBatchesFromDb() {
    return this.request('/api/push/batches', { method: 'GET' });
  }

  /**
   * ยกเว้นรายการสแกนดิบไม่ให้นำมารวมในคิวส่ง (Exclude)
   */
  public async excludeRawScan(id: number | string) {
    return this.request(`/api/raw-scans/${id}/exclude`, {
      method: 'POST'
    });
  }

  /**
   * รีเฟรชข้อมูลบุคลากรจาก hosoffice.hr_person และ Map ใหม่อัตโนมัติ
   */
  public async refreshPersonnelMapping() {
    return this.request('/api/hosoffice/personnel/refresh-mapping', {
      method: 'POST'
    });
  }

  /**
   * ดึงรายการประเภทบุคลากรและเวลากะจาก MySQL
   */
  public async getPersonnelTypes() {
    return this.request('/api/personnel-types', { method: 'GET' });
  }

  /**
   * เพิ่มประเภทบุคลากรใหม่ใน MySQL
   */
  public async createPersonnelType(data: any) {
    return this.request('/api/personnel-types', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * อัปเดตประเภทบุคลากรใน MySQL
   */
  public async updatePersonnelType(id: number, data: any) {
    return this.request(`/api/personnel-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * ลบประเภทบุคลากรใน MySQL
   */
  public async deletePersonnelType(id: number) {
    return this.request(`/api/personnel-types/${id}`, {
      method: 'DELETE'
    });
  }

  /**
   * คืนค่าประเภทบุคลากรเริ่มต้น (Reset to Presets)
   */
  public async resetPersonnelTypesToDefault() {
    return this.request('/api/personnel-types/reset-default', {
      method: 'POST'
    });
  }

  /**
   * บันทึกประเภทบุคลากรทั้งหมดลง MySQL
   */
  public async syncAllPersonnelTypesToDb(types: any[]) {
    return this.request('/api/personnel-types/sync-all', {
      method: 'POST',
      body: JSON.stringify({ types })
    });
  }
}

export const apiClient = new ApiClientService();
