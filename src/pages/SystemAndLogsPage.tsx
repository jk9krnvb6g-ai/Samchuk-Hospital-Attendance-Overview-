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
  Terminal,
  Globe,
  Radio,
  Wifi,
  ExternalLink,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  FolderTree
} from 'lucide-react';
import { StoreState } from '../services/attendanceStore';
import { apiClient, ApiHealthResponse, HOSPITAL_WEB_URL, DEFAULT_API_URL } from '../services/apiClient';

interface SystemAndLogsPageProps {
  state: StoreState;
}

export const SystemAndLogsPage: React.FC<SystemAndLogsPageProps> = ({ state }) => {
  const [activeTab, setActiveTab] = useState<'sync' | 'audit' | 'sql' | 'backend' | 'network'>('network');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Network & API Gateway State (:3002 and :3001)
  const [apiEndpointUrl, setApiEndpointUrl] = useState(apiClient.getBaseUrl());
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{
    tested: boolean;
    online: boolean;
    latencyMs: number;
    data?: ApiHealthResponse;
    error?: string;
  } | null>(null);

  const handleTestPing = async () => {
    setIsPinging(true);
    const res = await apiClient.checkHealth();
    setPingResult({
      tested: true,
      online: res.online,
      latencyMs: res.latencyMs,
      data: res.data,
      error: res.error
    });
    setIsPinging(false);
  };

  const handleSaveApiUrl = () => {
    apiClient.setBaseUrl(apiEndpointUrl);
    handleTestPing();
  };

  const handleResetApiUrl = () => {
    apiClient.resetToDefault();
    setApiEndpointUrl(DEFAULT_API_URL);
    handleTestPing();
  };

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
          <button
            onClick={() => setActiveTab('network')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'network' ? 'bg-teal-700 text-white shadow-xs' : 'text-teal-700 hover:text-teal-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            5. Network & API (:3002)
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

      {/* TAB 5: NETWORK & API GATEWAY (:3002 / :3001) */}
      {activeTab === 'network' && (
        <div className="space-y-6">
          {/* Architecture Banner */}
          <div className="bg-linear-to-r from-teal-900 to-slate-900 rounded-xl p-6 text-white shadow-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="px-2.5 py-1 bg-teal-500/20 text-teal-300 border border-teal-400/30 rounded-full font-mono text-xs font-semibold">
                  Network Architecture v2.2.3
                </span>
                <h3 className="text-lg font-bold mt-2 text-white">
                  สถาปัตยกรรมเครือข่ายและระบบส่งข้อมูล โรงพยาบาลสามชุก
                </h3>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  Web Frontend ทำงานบนโฟลเดอร์ <code className="bg-slate-800 text-teal-300 px-1.5 py-0.5 rounded font-mono">/Sam_Att/</code> พอร์ต <strong>3001</strong> และใช้ API หลังบ้านบนพอร์ต <strong>3002</strong> ในการส่งข้อมูลเวลาเข้า HOSxP/Hosoffice และควบคุมเครื่องสแกน HIP CMiF68S
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={handleTestPing}
                  disabled={isPinging}
                  className="px-4 py-2 bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-2 cursor-pointer transition-all shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isPinging ? 'animate-spin' : ''}`} />
                  <span>{isPinging ? 'กำลังทดสอบ...' : 'ทดสอบ Ping API :3002'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3 Core Nodes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Node 1: Web Frontend */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      1. Web Frontend (พอร์ต 3001)
                    </h4>
                    <p className="text-xs text-slate-500">ส่วนติดต่อผู้ใช้งาน (Web User Interface)</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[11px] rounded font-bold">
                  PORT 3001
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">URL ใช้งานจริง:</span>
                  <span className="font-bold text-teal-800">https://10.2.0.13:3001/Sam_Att/</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">โฟลเดอร์ที่จัดเก็บ:</span>
                  <span className="font-semibold text-slate-700">/Sam_Att/ (Virtual Directory)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">โปรโตคอลความปลอดภัย:</span>
                  <span className="text-emerald-700 font-semibold">HTTPS (SSL/TLS Certificate)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">การตั้งค่า Vite Base:</span>
                  <span className="text-slate-700 font-semibold">base: '/Sam_Att/'</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-600 bg-slate-50 rounded p-2.5 border border-slate-100 flex items-start gap-2">
                <FolderTree className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                <span>
                  โฟลเดอร์ที่เก็บ Web App คือ <code className="font-mono font-bold text-slate-800">Sam_Att</code> เมื่อนำไปวางในเว็บเซิร์ฟเวอร์ (IIS หรือ Nginx) ระบบจะโหลด Assets ได้ครบถ้วนทุกหน้าโดยไม่มีปัญหา 404
                </span>
              </div>
            </div>

            {/* Node 2: Backend API Service */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      2. Backend API Service (พอร์ต 3002)
                    </h4>
                    <p className="text-xs text-slate-500">API ในการส่งข้อมูลและดึงข้อมูลเครื่องสแกน</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono text-[11px] rounded font-bold">
                  PORT 3002
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Endpoint ส่งข้อมูล:</span>
                  <span className="font-bold text-indigo-800">https://10.2.0.13:3002</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">API ส่งเข้า hosoffice:</span>
                  <span className="text-slate-700 font-semibold">POST /api/push/batch</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">API ตรวจสอบระบบ:</span>
                  <span className="text-slate-700 font-semibold">GET /api/health</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">API เครื่องสแกน:</span>
                  <span className="text-slate-700 font-semibold">POST /api/scanners/{'{id}'}/read</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-600 bg-slate-50 rounded p-2.5 border border-slate-100 flex items-start gap-2">
                <Cpu className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  รันเป็น Windows Service x86 เพื่อเรียก DLL <code className="font-mono font-bold text-slate-800">FK623Attend.dll</code> ดึงข้อมูลจากเครื่องสแกนอัตโนมัติทุก 1 นาที และส่งข้อมูลเข้า hosoffice เมื่อได้รับคำสั่ง
                </span>
              </div>
            </div>
          </div>

          {/* Interactive API Tester & Endpoint Config */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-teal-600" />
                  <span>ทดสอบการเชื่อมต่อและกำหนดค่า API Gateway (:3002)</span>
                </h4>
                <p className="text-xs text-slate-500">
                  ตรวจสอบการสื่อสารระหว่างหน้าเว็บเบราว์เซอร์กับ API พอร์ต 3002 บนเซิร์ฟเวอร์
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetApiUrl}
                  className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded bg-slate-50 hover:bg-slate-100 cursor-pointer"
                >
                  คืนค่าเริ่มต้น
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  API Base URL (พอร์ต 3002):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={apiEndpointUrl}
                    onChange={(e) => setApiEndpointUrl(e.target.value)}
                    placeholder="https://10.2.0.13:3002"
                    className="flex-1 bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <button
                    onClick={handleSaveApiUrl}
                    className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded cursor-pointer transition-colors shrink-0"
                  >
                    บันทึก & ทดสอบ
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  สถานะการเชื่อมต่อ:
                </label>
                <div className="p-2 border rounded bg-slate-50 flex items-center justify-between min-h-[38px]">
                  {pingResult ? (
                    pingResult.online ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Online ({pingResult.latencyMs} ms)</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-amber-700" title={pingResult.error}>
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Standalone Mode (กำลังเชื่อมต่อ)</span>
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-slate-400">ยังไม่ได้ทดสอบ</span>
                  )}
                  <button
                    onClick={handleTestPing}
                    disabled={isPinging}
                    className="text-xs text-teal-700 hover:text-teal-900 font-semibold cursor-pointer underline ml-2"
                  >
                    Ping
                  </button>
                </div>
              </div>
            </div>

            {/* Ping Details Result */}
            {pingResult && pingResult.data && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 space-y-1 font-mono">
                <div className="font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>เชื่อมต่อ API พอร์ต 3002 สำเร็จสมบูรณ์ (200 OK)</span>
                </div>
                <div>บริการ: {pingResult.data.service} (v{pingResult.data.version})</div>
                <div>สถาปัตยกรรม: {pingResult.data.architecture} | ภาษาไทย: {pingResult.data.thaiSupport}</div>
                <div>เวลาเซิร์ฟเวอร์: {pingResult.data.serverTime}</div>
              </div>
            )}
          </div>

          {/* Configuration Guides for Hospital IT */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-700" />
              <span>คำสั่งติดตั้งและคอนฟิกบนเซิร์ฟเวอร์โรงพยาบาลสามชุก (IP: 10.2.0.13)</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="bg-slate-900 text-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-400 font-sans font-bold">
                  <span>1. รัน Web Frontend (พอร์ต 3001)</span>
                  <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-teal-300">NPM / IIS</span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans">
                  บิลด์ไฟล์เพื่อนำไปวางในโฟลเดอร์ <strong>Sam_Att</strong>:
                </p>
                <pre className="text-teal-300 bg-slate-950 p-2 rounded">
                  npm run build
                </pre>
                <p className="text-[11px] text-slate-400 font-sans">
                  หรือรันโหมดพรีวิวพอร์ต 3001:
                </p>
                <pre className="text-teal-300 bg-slate-950 p-2 rounded">
                  npm run serve:hospital
                </pre>
              </div>

              <div className="bg-slate-900 text-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-400 font-sans font-bold">
                  <span>2. รัน API Service (พอร์ต 3002)</span>
                  <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300">ASP.NET x86</span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans">
                  รันผ่าน Command Line บนเซิร์ฟเวอร์:
                </p>
                <pre className="text-indigo-300 bg-slate-950 p-2 rounded">
                  dotnet run --project backend/SamchukAttendance.Api
                </pre>
                <p className="text-[11px] text-slate-400 font-sans">
                  หรือติดตั้งเป็น Windows Service:
                </p>
                <pre className="text-indigo-300 bg-slate-950 p-2 rounded">
                  sc create SamchukAttendanceApi binPath= "D:\Sam_Att\backend\publish\SamchukAttendance.Api.exe" start= auto
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
