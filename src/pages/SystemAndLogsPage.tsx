import React, { useState } from 'react';
import { 
  FileText, 
  Activity, 
  ShieldCheck, 
  Database, 
  Code2, 
  Copy, 
  Check, 
  Server, 
  Cpu, 
  Clock,
  Terminal
} from 'lucide-react';
import { StoreState } from '../services/attendanceStore';

interface SystemAndLogsPageProps {
  state: StoreState;
}

export const SystemAndLogsPage: React.FC<SystemAndLogsPageProps> = ({ state }) => {
  const [activeTab, setActiveTab] = useState<'sync' | 'audit' | 'sql' | 'backend'>('sync');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const sqlSchemaScript = `-- =========================================================================
-- ฐานข้อมูลที่ 1: Attendance DB (samchuk_attendance) - สำหรับ Staging & Config
-- =========================================================================

CREATE DATABASE IF NOT EXISTS samchuk_attendance 
DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE samchuk_attendance;

-- 21.1 attendance_raw_scan (Staging ข้อมูลดิบจากเครื่องสแกน)
CREATE TABLE IF NOT EXISTS attendance_raw_scan (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    machine_no INT NOT NULL,
    device_ip VARCHAR(45) NULL,
    fingle_id INT NOT NULL,
    scan_date_time DATETIME NOT NULL,          -- ค.ศ. (ห้ามแปลง พ.ศ. ใน DB)
    verify_mode INT NULL,
    in_out_mode INT NULL,                      -- เก็บค่าดิบ ห้ามเดา IN/OUT
    -- HR snapshot
    person_id INT NULL,
    hr_fullname VARCHAR(255) NULL,
    hr_position_name VARCHAR(255) NULL,
    hr_leavel_name VARCHAR(255) NULL,
    hr_dep_name VARCHAR(255) NULL,
    hr_dep_sub_name VARCHAR(255) NULL,
    hr_person_type_name VARCHAR(255) NULL,
    hr_person_type_id INT NULL,
    hr_department_id INT NULL,
    hr_department_sub_id INT NULL,
    hr_mapped TINYINT(1) NOT NULL DEFAULT 0,
    -- สถานะการส่งเข้า hosoffice
    push_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        -- PENDING | PUSHED | SKIPPED_EXISTS | FAILED | EXCLUDED
    pushed_at DATETIME NULL,
    pushed_by INT NULL,
    push_batch_id BIGINT NULL,
    push_error TEXT NULL,
    received_at DATETIME NOT NULL,
    UNIQUE KEY uq_scan (fingle_id, scan_date_time),
    KEY idx_push_status (push_status),
    KEY idx_scan_date (scan_date_time),
    KEY idx_person (person_id)
);

-- 21.2 กะการทำงานมาตรฐาน
CREATE TABLE IF NOT EXISTS attendance_shift (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shift_code VARCHAR(20) NOT NULL UNIQUE,
    shift_name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    crosses_midnight TINYINT(1) NOT NULL DEFAULT 0,
    work_date_basis VARCHAR(10) NOT NULL DEFAULT 'START_DATE',
    late_grace_minutes INT NOT NULL DEFAULT 0,
    in_window_before_min INT NOT NULL DEFAULT 120,
    out_window_after_min INT NOT NULL DEFAULT 120,
    early_leave_min INT NOT NULL DEFAULT 0,
    duplicate_scan_min INT NOT NULL DEFAULT 5,
    color VARCHAR(20) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

-- กลุ่มบุคลากร
CREATE TABLE IF NOT EXISTS attendance_personnel_group (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_name VARCHAR(100) NOT NULL,
    group_kind VARCHAR(20) NOT NULL,           -- PERSON_TYPE | CUSTOM
    priority INT NOT NULL DEFAULT 100,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    note VARCHAR(255) NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

-- สมาชิกกลุ่มแบบตามประเภทบุคลากร
CREATE TABLE IF NOT EXISTS attendance_group_person_type (
    group_id INT NOT NULL,
    hr_person_type_id INT NOT NULL,
    PRIMARY KEY (group_id, hr_person_type_id)
);

-- สมาชิกกลุ่มแบบกำหนดเอง
CREATE TABLE IF NOT EXISTS attendance_group_member (
    group_id INT NOT NULL,
    person_id INT NOT NULL,
    PRIMARY KEY (group_id, person_id)
);

-- เวลากะของแต่ละกลุ่ม (Override เวลากะมาตรฐาน)
CREATE TABLE IF NOT EXISTS attendance_group_shift (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    shift_id INT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    late_grace_minutes INT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1
);

-- กะประจำรายบุคคล (Override รายบุคคล)
CREATE TABLE IF NOT EXISTS attendance_person_shift (
    id INT AUTO_INCREMENT PRIMARY KEY,
    person_id INT NOT NULL,
    shift_id INT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1
);

-- Roster รายวัน (ตารางเวร)
CREATE TABLE IF NOT EXISTS attendance_person_roster (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    person_id INT NOT NULL,
    work_date DATE NOT NULL,
    shift_id INT NOT NULL,
    note VARCHAR(255) NULL,
    created_by INT NULL,
    UNIQUE KEY uq_roster (person_id, work_date, shift_id)
);

-- ผลการประมวลผลรายวัน
CREATE TABLE IF NOT EXISTS attendance_daily_result (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    person_id INT NOT NULL,
    work_date DATE NOT NULL,
    shift_id INT NULL,
    in_time DATETIME NULL,
    out_time DATETIME NULL,
    status VARCHAR(30) NULL,
    late_minutes INT NULL,
    ot_minutes INT NULL,
    calculated_at DATETIME NOT NULL,
    UNIQUE KEY uq_day (person_id, work_date, shift_id)
);

-- 21.3 Push Batch Log
CREATE TABLE IF NOT EXISTS attendance_push_batch (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    requested_by VARCHAR(100) NOT NULL,
    requested_at DATETIME NOT NULL,
    filter_date_from DATE NULL,
    filter_date_to DATE NULL,
    filter_machine_no INT NULL,
    total_selected INT NOT NULL DEFAULT 0,
    total_inserted INT NOT NULL DEFAULT 0,
    total_skipped_exists INT NOT NULL DEFAULT 0,
    total_failed INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL,
    finished_at DATETIME NULL,
    error_message TEXT NULL
);`;

  const csharpCodeSnippet = `// =========================================================================
// Backend: ASP.NET Core 10 & HIP Native DLL Scanner Integration (Section 5, 7, 31)
// =========================================================================

using System.Runtime.InteropServices;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace SamchukAttendance.Scanner
{
    public class ScannerReader
    {
        // 5. P/Invoke สำหรับ HIP FK623Attend.dll
        [DllImport("FK623Attend.dll", CharSet = CharSet.Ansi, CallingConvention = CallingConvention.Winapi)]
        public static extern int FK_ConnectNet(
            int anMachineNo,
            string astrIpAddress,
            int anNetPort,
            int anTimeOut,
            int anProtocolType,
            int anNetPassword,
            int anLicense);

        [DllImport("FK623Attend.dll", CallingConvention = CallingConvention.Winapi)]
        public static extern int FK_DisConnect(int anHandle);

        [DllImport("FK623Attend.dll", CallingConvention = CallingConvention.Winapi)]
        public static extern int FK_LoadGeneralLogData(int anHandle, int anReadMark);

        // Numeric Getter สำหรับ CMiF68S (String ID Support = 0 ตามข้อกำหนดหัวข้อ 6)
        [DllImport("FK623Attend.dll", CallingConvention = CallingConvention.Winapi)]
        public static extern int FK_GetGeneralLogData(
            int anHandle,
            ref int anEnrollNumber,
            ref int anVerifyMode,
            ref int anInOutMode,
            ref int anDateTimeYear,
            ref int anDateTimeMonth,
            ref int anDateTimeDay,
            ref int anDateTimeHour,
            ref int anDateTimeMinute,
            ref int anDateTimeSecond);
    }

    // 7. Background Service ดึงข้อมูลทุก 1 นาที ลง Attendance DB (Staging) เท่านั้น
    public class ScannerBackgroundService : BackgroundService
    {
        private readonly ILogger<ScannerBackgroundService> _logger;
        private readonly IServiceProvider _serviceProvider;

        public ScannerBackgroundService(ILogger<ScannerBackgroundService> logger, IServiceProvider serviceProvider)
        {
            _logger = logger;
            _serviceProvider = serviceProvider;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    // Scanner 1 (192.168.111.163) -> Scanner 2 (.164) -> Scanner 3 (.165)
                    // ตรวจ Duplicate -> HR Mapping (hosoffice.hr_person) -> บันทึก attendance_raw_scan
                    // **ห้ามเขียนลง hosoffice.fingle_scan ในขั้นตอนนี้**
                    await SyncScannersToStagingAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Scanner sync error");
                }

                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }
}`;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">
            ระบบ ข้อมูลการตรวจสอบ และสถาปัตยกรรม (System & Audit Logs)
          </h2>
          <p className="text-xs text-slate-500">
            ดูประวัติการซิงค์ของเครื่องสแกน, Audit Trail การกดส่งข้อมูลและแก้ไขกะ, และพิมพ์เขียว SQL DDL
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('sync')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'sync' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1. Sync Logs ({state.syncLogs.length})
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'audit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Audit Logs ({state.auditLogs.length})
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'sql' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            3. MySQL Schema (DDL)
          </button>
          <button
            onClick={() => setActiveTab('backend')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'backend' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            4. C# / DLL Integration
          </button>
        </div>
      </div>

      {/* TAB 1: SYNC LOGS - Section 28 */}
      {activeTab === 'sync' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              ประวัติการดึงข้อมูลจากเครื่องสแกน (Scanner Sync Log)
            </h3>
            <span className="text-xs text-slate-500">
              บันทึกทุกรอบการเชื่อมต่อ 192.168.111.163–165:5005
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">วัน-เวลา</th>
                  <th className="py-2.5 px-3">เครื่องสแกน</th>
                  <th className="py-2.5 px-3">IP & Port</th>
                  <th className="py-2.5 px-3">สถานะ</th>
                  <th className="py-2.5 px-3 text-center">อ่านได้ทั้งหมด</th>
                  <th className="py-2.5 px-3 text-center">สแกนใหม่</th>
                  <th className="py-2.5 px-3 text-center">ซ้ำเดิม</th>
                  <th className="py-2.5 px-3 text-center font-bold text-amber-800">รอส่ง (Pending)</th>
                  <th className="py-2.5 px-3">เวลาที่ใช้</th>
                  <th className="py-2.5 px-3">ข้อความตอบกลับ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {state.syncLogs.map((log, idx) => (
                  <tr key={`${log.id}-${idx}`} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-700 whitespace-nowrap">
                      {log.timestamp}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">
                      เครื่อง {log.machineNo} ({log.scannerName})
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">
                      {log.ip}:5005
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-emerald-700 font-bold text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono">{log.recordsTotal}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-700">+{log.recordsNew}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-400">{log.recordsDuplicate}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-900 bg-amber-50/50">
                      {log.recordsPending}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{log.durationMs}ms</td>
                    <td className="py-2.5 px-3 text-slate-600 text-[11px] truncate max-w-xs">{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: AUDIT LOGS - Section 24.3 */}
      {activeTab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs space-y-4 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                ประวัติการตรวจสอบความปลอดภัย (Audit Log Trail)
              </h3>
              <p className="text-xs text-slate-500">
                บันทึกการกระทำสำคัญ: การกดส่งเข้า hosoffice, การแก้กะ, การแก้กลุ่ม, การเปลี่ยนรหัส
              </p>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              IP Address บันทึกจริง: 10.1.0.45
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">เวลาที่เกิดเหตุการณ์</th>
                  <th className="py-2.5 px-3">ผู้ใช้งาน (User)</th>
                  <th className="py-2.5 px-3">หมวดหมู่</th>
                  <th className="py-2.5 px-3">การกระทำ (Action)</th>
                  <th className="py-2.5 px-3">รายละเอียด (Detail)</th>
                  <th className="py-2.5 px-3 text-right">IP ที่เรียก</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {state.auditLogs.map((log, idx) => (
                  <tr key={`${log.id}-${idx}`} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">{log.timestamp}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-800">{log.user}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                        {log.module}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">{log.action}</td>
                    <td className="py-2.5 px-3 text-slate-800 font-medium">{log.detail}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-500">{log.ipAddress || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SQL SCHEMA - Section 21 */}
      {activeTab === 'sql' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                สคริปต์สร้างฐานข้อมูล MySQL (Attendance DB Schema DDL)
              </h3>
              <p className="text-xs text-slate-500">
                โครงสร้างตารางตามข้อกำหนด 21.1 – 21.3 สำหรับติดตั้งบน Server โรงพยาบาลสามชุก
              </p>
            </div>
            <button
              onClick={() => handleCopy('sql', sqlSchemaScript)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
            >
              {copiedKey === 'sql' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copiedKey === 'sql' ? 'คัดลอกแล้ว!' : 'คัดลอก SQL ทั้งหมด'}</span>
            </button>
          </div>

          <div className="bg-slate-950 text-slate-200 rounded-xl p-4 font-mono text-xs overflow-x-auto border border-slate-800 max-h-[600px]">
            <pre className="text-slate-300 leading-relaxed">{sqlSchemaScript}</pre>
          </div>
        </div>
      )}

      {/* TAB 4: BACKEND C# / NATIVE DLL CODE - Section 5, 30, 31 */}
      {activeTab === 'backend' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                โค้ด C# ASP.NET Core 10 เชื่อมต่อ FK623Attend.dll
              </h3>
              <p className="text-xs text-slate-500">
                P/Invoke และ Background Service ทุก 1 นาที ตามข้อ 5 และ 31
              </p>
            </div>
            <button
              onClick={() => handleCopy('csharp', csharpCodeSnippet)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
            >
              {copiedKey === 'csharp' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copiedKey === 'csharp' ? 'คัดลอกแล้ว!' : 'คัดลอกโค้ด C#'}</span>
            </button>
          </div>

          <div className="bg-slate-950 text-slate-200 rounded-xl p-4 font-mono text-xs overflow-x-auto border border-slate-800 max-h-[600px]">
            <pre className="text-emerald-400/90 leading-relaxed">{csharpCodeSnippet}</pre>
          </div>
        </div>
      )}
    </div>
  );
};
