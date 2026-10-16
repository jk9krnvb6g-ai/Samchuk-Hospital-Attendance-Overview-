import React, { useState, useEffect } from 'react';
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
  FolderTree,
  Plus,
  Trash2,
  Edit2,
  Layers,
  Sparkles,
  Send,
  AlertCircle
} from 'lucide-react';
import { StoreState, attendanceStore } from '../services/attendanceStore';
import { apiClient, ApiHealthResponse, HOSPITAL_WEB_URL, DEFAULT_API_URL } from '../services/apiClient';

interface SystemAndLogsPageProps {
  state: StoreState;
}

export const SystemAndLogsPage: React.FC<SystemAndLogsPageProps> = ({ state }) => {
  const [activeTab, setActiveTab] = useState<'database' | 'sync' | 'audit' | 'sql' | 'backend' | 'network'>('database');
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

  // =========================================================================
  // Dual Database Testing & Live DB Management State
  // =========================================================================
  const [isTestingBoth, setIsTestingBoth] = useState(false);
  const [bothDbResult, setBothDbResult] = useState<any>(null);

  const [isTestingAtt, setIsTestingAtt] = useState(false);
  const [attDbResult, setAttDbResult] = useState<any>(null);

  const [isTestingHos, setIsTestingHos] = useState(false);
  const [hosDbResult, setHosDbResult] = useState<any>(null);

  const [isInitializingDb, setIsInitializingDb] = useState(false);

  // Direct Live Manager Sub-Tabs
  const [dbSubTab, setDbSubTab] = useState<'shifts' | 'raw_scans' | 'hosoffice_personnel'>('shifts');

  // Live Shifts from MySQL
  const [liveShifts, setLiveShifts] = useState<any[]>([]);
  const [isLoadingLiveShifts, setIsLoadingLiveShifts] = useState(false);

  // Live Raw Scans from MySQL
  const [liveRawScans, setLiveRawScans] = useState<any[]>([]);
  const [isLoadingLiveScans, setIsLoadingLiveScans] = useState(false);

  // Live Personnel from hosoffice.hr_person
  const [livePersonnel, setLivePersonnel] = useState<any[]>([]);
  const [isLoadingLivePersonnel, setIsLoadingLivePersonnel] = useState(false);

  // Actions & Messaging
  const [dbActionMsg, setDbActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPurgingStorage, setIsPurgingStorage] = useState(false);
  const [purgeStatus, setPurgeStatus] = useState<string | null>(null);

  // Form: Create New Shift directly into MySQL
  const [isCreatingShift, setIsCreatingShift] = useState(false);
  const [newShiftCode, setNewShiftCode] = useState('');
  const [newShiftName, setNewShiftName] = useState('');
  const [newShiftStart, setNewShiftStart] = useState('08:15');
  const [newShiftEnd, setNewShiftEnd] = useState('16:00');
  const [newShiftColor, setNewShiftColor] = useState('#0ea5e9');

  // Form: Add Test Scan directly into MySQL attendance_raw_scan
  const [isAddingTestScan, setIsAddingTestScan] = useState(false);
  const [testMachineNo, setTestMachineNo] = useState(1);
  const [testFingleId, setTestFingleId] = useState(101);
  const [testHrName, setTestHrName] = useState('ทดสอบ สแกนเวลาจริง');
  const [testScanTime, setTestScanTime] = useState(() => {
    const d = new Date();
    return d.toISOString().replace('T', ' ').substring(0, 19);
  });

  // Test Push to hosoffice.fingle_scan
  const [isPushingHosTest, setIsPushingHosTest] = useState(false);
  const [hosTestPushResult, setHosTestPushResult] = useState<any>(null);

  // -------------------------------------------------------------------------
  // Handlers for Dual Database Testing
  // -------------------------------------------------------------------------
  const handleTestBothDatabases = async () => {
    setIsTestingBoth(true);
    setDbActionMsg(null);
    try {
      const res = await apiClient.testBothDatabases();
      setBothDbResult(res);
      if (res.success) {
        setDbActionMsg({
          type: 'success',
          text: `เชื่อมต่อสมบูรณ์ทั้ง 2 ฐานข้อมูล! (samchuk_attendance: ${res.attendance?.latencyMs}ms, hosoffice: ${res.hosoffice?.latencyMs}ms)`
        });
      } else {
        setDbActionMsg({
          type: 'error',
          text: `ผลการทดสอบ: ${res.attendance?.message || ''} | ${res.hosoffice?.message || ''}`
        });
      }
    } catch (err) {
      setDbActionMsg({
        type: 'error',
        text: `ทดสอบไม่สำเร็จ: ${err instanceof Error ? err.message : 'Failed'}`
      });
    } finally {
      setIsTestingBoth(false);
    }
  };

  const handleTestAttendanceDb = async () => {
    setIsTestingAtt(true);
    setDbActionMsg(null);
    try {
      const res = await apiClient.testDatabaseConnection();
      setAttDbResult(res);
      if (res.success) {
        setDbActionMsg({
          type: 'success',
          text: `เชื่อมต่อฐานข้อมูล samchuk_attendance @ ${res.host} สำเร็จ (${res.latencyMs}ms)`
        });
      } else {
        setDbActionMsg({
          type: 'error',
          text: `เชื่อมต่อ samchuk_attendance ล้มเหลว: ${res.message}`
        });
      }
    } catch (err) {
      setDbActionMsg({
        type: 'error',
        text: `ทดสอบ samchuk_attendance ไม่สำเร็จ: ${err instanceof Error ? err.message : 'Failed'}`
      });
    } finally {
      setIsTestingAtt(false);
    }
  };

  const handleTestHosofficeDb = async () => {
    setIsTestingHos(true);
    setDbActionMsg(null);
    try {
      const res = await apiClient.testHosofficeDatabase();
      setHosDbResult(res);
      if (res.success) {
        setDbActionMsg({
          type: 'success',
          text: `เชื่อมต่อฐานข้อมูล hosoffice @ ${res.host} สำเร็จ (${res.latencyMs}ms)`
        });
      } else {
        setDbActionMsg({
          type: 'error',
          text: `เชื่อมต่อ hosoffice ล้มเหลว: ${res.message}`
        });
      }
    } catch (err) {
      setDbActionMsg({
        type: 'error',
        text: `ทดสอบ hosoffice ไม่สำเร็จ: ${err instanceof Error ? err.message : 'Failed'}`
      });
    } finally {
      setIsTestingHos(false);
    }
  };

  const handleInitDatabaseTables = async () => {
    setIsInitializingDb(true);
    setDbActionMsg(null);
    try {
      const res = await apiClient.initDatabaseTables();
      if (res.success) {
        setDbActionMsg({
          type: 'success',
          text: 'สร้างโครงสร้างตารางและ Seed กะเริ่มต้นใน samchuk_attendance เรียบร้อยแล้ว!'
        });
        handleLoadLiveShifts();
      } else {
        setDbActionMsg({ type: 'error', text: `สร้างตารางไม่สำเร็จ: ${res.message}` });
      }
    } catch (err) {
      setDbActionMsg({ type: 'error', text: `สร้างตารางไม่สำเร็จ: ${err instanceof Error ? err.message : 'Failed'}` });
    } finally {
      setIsInitializingDb(false);
    }
  };

  // -------------------------------------------------------------------------
  // Handlers for Live MySQL CRUD
  // -------------------------------------------------------------------------
  const handleLoadLiveShifts = async () => {
    setIsLoadingLiveShifts(true);
    try {
      const res = await apiClient.getShiftsFromDb();
      if (res.success && Array.isArray(res.data)) {
        setLiveShifts(res.data);
      }
    } catch (err) {
      console.error('Error fetching live shifts:', err);
    } finally {
      setIsLoadingLiveShifts(false);
    }
  };

  const handleCreateLiveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShiftCode || !newShiftName) return;
    setIsCreatingShift(true);
    setDbActionMsg(null);
    try {
      const res = await apiClient.createShiftInDb({
        code: newShiftCode.trim().toUpperCase(),
        name: newShiftName.trim(),
        startTime: newShiftStart,
        endTime: newShiftEnd,
        color: newShiftColor,
        isActive: true
      });
      if (res.success) {
        setDbActionMsg({ type: 'success', text: `บันทึกกะ [${newShiftCode}] ลง MySQL สำเร็จ (ID: ${res.id})` });
        setNewShiftCode('');
        setNewShiftName('');
        handleLoadLiveShifts();
        attendanceStore.loadFromMySqlDb();
      } else {
        setDbActionMsg({ type: 'error', text: `บันทึกกะไม่สำเร็จ: ${res.message}` });
      }
    } catch (err) {
      setDbActionMsg({ type: 'error', text: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Failed'}` });
    } finally {
      setIsCreatingShift(false);
    }
  };

  const handleDeleteLiveShift = async (id: number, code: string) => {
    if (!window.confirm(`ยืนยันการลบกะ [${code}] ออกจาก MySQL 10.2.0.201 โดยตรงหรือไม่?`)) return;
    try {
      const res = await apiClient.deleteShiftFromDb(id);
      if (res.success) {
        setDbActionMsg({ type: 'success', text: `ลบกะ [${code}] ออกจาก MySQL เรียบร้อยแล้ว` });
        handleLoadLiveShifts();
        attendanceStore.loadFromMySqlDb();
      } else {
        setDbActionMsg({ type: 'error', text: `ลบกะไม่สำเร็จ: ${res.message}` });
      }
    } catch (err) {
      setDbActionMsg({ type: 'error', text: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Failed'}` });
    }
  };

  const handleSyncAllShiftsToMySql = async () => {
    setDbActionMsg(null);
    try {
      const res = await apiClient.syncShiftsToDb(state.shifts);
      if (res.success) {
        setDbActionMsg({ type: 'success', text: res.message });
        handleLoadLiveShifts();
      } else {
        setDbActionMsg({ type: 'error', text: res.message });
      }
    } catch (err) {
      setDbActionMsg({ type: 'error', text: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Failed'}` });
    }
  };

  // -------------------------------------------------------------------------
  // Handlers for Live Raw Scans in MySQL
  // -------------------------------------------------------------------------
  const handleLoadLiveRawScans = async () => {
    setIsLoadingLiveScans(true);
    try {
      const res = await apiClient.getRawScansFromDb(150);
      if (res.success && Array.isArray(res.data)) {
        setLiveRawScans(res.data);
      }
    } catch (err) {
      console.error('Error fetching live raw scans:', err);
    } finally {
      setIsLoadingLiveScans(false);
    }
  };

  const handleAddLiveTestScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingTestScan(true);
    setDbActionMsg(null);
    try {
      const res = await apiClient.addRawScanToDb({
        machineNo: testMachineNo,
        deviceIp: testMachineNo === 1 ? '192.168.111.163' : (testMachineNo === 2 ? '192.168.111.164' : '192.168.111.165'),
        fingleId: testFingleId,
        scanDateTime: testScanTime,
        hrFullname: testHrName,
        pushStatus: 'PENDING'
      });
      if (res.success) {
        setDbActionMsg({ type: 'success', text: res.message });
        handleLoadLiveRawScans();
        attendanceStore.loadFromMySqlDb();
      } else {
        setDbActionMsg({ type: 'error', text: `เพิ่มข้อมูลไม่สำเร็จ: ${res.message}` });
      }
    } catch (err) {
      setDbActionMsg({ type: 'error', text: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Failed'}` });
    } finally {
      setIsAddingTestScan(false);
    }
  };

  const handleDeleteLiveScan = async (id: number) => {
    try {
      const res = await apiClient.deleteRawScanFromDb(id);
      if (res.success) {
        setDbActionMsg({ type: 'success', text: res.message });
        handleLoadLiveRawScans();
        attendanceStore.loadFromMySqlDb();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSeedSampleScans = async () => {
    setDbActionMsg(null);
    try {
      const res = await apiClient.seedSampleRawScansToDb();
      if (res.success) {
        setDbActionMsg({ type: 'success', text: res.message });
        handleLoadLiveRawScans();
        attendanceStore.loadFromMySqlDb();
      } else {
        setDbActionMsg({ type: 'error', text: res.message });
      }
    } catch (err) {
      setDbActionMsg({ type: 'error', text: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Failed'}` });
    }
  };

  const handleClearAllLiveScans = async () => {
    if (!window.confirm('คำเตือน: คุณต้องการล้างข้อมูลในตาราง attendance_raw_scan บน MySQL ทั้งหมดหรือไม่?')) return;
    try {
      const res = await apiClient.clearAllRawScansFromDb();
      if (res.success) {
        setDbActionMsg({ type: 'success', text: res.message });
        handleLoadLiveRawScans();
        attendanceStore.loadFromMySqlDb();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // -------------------------------------------------------------------------
  // Handlers for HOSOffice Personnel & Test Push
  // -------------------------------------------------------------------------
  const handleLoadLivePersonnel = async () => {
    setIsLoadingLivePersonnel(true);
    setDbActionMsg(null);
    try {
      const res = await apiClient.getPersonnelFromHosoffice(100);
      if (res.success && Array.isArray(res.data)) {
        setLivePersonnel(res.data);
        setDbActionMsg({ type: 'success', text: `ดึงข้อมูลบุคลากรจริงจาก hosoffice.hr_person สำเร็จ (${res.data.length} คน)` });
      } else {
        setDbActionMsg({ type: 'error', text: `ดึงข้อมูลไม่สำเร็จ: ${res.message}` });
      }
    } catch (err) {
      setDbActionMsg({ type: 'error', text: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Failed'}` });
    } finally {
      setIsLoadingLivePersonnel(false);
    }
  };

  const handleTestPushToHosoffice = async () => {
    setIsPushingHosTest(true);
    setDbActionMsg(null);
    try {
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const res = await apiClient.testPushToHosoffice({
        fingleId: 101,
        scanDateTime: now,
        machineNo: 1
      });
      setHosTestPushResult(res);
      if (res.success) {
        setDbActionMsg({ type: 'success', text: res.message });
      } else {
        setDbActionMsg({ type: 'error', text: res.message });
      }
    } catch (err) {
      setDbActionMsg({ type: 'error', text: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Failed'}` });
    } finally {
      setIsPushingHosTest(false);
    }
  };

  // -------------------------------------------------------------------------
  // Handlers for LocalStorage Purge & Force Direct MySQL
  // -------------------------------------------------------------------------
  const handlePurgeLocalStorage = async () => {
    if (!window.confirm('คุณต้องการล้าง LocalStorage เพื่อบังคับให้ระบบโหลดข้อมูลตรงจากฐานข้อมูล MySQL 10.2.0.201 เท่านั้นใช่หรือไม่?')) return;
    setIsPurgingStorage(true);
    setPurgeStatus('กำลังล้าง LocalStorage และโหลดข้อมูลสดจาก MySQL 10.2.0.201...');
    try {
      const res = await attendanceStore.purgeLocalStorageAndReloadFromMySql();
      setPurgeStatus(res.message);
      handleLoadLiveShifts();
      handleLoadLiveRawScans();
    } catch (err) {
      setPurgeStatus(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setIsPurgingStorage(false);
    }
  };

  // Auto load live shifts when entering database tab
  useEffect(() => {
    if (activeTab === 'database') {
      handleLoadLiveShifts();
      handleLoadLiveRawScans();
    }
  }, [activeTab]);

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
    scan_date_time DATETIME NOT NULL,
    verify_mode INT NULL,
    in_out_mode INT NULL,
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
    push_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
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
);`;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-800">
              ศูนย์เชื่อมต่อและจัดการฐานข้อมูล (Dual Database Hub & Live Manager)
            </h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
              10.2.0.201 Direct DB
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            ทดสอบการเชื่อมต่อทั้ง 2 ฐานข้อมูล (samchuk_attendance & hosoffice), จัดการข้อมูลกะ, สแกนดิบ และบุคลากรโดยตรงใน MySQL
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('database')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'database' ? 'bg-teal-700 text-white shadow-xs font-bold' : 'text-teal-800 hover:text-teal-900'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>1. จัดการ 2 ฐานข้อมูล (:201)</span>
          </button>
          <button
            onClick={() => setActiveTab('sync')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'sync' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Sync Logs ({state.syncLogs.length})
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'audit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            3. Audit Logs ({state.auditLogs.length})
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'sql' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            4. MySQL DDL
          </button>
          <button
            onClick={() => setActiveTab('network')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'network' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-indigo-600" />
            <span>5. Network & API (:3002)</span>
          </button>
        </div>
      </div>

      {/* Global Action Message Banner */}
      {dbActionMsg && (
        <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
          dbActionMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {dbActionMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
            <span className="font-semibold">{dbActionMsg.text}</span>
          </div>
          <button onClick={() => setDbActionMsg(null)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
        </div>
      )}

      {/* TAB 1: DUAL DATABASE HUB & LIVE MANAGER (:201) */}
      {activeTab === 'database' && (
        <div className="space-y-6">
          {/* Top Banner: Direct Connection & LocalStorage Purge Control */}
          <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white p-5 rounded-xl border border-teal-800/40 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-teal-500/20 text-teal-300 border border-teal-400/30">
                    Live Database Connection: 10.2.0.201
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Direct Live Mode
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-1">
                  ศูนย์ทดสอบการเชื่อมต่อและจัดการฐานข้อมูล 2 ฐาน (Dual Database Hub)
                </h3>
                <p className="text-xs text-slate-300 max-w-2xl mt-0.5">
                  ทำงานกับฐานข้อมูล MySQL บน <code className="bg-slate-800 text-teal-300 px-1 py-0.5 rounded font-mono">10.2.0.201:3306</code> โดยตรงทุกคำสั่ง ทั้งการเพิ่ม ลบ แก้ไข กะและข้อมูลสแกน
                </p>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleTestBothDatabases}
                  disabled={isTestingBoth}
                  className="px-3.5 py-2 bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-all shadow-xs disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingBoth ? 'animate-spin' : ''}`} />
                  <span>{isTestingBoth ? 'กำลังทดสอบทั้ง 2 ฐาน...' : 'ทดสอบเชื่อมต่อทั้ง 2 ฐานข้อมูล'}</span>
                </button>
                <button
                  onClick={handlePurgeLocalStorage}
                  disabled={isPurgingStorage}
                  className="px-3 py-2 bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer transition-all border border-rose-400/30 shadow-xs"
                  title="ล้างแคชบราวเซอร์เพื่อยืนยันว่าข้อมูลแสดงผลมาจาก MySQL ล้วนๆ"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>ล้างแคช LocalStorage (ใช้ MySQL 100%)</span>
                </button>
              </div>
            </div>

            {purgeStatus && (
              <div className="bg-slate-800/80 border border-teal-500/30 text-teal-200 text-xs p-2.5 rounded-lg flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-400 shrink-0" />
                <span>{purgeStatus}</span>
              </div>
            )}
          </div>

          {/* 2 Core Database Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Card 1: samchuk_attendance */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      ฐานข้อมูลที่ 1: samchuk_attendance
                    </h4>
                    <p className="text-xs text-slate-500">ระบบบันทึกเวลา, ตารางกะ, ผังเวร, ข้อมูลสแกนดิบ</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-teal-50 text-teal-800 border border-teal-200 font-mono text-[11px] rounded font-bold">
                  10.2.0.201
                </span>
              </div>

              {/* Status details */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">ชื่อฐานข้อมูล:</span>
                  <span className="font-bold text-teal-900">samchuk_attendance</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">สถานะการเชื่อมต่อ:</span>
                  {attDbResult ? (
                    attDbResult.success ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>เชื่อมต่อได้ ({attDbResult.latencyMs} ms)</span>
                      </span>
                    ) : (
                      <span className="text-red-600 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>ไม่สำเร็จ</span>
                      </span>
                    )
                  ) : (
                    <span className="text-slate-400">กดปุ่มทดสอบด้านล่าง</span>
                  )}
                </div>
                {attDbResult && attDbResult.tables && (
                  <div className="pt-2 border-t border-slate-200 space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-600">กะ (attendance_shift):</span>
                      <span className="font-bold text-slate-800">{attDbResult.tables.shifts} รายการ</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">สแกนดิบ (attendance_raw_scan):</span>
                      <span className="font-bold text-slate-800">{attDbResult.tables.rawScans} รายการ</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">ผังเวร (attendance_person_roster):</span>
                      <span className="font-bold text-slate-800">{attDbResult.tables.roster} รายการ</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions for DB 1 */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleTestAttendanceDb}
                  disabled={isTestingAtt}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingAtt ? 'animate-spin' : ''}`} />
                  <span>ทดสอบเชื่อมต่อ samchuk_attendance</span>
                </button>
                <button
                  onClick={handleInitDatabaseTables}
                  disabled={isInitializingDb}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-semibold cursor-pointer disabled:opacity-50"
                  title="สร้างโครงสร้างตารางและ Seed กะเริ่มต้นใน MySQL"
                >
                  {isInitializingDb ? 'กำลังสร้าง...' : 'สร้างตาราง & กะ'}
                </button>
              </div>
            </div>

            {/* Card 2: hosoffice */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      ฐานข้อมูลที่ 2: hosoffice
                    </h4>
                    <p className="text-xs text-slate-500">ระบบงานบุคลากรโรงพยาบาลสามชุก, hr_person, fingle_scan</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono text-[11px] rounded font-bold">
                  10.2.0.201
                </span>
              </div>

              {/* Status details */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">ชื่อฐานข้อมูล:</span>
                  <span className="font-bold text-indigo-900">hosoffice</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">สถานะการเชื่อมต่อ:</span>
                  {hosDbResult ? (
                    hosDbResult.success ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>เชื่อมต่อได้ ({hosDbResult.latencyMs} ms)</span>
                      </span>
                    ) : (
                      <span className="text-red-600 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>ไม่สำเร็จ</span>
                      </span>
                    )
                  ) : (
                    <span className="text-slate-400">กดปุ่มทดสอบด้านล่าง</span>
                  )}
                </div>
                {hosDbResult && hosDbResult.tables && (
                  <div className="pt-2 border-t border-slate-200 space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-600">บุคลากร (hr_person):</span>
                      <span className="font-bold text-slate-800">{hosDbResult.tables.hrPerson} รายการ</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">ข้อมูลสแกน (fingle_scan):</span>
                      <span className="font-bold text-slate-800">{hosDbResult.tables.fingleScan} รายการ</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">กลุ่มงาน (hr_department):</span>
                      <span className="font-bold text-slate-800">{hosDbResult.tables.departments} รายการ</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions for DB 2 */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleTestHosofficeDb}
                  disabled={isTestingHos}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingHos ? 'animate-spin' : ''}`} />
                  <span>ทดสอบเชื่อมต่อ hosoffice</span>
                </button>
                <button
                  onClick={handleTestPushToHosoffice}
                  disabled={isPushingHosTest}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1"
                  title="ทดสอบเขียนข้อมูลสแกนเวลา 1 รายการเข้าตาราง fingle_scan"
                >
                  <Send className="w-3 h-3" />
                  <span>{isPushingHosTest ? 'กำลังส่ง...' : 'ทดสอบเขียน 1 สแกน'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Direct Table Management Section */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-teal-700" />
                  <span>แผงจัดการข้อมูลสดในฐานข้อมูล MySQL (Live Table CRUD Manager)</span>
                </h4>
                <p className="text-xs text-slate-500">
                  เพิ่ม ลบ แก้ไข และอ่านข้อมูลโดยตรงกับ MySQL 10.2.0.201 ได้ทันทีโดยไม่ต้องผ่าน LocalStorage
                </p>
              </div>

              {/* Sub-tab Switcher */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold border border-slate-200">
                <button
                  onClick={() => { setDbSubTab('shifts'); handleLoadLiveShifts(); }}
                  className={`px-3 py-1 rounded cursor-pointer ${
                    dbSubTab === 'shifts' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  1. ตารางกะ ({liveShifts.length})
                </button>
                <button
                  onClick={() => { setDbSubTab('raw_scans'); handleLoadLiveRawScans(); }}
                  className={`px-3 py-1 rounded cursor-pointer ${
                    dbSubTab === 'raw_scans' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  2. สแกนดิบ ({liveRawScans.length})
                </button>
                <button
                  onClick={() => { setDbSubTab('hosoffice_personnel'); handleLoadLivePersonnel(); }}
                  className={`px-3 py-1 rounded cursor-pointer ${
                    dbSubTab === 'hosoffice_personnel' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  3. บุคลากร hosoffice ({livePersonnel.length})
                </button>
              </div>
            </div>

            {/* SUB-TAB 1: LIVE SHIFTS CRUD */}
            {dbSubTab === 'shifts' && (
              <div className="space-y-4">
                {/* Add Shift Form */}
                <form onSubmit={handleCreateLiveShift} className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-teal-600" />
                      <span>เพิ่มกะใหม่ลงใน MySQL (attendance_shift) โดยตรง</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleSyncAllShiftsToMySql}
                      className="text-xs text-teal-700 hover:text-teal-900 font-semibold underline cursor-pointer"
                    >
                      ซิงค์กะทั้งหมดจากหน้าระบบเข้า MySQL
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">รหัสกะ (Code):</label>
                      <input
                        type="text"
                        placeholder="เช่น M, A, N, OT"
                        value={newShiftCode}
                        onChange={(e) => setNewShiftCode(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold uppercase"
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">ชื่อกะ (Name):</label>
                      <input
                        type="text"
                        placeholder="เช่น กะเช้าปกติ, กะบ่ายเวรพิเศษ"
                        value={newShiftName}
                        onChange={(e) => setNewShiftName(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">เวลาเข้า - ออก:</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="time"
                          value={newShiftStart}
                          onChange={(e) => setNewShiftStart(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-1.5 py-1.5 text-xs font-mono"
                        />
                        <span className="text-slate-400">-</span>
                        <input
                          type="time"
                          value={newShiftEnd}
                          onChange={(e) => setNewShiftEnd(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-1.5 py-1.5 text-xs font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={isCreatingShift}
                        className="w-full py-2 bg-teal-700 hover:bg-teal-800 text-white rounded text-xs font-bold cursor-pointer transition-colors shadow-xs disabled:opacity-50"
                      >
                        {isCreatingShift ? 'กำลังบันทึก...' : '+ บันทึกเข้า MySQL'}
                      </button>
                    </div>
                  </div>
                </form>

                {/* Live Shifts Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 w-16">ID</th>
                        <th className="py-2.5 px-3">รหัสกะ</th>
                        <th className="py-2.5 px-3">ชื่อกะ</th>
                        <th className="py-2.5 px-3 font-mono">เวลาเข้า-ออก</th>
                        <th className="py-2.5 px-3">ข้ามคืน</th>
                        <th className="py-2.5 px-3">สถานะ</th>
                        <th className="py-2.5 px-3 text-right">การจัดการ (MySQL)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {liveShifts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-400">
                            {isLoadingLiveShifts ? 'กำลังดึงข้อมูลกะจาก MySQL 10.2.0.201...' : 'ยังไม่พบข้อมูลกะในตาราง attendance_shift (สามารถกดปุ่ม "สร้างตาราง & กะ" ด้านบนได้ครับ)'}
                          </td>
                        </tr>
                      ) : (
                        liveShifts.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono text-slate-400">{s.id}</td>
                            <td className="py-2.5 px-3 font-bold text-teal-800">
                              <span className="px-2 py-0.5 rounded font-mono text-[11px]" style={{ backgroundColor: `${s.color || '#0ea5e9'}20`, color: s.color || '#0ea5e9' }}>
                                {s.code || s.shift_code}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-800">{s.name || s.shift_name}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-700">
                              {s.startTime || s.start_time} - {s.endTime || s.end_time}
                            </td>
                            <td className="py-2.5 px-3">
                              {s.crossesMidnight ? (
                                <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded">ข้ามเที่ยงคืน</span>
                              ) : (
                                <span className="text-[10px] text-slate-400">ปกติ</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                                เปิดใช้งาน
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => handleDeleteLiveShift(s.id, s.code || s.shift_code)}
                                className="px-2 py-1 text-[11px] text-red-600 hover:text-red-800 hover:bg-red-50 rounded cursor-pointer transition-colors"
                              >
                                ลบจาก MySQL
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUB-TAB 2: LIVE RAW SCANS CRUD */}
            {dbSubTab === 'raw_scans' && (
              <div className="space-y-4">
                {/* Form to insert test scan directly to MySQL */}
                <form onSubmit={handleAddLiveTestScan} className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-teal-600" />
                      <span>เพิ่มข้อมูลสแกนเวลาทดสอบลง MySQL (attendance_raw_scan) โดยตรง</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSeedSampleScans}
                        className="text-xs bg-slate-200 hover:bg-slate-300 px-2.5 py-1 rounded font-semibold text-slate-700 cursor-pointer"
                      >
                        + เติมสแกนตัวอย่าง 5 รายการ
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAllLiveScans}
                        className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2.5 py-1 rounded font-semibold cursor-pointer"
                      >
                        ล้างตารางทั้งหมด
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">เครื่องสแกน:</label>
                      <select
                        value={testMachineNo}
                        onChange={(e) => setTestMachineNo(parseInt(e.target.value, 10))}
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs font-medium"
                      >
                        <option value={1}>เครื่อง 1 (หน้าตึกอำนวยการ - .163)</option>
                        <option value={2}>เครื่อง 2 (ตึก ER - .164)</option>
                        <option value={3}>เครื่อง 3 (ตึก IPD - .165)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">รหัสลายนิ้วมือ (Fingle ID):</label>
                      <input
                        type="number"
                        value={testFingleId}
                        onChange={(e) => setTestFingleId(parseInt(e.target.value, 10))}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">ชื่อบุคลากร (ทดสอบ):</label>
                      <input
                        type="text"
                        value={testHrName}
                        onChange={(e) => setTestHrName(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                        required
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={isAddingTestScan}
                        className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-bold cursor-pointer transition-colors disabled:opacity-50"
                      >
                        {isAddingTestScan ? 'กำลังบันทึก...' : '+ บันทึกสแกนลง MySQL'}
                      </button>
                    </div>
                  </div>
                </form>

                {/* Scans Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-96">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">ID</th>
                        <th className="py-2.5 px-3">เครื่อง</th>
                        <th className="py-2.5 px-3 font-mono">Fingle ID</th>
                        <th className="py-2.5 px-3 font-mono">วัน-เวลาสแกน</th>
                        <th className="py-2.5 px-3">ชื่อ-สกุล</th>
                        <th className="py-2.5 px-3">สถานะส่ง hosoffice</th>
                        <th className="py-2.5 px-3 text-right">ลบ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {liveRawScans.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            {isLoadingLiveScans ? 'กำลังดึงข้อมูลสแกนจาก MySQL 10.2.0.201...' : 'ยังไม่มีข้อมูลสแกนในตาราง attendance_raw_scan (สามารถกดปุ่ม "+ เติมสแกนตัวอย่าง 5 รายการ" เพื่อทดสอบได้ครับ)'}
                          </td>
                        </tr>
                      ) : (
                        liveRawScans.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono text-slate-400">{s.id}</td>
                            <td className="py-2 px-3 font-semibold text-slate-800">เครื่อง {s.machineNo}</td>
                            <td className="py-2 px-3 font-mono font-bold text-teal-800">{s.fingleId}</td>
                            <td className="py-2 px-3 font-mono text-slate-700">{s.scanDateTime}</td>
                            <td className="py-2 px-3 text-slate-800">{s.hrFullname || '-'}</td>
                            <td className="py-2 px-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                s.pushStatus === 'PENDING' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}>
                                {s.pushStatus}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                onClick={() => handleDeleteLiveScan(s.id)}
                                className="text-red-500 hover:text-red-700 text-xs cursor-pointer"
                              >
                                ลบ
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUB-TAB 3: HOSOFFICE PERSONNEL & SYNC */}
            {dbSubTab === 'hosoffice_personnel' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                  <div className="text-xs text-indigo-900 font-medium">
                    รายชื่อบุคลากรจริงที่ดึงผ่านคำสั่ง SQL จากตาราง <code className="font-mono font-bold">hosoffice.hr_person</code> @ 10.2.0.201
                  </div>
                  <button
                    onClick={handleLoadLivePersonnel}
                    disabled={isLoadingLivePersonnel}
                    className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded text-xs font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLivePersonnel ? 'animate-spin' : ''}`} />
                    <span>ดึงรายชื่อล่าสุดจาก hosoffice</span>
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-96">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">ID</th>
                        <th className="py-2.5 px-3 font-mono">Fingle ID</th>
                        <th className="py-2.5 px-3 font-mono">CID</th>
                        <th className="py-2.5 px-3">ชื่อ-นามสกุล</th>
                        <th className="py-2.5 px-3">ตำแหน่ง</th>
                        <th className="py-2.5 px-3">กลุ่มงาน / แผนก</th>
                        <th className="py-2.5 px-3">ประเภทบุคลากร</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {livePersonnel.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            {isLoadingLivePersonnel ? 'กำลังติดต่อ MySQL ดึงรายชื่อบุคลากรจาก hosoffice...' : 'ยังไม่ได้ดึงรายชื่อ หรือตาราง hr_person ยังไม่มีข้อมูล (กดปุ่ม "ดึงรายชื่อล่าสุดจาก hosoffice" ด้านบน)'}
                          </td>
                        </tr>
                      ) : (
                        livePersonnel.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono text-slate-400">{p.id}</td>
                            <td className="py-2 px-3 font-mono font-bold text-teal-800">{p.fingle_id || p.fingleId}</td>
                            <td className="py-2 px-3 font-mono text-slate-500">{p.hr_cid || p.hrCid || '-'}</td>
                            <td className="py-2 px-3 font-semibold text-slate-800">{p.hr_fullname || p.hrFullname}</td>
                            <td className="py-2 px-3 text-slate-600">{p.hr_position_name || p.hrPositionName}</td>
                            <td className="py-2 px-3 text-slate-600">{p.hr_dep_name || p.hrDepName}</td>
                            <td className="py-2 px-3 text-slate-600">{p.hr_person_type_name || p.hrPersonTypeName}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SYNC LOGS - Section 28 */}
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

      {/* TAB 3: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              Audit Trail (บันทึกประวัติการกระทำของผู้ดูแลระบบ)
            </h3>
            <span className="text-xs text-slate-500">
              บันทึกการส่งข้อมูลเข้า hosoffice และการปรับแต่งกะ
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">วัน-เวลา</th>
                  <th className="py-2.5 px-3">ผู้ใช้งาน</th>
                  <th className="py-2.5 px-3">ประเภทกิจกรรม</th>
                  <th className="py-2.5 px-3">รายละเอียดคำสั่ง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {state.auditLogs.map((a, idx) => (
                  <tr key={`${a.id}-${idx}`} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">{a.timestamp}</td>
                    <td className="py-2 px-3 font-bold text-slate-800">{a.username}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {a.actionType}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-700">{a.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: SQL DDL */}
      {activeTab === 'sql' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              โครงสร้างตาราง MySQL DDL (samchuk_attendance)
            </h3>
            <button
              onClick={() => handleCopy('sql', sqlSchemaScript)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded cursor-pointer flex items-center gap-1.5"
            >
              {copiedKey === 'sql' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'sql' ? 'คัดลอกแล้ว!' : 'คัดลอก SQL'}</span>
            </button>
          </div>
          <pre className="bg-slate-950 text-emerald-400 p-4 rounded-lg font-mono text-xs overflow-x-auto max-h-[500px]">
            {sqlSchemaScript}
          </pre>
        </div>
      )}

      {/* TAB 5: NETWORK & API GATEWAY */}
      {activeTab === 'network' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-teal-600" />
                  <span>กำหนดค่า Backend API Gateway (:3002)</span>
                </h4>
                <p className="text-xs text-slate-500">
                  ตรวจสอบการสื่อสารระหว่างหน้าเว็บเบราว์เซอร์กับ API พอร์ต 3002 บนเซิร์ฟเวอร์
                </p>
              </div>
              <button
                onClick={handleResetApiUrl}
                className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded bg-slate-50 cursor-pointer"
              >
                คืนค่าเริ่มต้น
              </button>
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
                    placeholder="http://10.2.0.13:3002"
                    className="flex-1 bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs font-mono text-slate-800"
                  />
                  <button
                    onClick={handleSaveApiUrl}
                    className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded cursor-pointer transition-colors"
                  >
                    บันทึก & ทดสอบ
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  สถานะ API:
                </label>
                <div className="p-2 border rounded bg-slate-50 flex items-center justify-between min-h-[38px]">
                  {pingResult ? (
                    pingResult.online ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Online ({pingResult.latencyMs} ms)</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Offline</span>
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
          </div>
        </div>
      )}
    </div>
  );
};
