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
    const host = window.location.hostname && window.location.hostname !== 'localhost' ? window.location.hostname : '10.2.0.13';
    return `http://${host}:3002`;
  }
  return 'http://10.2.0.13:3002';
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
        if (saved.startsWith('https://') && saved.includes(':3002')) {
          this.customBaseUrl = saved.replace('https://', 'http://');
          localStorage.setItem(STORAGE_API_KEY, this.customBaseUrl);
        } else {
          this.customBaseUrl = saved.trim();
        }
      } else {
        this.customBaseUrl = resolveDefaultApiUrl();
      }
    }
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
    return {
      baseUrl: this.customBaseUrl,
      isOnline: this.isOnline,
      lastPingMs: this.lastPingMs,
      lastCheckTime: this.lastCheckTime,
      frontendUrl: HOSPITAL_WEB_URL,
      apiPort: 3002,
      frontendPort: 3001
    };
  }

  /**
   * ทดสอบการเชื่อมต่อ API บนพอร์ต 3002 (GET /api/health)
   */
  public async checkHealth(): Promise<{ online: boolean; latencyMs: number; data?: ApiHealthResponse; error?: string }> {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`${this.customBaseUrl}/api/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const elapsed = Math.round(performance.now() - start);
      this.lastPingMs = elapsed;
      this.lastCheckTime = new Date().toLocaleTimeString('th-TH');

      if (res.ok) {
        const data: ApiHealthResponse = await res.json();
        this.isOnline = true;
        this.notify();
        return { online: true, latencyMs: elapsed, data };
      } else {
        this.isOnline = false;
        this.notify();
        return { online: false, latencyMs: elapsed, error: `HTTP ${res.status}: ${res.statusText}` };
      }
    } catch (err: unknown) {
      const elapsed = Math.round(performance.now() - start);
      this.isOnline = false;
      this.lastPingMs = elapsed;
      this.lastCheckTime = new Date().toLocaleTimeString('th-TH');
      this.notify();
      const msg = err instanceof Error ? err.message : 'Cannot connect to API';
      return { online: false, latencyMs: elapsed, error: msg };
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
}

export const apiClient = new ApiClientService();
