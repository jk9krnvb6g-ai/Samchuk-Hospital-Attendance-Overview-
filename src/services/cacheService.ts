/**
 * Samchuk Attendance System - In-Memory Cache Service
 * 
 * ให้บริการแคชข้อมูลในหน่วยความจำ (RAM) แบบ Stale-While-Revalidate (SWR)
 * - กำหนด TTL แยกตามประเภททรัพยากร (เช่น บุคลากร 5 นาที, สแกน 1 นาที)
 * - ตอบสนองทันทีด้วยข้อมูลจากแคชเพื่อความรวดเร็วของ UI
 * - สั่ง Invalidate แคชเฉพาะส่วนเมื่อมีการเปลี่ยนแปลงข้อมูล (Sync / Mutation)
 * - ป้องกันการโหลดข้อมูลซ้ำซ้อนและการดึงสแกนดิบ 5,000 รายการตอนเริ่มต้นระบบ
 */

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

export interface CacheGetResult<T = any> {
  data: T;
  isStale: boolean;
  ageMs: number;
}

export class CacheService {
  private cache = new Map<string, CacheEntry>();

  /**
   * ดึงข้อมูลจากแคช
   * คืนค่า { data, isStale, ageMs } หรือ null หากไม่มีในแคช
   */
  public get<T>(key: string): CacheGetResult<T> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    const ageMs = now - entry.timestamp;
    const isStale = ageMs > entry.ttlMs;

    return {
      data: entry.data as T,
      isStale,
      ageMs
    };
  }

  /**
   * บันทึกข้อมูลลงแคชพร้อมกำหนด TTL (ค่าเริ่มต้น 5 นาที)
   */
  public set<T>(key: string, data: T, ttlMs: number = 300000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttlMs
    });
  }

  /**
   * ตรวจสอบว่ามีคีย์ในแคชหรือไม่
   */
  public has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * ตรวจสอบว่าข้อมูลในแคชหมดอายุหรือไม่
   */
  public isExpired(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return true;
    return (Date.now() - entry.timestamp) > entry.ttlMs;
  }

  /**
   * ล้างแคชที่ตรงกับคีย์หรือขึ้นต้นด้วย prefix
   */
  public invalidate(keyOrPrefix: string): void {
    if (this.cache.has(keyOrPrefix)) {
      this.cache.delete(keyOrPrefix);
      return;
    }

    // ล้างตาม Prefix
    for (const k of Array.from(this.cache.keys())) {
      if (k.startsWith(keyOrPrefix)) {
        this.cache.delete(k);
      }
    }
  }

  /**
   * ล้างแคชตาม Prefix
   */
  public invalidatePrefix(prefix: string): void {
    this.invalidate(prefix);
  }

  /**
   * ล้างแคชทั้งหมด (เช่น เมื่อสลับผู้ใช้ หรือออกจากระบบ)
   */
  public invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * สรุปรายการในแคชสำหรับตรวจสอบสถานะ
   */
  public getDebugInfo(): Record<string, { ageSec: number; ttlSec: number; isStale: boolean }> {
    const now = Date.now();
    const result: Record<string, { ageSec: number; ttlSec: number; isStale: boolean }> = {};
    for (const [k, v] of this.cache.entries()) {
      const ageMs = now - v.timestamp;
      result[k] = {
        ageSec: Math.round(ageMs / 1000),
        ttlSec: Math.round(v.ttlMs / 1000),
        isStale: ageMs > v.ttlMs
      };
    }
    return result;
  }
}

export const cacheService = new CacheService();
