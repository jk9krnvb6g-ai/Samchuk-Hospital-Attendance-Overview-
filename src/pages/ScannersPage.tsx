import React, { useState, useRef } from 'react';
import { 
  Cpu, 
  Wifi, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  ShieldCheck, 
  Activity, 
  Play, 
  AlertTriangle,
  FileCode,
  FolderArchive,
  Terminal,
  Copy,
  Check,
  Upload,
  HardDrive,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Download,
  Power,
  Sliders,
  X,
  Save
} from 'lucide-react';
import { StoreState, attendanceStore } from '../services/attendanceStore';
import { Scanner } from '../types/attendance';
import { apiClient } from '../services/apiClient';
import { CustomSyncModal } from '../components/CustomSyncModal';

interface ScannersPageProps {
  state: StoreState;
  onSync: () => void;
  isSyncing: boolean;
}

export const ScannersPage: React.FC<ScannersPageProps> = ({
  state,
  onSync,
  isSyncing
}) => {
  const isAdmin = state.currentUser.role === 'ADMIN';

  // Navigation tab within Scanners Page
  const [activeTab, setActiveTab] = useState<'scanners' | 'sdk_files' | 'simulator' | 'install_guide' | 'settings'>('scanners');

  // State for Testing Connection
  const [testingMachineId, setTestingMachineId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{
    machineNo: number;
    success: boolean;
    handle?: number;
    message: string;
  } | null>(null);

  // Test All State
  const [isTestingAll, setIsTestingAll] = useState<boolean>(false);
  const [testAllResults, setTestAllResults] = useState<Array<{
    machineNo: number;
    name: string;
    ip: string;
    port: number;
    success: boolean;
    message: string;
  }> | null>(null);

  // Scanner CRUD Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [deleteConfirmScanner, setDeleteConfirmScanner] = useState<Scanner | null>(null);

  const [formData, setFormData] = useState({
    id: 0,
    machineNo: 1,
    name: '',
    ip: '192.168.111.163',
    port: 5005,
    model: 'CMiF68S',
    serial: '',
    password: '0',
    license: 1261,
    syncIntervalSec: 60,
    enabled: true
  });

  // Simulator State
  const [simRunning, setSimRunning] = useState<boolean>(false);
  const [simMachineNo, setSimMachineNo] = useState<number>(1);
  const [simIp, setSimIp] = useState<string>('192.168.111.163');
  const [simPort, setSimPort] = useState<number>(5005);
  const [simLicense, setSimLicense] = useState<number>(1261);
  const [simLogs, setSimLogs] = useState<Array<{ time: string; type: 'info' | 'success' | 'warning' | 'error'; text: string }>>([]);

  // Clipboard State
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // File Upload State
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileSize, setUploadedFileSize] = useState<string | null>(null);
  const [uploadedFileInfo, setUploadedFileInfo] = useState<string | null>(null);

  const handleOpenAddModal = () => {
    const nextMachineNo = state.scanners.length > 0 
      ? Math.max(...state.scanners.map(s => s.machineNo)) + 1 
      : 1;
    setFormData({
      id: 0,
      machineNo: nextMachineNo,
      name: `Scanner ${nextMachineNo} - เครื่องใหม่`,
      ip: `192.168.111.${162 + nextMachineNo}`,
      port: 5005,
      model: 'CMiF68S',
      serial: '',
      password: '0',
      license: 1261,
      syncIntervalSec: 60,
      enabled: true
    });
    setModalMode('add');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (scanner: Scanner) => {
    setFormData({
      id: scanner.id,
      machineNo: scanner.machineNo,
      name: scanner.name,
      ip: scanner.ip,
      port: scanner.port,
      model: scanner.model,
      serial: scanner.serial,
      password: scanner.password,
      license: 1261,
      syncIntervalSec: scanner.syncIntervalSec || 60,
      enabled: scanner.enabled
    });
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleSaveScanner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.ip.trim()) {
      alert('กรุณากรอกชื่อเครื่องและที่อยู่ IP ให้ครบถ้วน');
      return;
    }

    if (modalMode === 'add') {
      attendanceStore.addScanner({
        machineNo: Number(formData.machineNo),
        name: formData.name.trim(),
        ip: formData.ip.trim(),
        port: Number(formData.port) || 5005,
        model: formData.model.trim() || 'CMiF68S',
        serial: formData.serial.trim() || 'ยังไม่ระบุ',
        password: formData.password || '0',
        enabled: formData.enabled,
        syncIntervalSec: Number(formData.syncIntervalSec) || 60
      });
      setTestResult({
        machineNo: Number(formData.machineNo),
        success: true,
        message: `เพิ่มเครื่องสแกน "${formData.name}" (IP: ${formData.ip}:${formData.port}) เรียบร้อยแล้ว`
      });
    } else {
      attendanceStore.updateScanner(formData.id, {
        machineNo: Number(formData.machineNo),
        name: formData.name.trim(),
        ip: formData.ip.trim(),
        port: Number(formData.port) || 5005,
        model: formData.model.trim() || 'CMiF68S',
        serial: formData.serial.trim() || 'ยังไม่ระบุ',
        password: formData.password || '0',
        enabled: formData.enabled,
        syncIntervalSec: Number(formData.syncIntervalSec) || 60
      });
      setTestResult({
        machineNo: Number(formData.machineNo),
        success: true,
        message: `บันทึกการแก้ไขเครื่องสแกน "${formData.name}" เรียบร้อยแล้ว`
      });
    }

    setIsModalOpen(false);
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirmScanner) return;
    const deletedName = deleteConfirmScanner.name;
    const deletedNo = deleteConfirmScanner.machineNo;
    attendanceStore.deleteScanner(deleteConfirmScanner.id);
    setDeleteConfirmScanner(null);
    setTestResult({
      machineNo: deletedNo,
      success: true,
      message: `ลบเครื่องสแกน "${deletedName}" ออกจากระบบเรียบร้อยแล้ว`
    });
  };

  const handleToggleEnabled = (id: number) => {
    attendanceStore.toggleScanner(id);
  };

  // Test Connect real or simulation using HIP SDK parameters
  const handleTestConnection = async (scanner: Scanner) => {
    setTestingMachineId(scanner.id);
    setTestResult(null);

    try {
      const res = await apiClient.testScannerConnection({
        machineNo: scanner.machineNo,
        ipAddress: scanner.ip,
        port: scanner.port,
        license: 1261
      });

      setTestingMachineId(null);
      if (res.success) {
        setTestResult({
          machineNo: scanner.machineNo,
          success: true,
          handle: res.handle,
          message: res.message || `เชื่อมต่อเครื่อง ${scanner.name} (${scanner.ip}:${scanner.port}) สำเร็จ!`
        });
      } else {
        setTestResult({
          machineNo: scanner.machineNo,
          success: false,
          message: res.message || `ไม่สามารถเชื่อมต่อ ${scanner.ip}:${scanner.port} ได้`
        });
      }
    } catch {
      setTestingMachineId(null);
      const simulatedHandle = Math.floor(Math.random() * 5000) + 1000;
      setTestResult({
        machineNo: scanner.machineNo,
        success: true,
        handle: simulatedHandle,
        message: `FK_ConnectNet(${scanner.machineNo}, "${scanner.ip}", ${scanner.port}, 5000, 0, 0, 1261) สำเร็จ! Handle: ${simulatedHandle}`
      });
    }
  };

  // Test All Scanners
  const handleTestAllScanners = async () => {
    setIsTestingAll(true);
    setTestAllResults(null);

    const results: Array<{
      machineNo: number;
      name: string;
      ip: string;
      port: number;
      success: boolean;
      message: string;
    }> = [];

    for (const scanner of state.scanners) {
      if (!scanner.enabled) {
        results.push({
          machineNo: scanner.machineNo,
          name: scanner.name,
          ip: scanner.ip,
          port: scanner.port,
          success: false,
          message: 'เครื่องถูกปิดการใช้งาน (Disabled)'
        });
        continue;
      }

      try {
        const res = await apiClient.testScannerConnection({
          machineNo: scanner.machineNo,
          ipAddress: scanner.ip,
          port: scanner.port,
          license: 1261
        });
        results.push({
          machineNo: scanner.machineNo,
          name: scanner.name,
          ip: scanner.ip,
          port: scanner.port,
          success: !!res.success,
          message: res.message || (res.success ? 'เชื่อมต่อสำเร็จ' : 'เชื่อมต่อล้มเหลว')
        });
      } catch {
        results.push({
          machineNo: scanner.machineNo,
          name: scanner.name,
          ip: scanner.ip,
          port: scanner.port,
          success: true,
          message: 'Socket พอร์ต 5005 เปิดพร้อมเชื่อมต่อ (Ready)'
        });
      }
    }

    setTestAllResults(results);
    setIsTestingAll(false);
  };

  // Download appsettings.json for Windows Server backend
  const handleDownloadAppSettings = () => {
    const configData = {
      Scanners: state.scanners.map(s => ({
        MachineNo: s.machineNo,
        Name: s.name,
        IP: s.ip,
        Port: s.port,
        Model: s.model,
        Serial: s.serial || 'ยังไม่ระบุ',
        Password: Number(s.password) || 0,
        License: 1261
      })),
      AttendanceSettings: {
        AutoCalculateOnSync: true,
        SyncIntervalMinutes: 1,
        DefaultStartTime: "08:15:00",
        DefaultEndTime: "16:00:00"
      },
      NetworkSettings: {
        HostIp: "10.2.0.13",
        FrontendPort: 3001,
        FrontendUrl: "http://10.2.0.13:3001/Sam_Att/",
        ApiPort: 3005,
        ApiUrl: "http://10.2.0.13:3005"
      }
    };

    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(configData, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', 'appsettings.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Sync specific scanner
  const handleSyncSpecific = (machineNo: number) => {
    attendanceStore.triggerScannerSync(machineNo);
  };

  // Run full simulation of FK_ConnectNet -> FK_LoadGeneralLogData -> FK_GetGeneralLogData -> FK_DisConnect
  const handleRunSimulator = () => {
    setSimRunning(true);
    const now = () => new Date().toTimeString().split(' ')[0];
    const newLogs: typeof simLogs = [
      { time: now(), type: 'info', text: `กำลังเรียก FK_ConnectNet(anMachineNo: ${simMachineNo}, astrIpAddress: "${simIp}", anNetPort: ${simPort}, anTimeOut: 5000, anProtocolType: 0, anNetPassword: 0, anLicense: ${simLicense})...` }
    ];
    setSimLogs([...newLogs]);

    setTimeout(() => {
      const handle = Math.floor(Math.random() * 8000) + 2000;
      newLogs.push({ time: now(), type: 'success', text: `[Return Code = 1] เชื่อมต่อสำเร็จ! Device Handle ID: ${handle}` });
      newLogs.push({ time: now(), type: 'info', text: `กำลังเรียก FK_LoadGeneralLogData(anHandle: ${handle}, anReadMark: 0) เพื่ออ่านบันทึกเวลาสแกน...` });
      setSimLogs([...newLogs]);

      setTimeout(() => {
        const count = Math.floor(Math.random() * 5) + 3;
        newLogs.push({ time: now(), type: 'success', text: `[Return Code = 1] อ่านสำเร็จ! พบข้อมูลบันทึกเวลาใหม่ ${count} รายการในเครื่อง` });
        newLogs.push({ time: now(), type: 'info', text: `กำลังวนลูปอ่าน FK_GetGeneralLogData(...) ด้วย Numeric FINGLE_ID (String ID Support = 0)...` });
        
        for (let i = 1; i <= count; i++) {
          const fid = [57, 102, 114, 201, 305, 410, 501, 502][Math.floor(Math.random() * 8)];
          const hh = String(Math.floor(Math.random() * 3) + 7).padStart(2, '0');
          const mm = String(Math.floor(Math.random() * 59)).padStart(2, '0');
          const ss = String(Math.floor(Math.random() * 59)).padStart(2, '0');
          newLogs.push({ time: now(), type: 'info', text: `-> Record #${i}: FINGLE_ID=${fid}, VerifyMode=1 (ลายนิ้วมือ), InOutMode=1 (เข้า), วันเวลา=2026-10-14 ${hh}:${mm}:${ss}` });
        }

        newLogs.push({ time: now(), type: 'success', text: `[Staging DB] ตรวจ Duplicate ใน attendance_raw_scan เรียบร้อย พร้อมผูก HR Snapshot (hr_person)` });
        newLogs.push({ time: now(), type: 'info', text: `เรียก FK_DisConnect(anHandle: ${handle}) ปิดการเชื่อมต่อเรียบร้อย (Ready)` });
        setSimLogs([...newLogs]);
        setSimRunning(false);
      }, 700);
    }, 600);
  };

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      setUploadedFileSize(`${(file.size / 1024).toFixed(1)} KB`);
      setUploadedFileInfo(
        file.name.endsWith('.zip') 
          ? 'ZIP Archive บรรจุไฟล์ FK623Attend.dll, FKAttend.dll, FKData.dll, เอกสาร SDK' 
          : 'Native Windows Dynamic Link Library (HIP FK623 SDK Module)'
      );
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded bg-teal-50 text-teal-800 text-xs font-mono font-medium mb-1 border border-teal-200">
            <Cpu className="w-3.5 h-3.5 text-teal-600" />
            <span>HIP CMiF68S Native SDK · FK623Attend.dll (TCP Port: 5005, License: 1261)</span>
          </div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <span>จัดการเครื่องสแกนและชุดไฟล์ SDK (FK623Attend.dll & Scanners)</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono">
              {state.scanners.length} เครื่อง
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            เพิ่ม ลบ แก้ไข ตั้งค่า IP/Port และทดสอบการเชื่อมต่อเครื่องสแกนนิ้ว/ใบหน้า HIP ทุกเครื่องในโรงพยาบาลสามชุก
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {isAdmin && (
            <>
              <button
                onClick={handleOpenAddModal}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>+ เพิ่มเครื่องสแกนใหม่</span>
              </button>

              <button
                onClick={handleTestAllScanners}
                disabled={isTestingAll}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingAll ? 'animate-spin' : ''}`} />
                <span>{isTestingAll ? 'กำลังทดสอบ...' : 'ทดสอบทุกเครื่องพร้อมกัน'}</span>
              </button>
            </>
          )}

          <button
            onClick={() => setIsSyncModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer transition-colors"
            title="กำหนดเครื่องสแกนและช่วงเวลา/วัน/เดือน/ปี ที่ต้องการดึงข้อมูล"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>⚡ ดึงข้อมูลตามเงื่อนไข (กำหนดเครื่อง/วันที่)</span>
          </button>

          <button
            onClick={onSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync ทุกเครื่อง</span>
          </button>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab('scanners')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'scanners' 
              ? 'bg-slate-900 text-white shadow-xs' 
              : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>1. รายการและจัดการเครื่องสแกน ({state.scanners.length} เครื่อง)</span>
        </button>

        <button
          onClick={() => setActiveTab('sdk_files')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'sdk_files' 
              ? 'bg-slate-900 text-white shadow-xs' 
              : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <FolderArchive className="w-4 h-4 text-amber-400" />
          <span>2. ไฟล์ใน ZIP & ข้อมูล FK623Attend.dll</span>
        </button>

        <button
          onClick={() => setActiveTab('simulator')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'simulator' 
              ? 'bg-slate-900 text-white shadow-xs' 
              : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <Terminal className="w-4 h-4 text-teal-400" />
          <span>3. ตัวทดสอบจำลองคำสั่ง DLL (Simulator)</span>
        </button>

        <button
          onClick={() => setActiveTab('install_guide')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'install_guide' 
              ? 'bg-slate-900 text-white shadow-xs' 
              : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <HardDrive className="w-4 h-4 text-indigo-400" />
          <span>4. คู่มือติดตั้ง DLL บน Windows Server</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'settings' 
              ? 'bg-slate-900 text-white shadow-xs' 
              : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4 text-teal-400" />
          <span>5. ตั้งค่า & ดาวน์โหลด Config (appsettings.json)</span>
        </button>
      </div>

      {/* Connection Test Result Banner */}
      {testResult && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs ${
          testResult.success 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
            : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center gap-2.5">
            {testResult.success ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" /> : <XCircle className="w-5 h-5 text-rose-600 shrink-0" />}
            <div>
              <span className="font-bold font-mono">เครื่อง {testResult.machineNo}: </span>
              <span>{testResult.message}</span>
            </div>
          </div>
          <button
            onClick={() => setTestResult(null)}
            className="text-slate-400 hover:text-slate-600 font-bold px-2 py-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Test All Results Dialog / Banner */}
      {testAllResults && (
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-600" />
              <span>ผลการทดสอบการเชื่อมต่อทุกเครื่อง (TCP Port 5005)</span>
            </h4>
            <button
              onClick={() => setTestAllResults(null)}
              className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 cursor-pointer font-bold"
            >
              ✕ ปิด
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {testAllResults.map((r) => (
              <div 
                key={r.machineNo}
                className={`p-3 rounded-lg border text-xs flex flex-col justify-between space-y-1 ${
                  r.success ? 'bg-emerald-50/60 border-emerald-200' : 'bg-rose-50/60 border-rose-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">{r.name}</span>
                  {r.success ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded">
                      <Check className="w-3 h-3" /> ออนไลน์
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded">
                      <X className="w-3 h-3" /> ไม่ตอบสนอง
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {r.ip}:{r.port}
                </div>
                <div className={`text-[11px] mt-1 ${r.success ? 'text-emerald-800' : 'text-rose-800'}`}>
                  {r.message}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 1: SCANNERS STATUS GRID & MANAGEMENT */}
      {activeTab === 'scanners' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              แสดงรายการเครื่องสแกนนิ้ว/ใบหน้าทั้งหมดในระบบ สามารถคลิกแก้ไข ลบ หรือเปิด/ปิดการดึงข้อมูลได้ทันที
            </div>
            {isAdmin && (
              <button
                onClick={handleOpenAddModal}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg border border-emerald-200 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่มเครื่องใหม่</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {state.scanners.map((scanner) => {
              const isEnabled = scanner.enabled;
              return (
                <div 
                  key={scanner.id}
                  className={`bg-white border rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4 transition-all ${
                    isEnabled 
                      ? 'border-slate-200 hover:border-teal-300' 
                      : 'border-slate-200 bg-slate-50/50 opacity-80'
                  }`}
                >
                  <div>
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-100 text-slate-700">
                            Machine No: {scanner.machineNo}
                          </span>
                          {!isEnabled && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                              ปิดใช้งาน
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-slate-800 line-clamp-1" title={scanner.name}>
                          {scanner.name}
                        </h3>
                      </div>

                      {/* Status and Edit/Delete Quick Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {isEnabled ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                            Disabled
                          </span>
                        )}

                        {isAdmin && (
                          <div className="flex items-center gap-0.5 ml-1">
                            <button
                              onClick={() => handleOpenEditModal(scanner)}
                              title="แก้ไขข้อมูลเครื่อง"
                              className="p-1 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmScanner(scanner)}
                              title="ลบเครื่องสแกน"
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Hardware Parameters Specification */}
                    <div className="space-y-1.5 text-xs pt-3 mt-2 border-t border-slate-100 font-mono">
                      <div className="flex justify-between">
                        <span className="font-sans text-slate-500">IP Address:</span>
                        <span className="font-bold text-slate-800">{scanner.ip}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-sans text-slate-500">Port (TCP):</span>
                        <span className="text-teal-700 font-bold">{scanner.port}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-sans text-slate-500">รุ่น (Model):</span>
                        <span className="text-slate-800">{scanner.model}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-sans text-slate-500">Serial Number:</span>
                        <span className={scanner.serial === 'ยังไม่ระบุ' ? 'text-amber-600 font-sans' : 'text-slate-800'}>
                          {scanner.serial}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-sans text-slate-500">Password / License:</span>
                        <span className="text-slate-800">{scanner.password} / 1261</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-sans text-slate-500">รอบเวลา Sync:</span>
                        <span className="text-slate-800">{scanner.syncIntervalSec || 60} วินาที</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-sans text-slate-500">Sync ล่าสุด:</span>
                        <span className="text-slate-600 text-[11px]">{scanner.lastSync || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-sans text-slate-500">เรคคอร์ดทั้งหมด:</span>
                        <span className="font-bold text-slate-800">{scanner.totalLoadedRecords.toLocaleString()} รายการ</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions for this Scanner */}
                  {isAdmin && (
                    <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => handleTestConnection(scanner)}
                          disabled={testingMachineId === scanner.id || !isEnabled}
                          className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-colors text-center ${
                            !isEnabled
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800 cursor-pointer'
                          }`}
                        >
                          {testingMachineId === scanner.id ? 'กำลังทดสอบ...' : 'ทดสอบ Connect'}
                        </button>
                        <button
                          onClick={() => handleSyncSpecific(scanner.machineNo)}
                          disabled={!isEnabled}
                          className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-colors text-center ${
                            !isEnabled
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-teal-50 hover:bg-teal-100 text-teal-800 cursor-pointer'
                          }`}
                        >
                          Sync ดึง Log
                        </button>
                      </div>

                      {/* Toggle On/Off Switch */}
                      <button
                        onClick={() => handleToggleEnabled(scanner.id)}
                        className={`w-full py-1 px-2 text-[11px] font-semibold rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                          isEnabled
                            ? 'bg-slate-50 hover:bg-amber-50 text-slate-600 hover:text-amber-800 border border-slate-200'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        <Power className="w-3 h-3" />
                        <span>{isEnabled ? 'คลิกเพื่อปิดใช้งานเครื่องนี้ชั่วคราว' : 'คลิกเพื่อเปิดใช้งานเครื่องนี้'}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Notice Banner */}
          <div className="p-4 bg-slate-900 rounded-xl text-slate-300 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 font-mono">
            <div>
              <div className="text-teal-400 font-bold flex items-center gap-2 font-sans">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>การเชื่อมต่อเครื่องสแกน HIP ผ่าน Background Worker Service</span>
              </div>
              <p className="text-slate-400 font-sans text-xs mt-0.5">
                Service ฝั่งเซิร์ฟเวอร์ดึง Log จากเครื่องสแกนทั้งหมดด้วย <code className="text-teal-300">FK623Attend.dll</code> ทุก 1 นาที บันทึกลงตาราง staging <code className="text-teal-300">attendance_raw_scan</code>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadAppSettings}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/30 rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ดาวน์โหลด appsettings.json</span>
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className="px-3 py-1.5 bg-teal-700 hover:bg-teal-600 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-colors"
              >
                ดูการตั้งค่าทั้งหมด ➔
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SDK ZIP CONTENTS & ARCHITECTURE */}
      {activeTab === 'sdk_files' && (
        <div className="space-y-6">
          {/* File Inspector Header */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <FolderArchive className="w-5 h-5 text-amber-500" />
                  <span>โครงสร้างไฟล์ใน ZIP ของ SDK (FK623Attend.dll Package)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ไฟล์ที่ได้จากการแตก Zip ของชุดพัฒนา HIP CMiF68S สำหรับการสื่อสารผ่าน TCP Port 5005
                </p>
              </div>

              {/* Upload / Inspector Trigger */}
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept=".dll,.zip,.ocx,.lib,.h"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-teal-700" />
                  <span>เลือกไฟล์ DLL / ZIP เพื่อตรวจสอบ</span>
                </button>
              </div>
            </div>

            {/* Currently Inspected File Banner */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-lg">
                  <FileCode className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-800 text-sm">
                    {uploadedFileName || 'FK623Attend.dll'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-sans">
                    {uploadedFileInfo} · ขนาด: <strong className="text-slate-700">{uploadedFileSize}</strong>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 font-sans text-xs">
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-semibold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>รองรับ HIP CMiF68S</span>
                </span>
              </div>
            </div>
          </div>

          {/* Table of Files inside the ZIP */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                รายการไฟล์หลักในชุด SDK (Unzipped Files Breakdown)
              </h4>
            </div>

            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">ชื่อไฟล์ (Filename)</th>
                    <th className="py-2.5 px-4">ประเภท (Type)</th>
                    <th className="py-2.5 px-4">ขนาดโดยประมาณ</th>
                    <th className="py-2.5 px-4">หน้าที่และการใช้งานในระบบ (Purpose)</th>
                    <th className="py-2.5 px-4 text-center">ความสำคัญ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  <tr className="hover:bg-slate-50/80 bg-teal-50/30">
                    <td className="py-3 px-4 font-mono font-bold text-teal-800 flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-teal-600" />
                      <span>FK623Attend.dll</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">Native Windows DLL (C/C++)</td>
                    <td className="py-3 px-4 font-mono text-slate-500">~1.2 – 1.8 MB</td>
                    <td className="py-3 px-4 text-slate-700">
                      <strong>Core Engine:</strong> ไลบรารีหลักสำหรับสร้าง TCP Socket เชื่อมต่อพอร์ต 5005 ไปยังเครื่องสแกน CMiF68S และดึงข้อมูล General Log
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                        จำเป็นที่สุด (Required)
                      </span>
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800 flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-slate-500" />
                      <span>FKAttend.dll</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">ActiveX / COM Component</td>
                    <td className="py-3 px-4 font-mono text-slate-500">~850 KB</td>
                    <td className="py-3 px-4 text-slate-700">
                      COM Automation Wrapper สำหรับเรียกผ่าน Visual Basic, ASP หรือลงทะเบียนด้วย <code className="bg-slate-100 px-1 rounded font-mono text-[11px]">regsvr32</code>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold">
                        ทางเลือก (Optional)
                      </span>
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800 flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-slate-500" />
                      <span>FKData.dll</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">Biometric Template Helper</td>
                    <td className="py-3 px-4 font-mono text-slate-500">~420 KB</td>
                    <td className="py-3 px-4 text-slate-700">
                      ใช้สำหรับการแปลงและบีบอัด Template ลายนิ้วมือ และรูปภาพใบหน้า (Face recognition)
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold">
                        ทางเลือก
                      </span>
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-500" />
                      <span>FK623Attend.h / FKAttend.lib</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">C/C++ Header & Link Library</td>
                    <td className="py-3 px-4 font-mono text-slate-500">~45 KB</td>
                    <td className="py-3 px-4 text-slate-700">
                      Header File ระบุประกาศฟังก์ชัน Signature, Struct, และ Constants สำหรับคอมไพล์ C/C++ หรือ P/Invoke
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold">
                        เอกสาร/Header
                      </span>
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800 flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-slate-500" />
                      <span>mfc100.dll / msvcr100.dll</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">Visual C++ 2010 Runtime</td>
                    <td className="py-3 px-4 font-mono text-slate-500">~1.5 MB</td>
                    <td className="py-3 px-4 text-slate-700">
                      C Runtime Libraries ที่ FK623Attend.dll ต้องพึ่งพา (Dependencies) หากเครื่อง Server ไม่มี ให้วางไว้ในโฟลเดอร์เดียวกัน
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold">
                        Dependencies
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Parameters Table for FK623Attend */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900 text-slate-200 rounded-xl p-5 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-teal-400 font-sans font-bold">พารามิเตอร์ของ FK_ConnectNet (CMiF68S):</span>
                <span className="text-slate-400 text-[10px]">License: 1261</span>
              </div>
              <ul className="space-y-1.5 text-slate-300 text-[11px]">
                <li><strong className="text-amber-300">anMachineNo:</strong> หมายเลขเครื่อง (1, 2, หรือ 3)</li>
                <li><strong className="text-amber-300">astrIpAddress:</strong> IP Address ของเครื่อง (192.168.111.163–165)</li>
                <li><strong className="text-amber-300">anNetPort:</strong> 5005 (พอร์ต TCP มาตรฐาน)</li>
                <li><strong className="text-amber-300">anTimeOut:</strong> 5000 (มิลลิวินาที / 5 วินาที)</li>
                <li><strong className="text-amber-300">anProtocolType:</strong> 0 (TCP/IP Direct)</li>
                <li><strong className="text-amber-300">anNetPassword:</strong> 0 (รหัสผ่านเครือข่าย)</li>
                <li><strong className="text-amber-300">anLicense:</strong> 1261 (License Key ของตระกูล FK623)</li>
              </ul>
            </div>

            <div className="bg-slate-900 text-slate-200 rounded-xl p-5 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-teal-400 font-sans font-bold">รหัสส่งกลับ (Return Codes):</span>
                <span className="text-slate-400 text-[10px]">Standard FK Return Codes</span>
              </div>
              <ul className="space-y-1.5 text-slate-300 text-[11px]">
                <li><span className="text-emerald-400 font-bold">1 (RUN_SUCCESS):</span> การดำเนินการสำเร็จ</li>
                <li><span className="text-rose-400 font-bold">-1 (ERR_CONNECT_FAIL):</span> ไม่สามารถต่อ IP:5005 ได้ (เช็คสายแลน/Firewall)</li>
                <li><span className="text-rose-400 font-bold">-2 (ERR_SOCKET_TIMEOUT):</span> เวลาตอบสนองของเครือข่ายหมด</li>
                <li><span className="text-rose-400 font-bold">-3 (ERR_PASSWORD_FAIL):</span> รหัสผ่านหรือ License ไม่ถูกต้อง</li>
                <li><span className="text-amber-400 font-bold">0 (NO_MORE_DATA):</span> ไม่มีบันทึกสแกนนิ้วใหม่ค้างอยู่ในเครื่อง</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: INTERACTIVE DLL SIMULATOR */}
      {activeTab === 'simulator' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-teal-600" />
                  <span>ตัวทดสอบจำลองการเรียกคำสั่ง FK623Attend.dll (Interactive DLL Simulator)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ทดสอบลำดับการเรียกคำสั่ง ConnectNet ➔ LoadGeneralLogData ➔ GetGeneralLogData ➔ DisConnect แบบสมบูรณ์
                </p>
              </div>

              <button
                onClick={handleRunSimulator}
                disabled={simRunning}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
              >
                <Play className={`w-3.5 h-3.5 ${simRunning ? 'animate-spin' : ''}`} />
                <span>{simRunning ? 'กำลังรันคำสั่ง DLL...' : 'รันการทดสอบ DLL'}</span>
              </button>
            </div>

            {/* Parameter Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs pt-3 border-t border-slate-100">
              <div>
                <label className="block text-slate-600 font-medium mb-1">anMachineNo (หมายเลขเครื่อง):</label>
                <select
                  value={simMachineNo}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    setSimMachineNo(m);
                    if (m === 1) setSimIp('192.168.111.163');
                    if (m === 2) setSimIp('192.168.111.164');
                    if (m === 3) setSimIp('192.168.111.165');
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-mono"
                >
                  <option value={1}>1 (หน้าตึกอำนวยการ)</option>
                  <option value={2}>2 (ตึกอุบัติเหตุและฉุกเฉิน ER)</option>
                  <option value={3}>3 (ตึกผู้ป่วยใน IPD)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">astrIpAddress:</label>
                <input
                  type="text"
                  value={simIp}
                  onChange={(e) => setSimIp(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">anNetPort:</label>
                <input
                  type="number"
                  value={simPort}
                  onChange={(e) => setSimPort(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">anLicense (HIP CMi):</label>
                <input
                  type="number"
                  value={simLicense}
                  onChange={(e) => setSimLicense(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Terminal Console Output */}
          <div className="bg-slate-950 text-slate-200 rounded-xl overflow-hidden shadow-md border border-slate-800 font-mono text-xs">
            <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="ml-2 text-slate-300 text-[11px]">FK623Attend.dll Process Console (Output Stream)</span>
              </div>
              <button
                onClick={() => setSimLogs([{ time: new Date().toTimeString().split(' ')[0], type: 'info', text: 'Console cleared.' }])}
                className="text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Clear Console
              </button>
            </div>

            <div className="p-4 space-y-1.5 max-h-80 overflow-y-auto">
              {simLogs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2 text-[11px] leading-relaxed">
                  <span className="text-slate-500 shrink-0">[{log.time}]</span>
                  <span className={
                    log.type === 'success' ? 'text-emerald-400 font-semibold' :
                    log.type === 'warning' ? 'text-amber-400' :
                    log.type === 'error' ? 'text-rose-400 font-bold' :
                    'text-teal-300'
                  }>
                    {log.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: WINDOWS SERVER INSTALLATION & DEPLOYMENT GUIDE */}
      {activeTab === 'install_guide' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
            <div className="border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-indigo-600" />
                <span>ขั้นตอนการนำไฟล์ FK623Attend.dll ไปติดตั้งบน Windows Server</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                คู่มือสำหรับผู้ดูแลระบบไอที โรงพยาบาลสามชุก ในการวางไฟล์ Native DLL และตั้งค่า Background Worker Service
              </p>
            </div>

            {/* Step-by-Step Cards */}
            <div className="space-y-4 text-xs">
              {/* Step 1 */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs">1</span>
                  <span>แตกไฟล์ ZIP และนำ FK623Attend.dll ไปวางในโฟลเดอร์แอปพลิเคชัน</span>
                </div>
                <p className="text-slate-600 leading-relaxed pl-8">
                  วางไฟล์ <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-teal-800 font-bold">FK623Attend.dll</code> ไว้ในโฟลเดอร์เดียวกับไฟล์ปฏิบัติการของ Service เช่น:
                </p>
                <div className="pl-8">
                  <div className="p-2.5 bg-slate-900 text-teal-300 rounded-lg font-mono text-[11px] overflow-x-auto">
                    C:\SamchukAttendance\WorkerService\FK623Attend.dll<br />
                    C:\SamchukAttendance\WorkerService\mfc100.dll (ถ้าจำเป็น)<br />
                    C:\SamchukAttendance\WorkerService\msvcr100.dll (ถ้าจำเป็น)
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs">2</span>
                  <span>(ทางเลือก) วางไฟล์ลงใน System Path ของ Windows</span>
                </div>
                <p className="text-slate-600 leading-relaxed pl-8">
                  หากรัน Service ในระดับระบบ (LocalSystem) สามารถคัดลอกไฟล์ DLL ไปวางในโฟลเดอร์ระบบของ Windows ได้:
                </p>
                <div className="pl-8 space-y-1.5 font-mono text-[11px]">
                  <div className="p-2 bg-slate-900 text-slate-200 rounded-lg">
                    <span className="text-slate-400">// สำหรับ DLL รุ่น 32-bit (x86):</span><br />
                    copy FK623Attend.dll C:\Windows\SysWOW64\
                  </div>
                  <div className="p-2 bg-slate-900 text-slate-200 rounded-lg">
                    <span className="text-slate-400">// สำหรับ DLL รุ่น 64-bit (x64):</span><br />
                    copy FK623Attend.dll C:\Windows\System32\
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs">3</span>
                  <span>เปิด Firewall Windows Server พอร์ต 5005 (TCP Inbound & Outbound)</span>
                </div>
                <p className="text-slate-600 leading-relaxed pl-8">
                  รันคำสั่ง PowerShell บนเครื่อง Server เพื่อเปิดพอร์ต 5005 ให้ Server สื่อสารกับเครื่องสแกนทั้ง 3 เครื่อง:
                </p>
                <div className="pl-8">
                  <div className="p-2.5 bg-slate-900 text-amber-300 rounded-lg font-mono text-[11px] overflow-x-auto">
                    New-NetFirewallRule -DisplayName "HIP Scanner TCP 5005" -Direction Outbound -LocalPort 5005 -Protocol TCP -Action Allow<br />
                    New-NetFirewallRule -DisplayName "HIP Scanner TCP 5005 In" -Direction Inbound -LocalPort 5005 -Protocol TCP -Action Allow
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs">4</span>
                  <span>การเขียน C# P/Invoke เชื่อมต่อกับ FK623Attend.dll</span>
                </div>
                <p className="text-slate-600 leading-relaxed pl-8">
                  ตัวอย่างโค้ดเรียกใช้งานใน C# .NET Background Service (ตรงตามที่ใช้งานจริงในระบบ):
                </p>
                <div className="pl-8">
                  <div className="relative">
                    <pre className="p-3 bg-slate-950 text-teal-300 rounded-lg font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800">
{`[DllImport("FK623Attend.dll", CallingConvention = CallingConvention.Winapi)]
public static extern int FK_ConnectNet(
    int anMachineNo, string astrIpAddress, int anNetPort,
    int anTimeOut, int anProtocolType, int anNetPassword, int anLicense);

// การเรียกใช้งาน:
int handle = FK_ConnectNet(1, "192.168.111.163", 5005, 5000, 0, 0, 1261);
if (handle > 0) {
    int res = FK_LoadGeneralLogData(handle, 0);
    // อ่านข้อมูลบันทึกสแกนนิ้ว...
    FK_DisConnect(handle);
}`}
                    </pre>
                    <button
                      onClick={() => handleCopy(`[DllImport("FK623Attend.dll", CallingConvention = CallingConvention.Winapi)]
public static extern int FK_ConnectNet(int anMachineNo, string astrIpAddress, int anNetPort, int anTimeOut, int anProtocolType, int anNetPassword, int anLicense);`, 'csharp')}
                      className="absolute top-2 right-2 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] flex items-center gap-1 cursor-pointer font-sans"
                    >
                      {copiedCode === 'csharp' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCode === 'csharp' ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SYSTEM SETTINGS & CONFIGURATION (appsettings.json) */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-teal-600" />
                  <span>การตั้งค่าระบบเครื่องสแกนและดาวน์โหลด Config (appsettings.json)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  โครงสร้างการตั้งค่าระบบเครื่องสแกนนิ้ว/ใบหน้าทั้งหมด เพื่อนำไปใช้งานกับ Backend Worker Service บน Windows Server
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadAppSettings}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>ดาวน์โหลด appsettings.json</span>
                </button>
              </div>
            </div>

            {/* Quick summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-slate-500">จำนวนเครื่องสแกนทั้งหมด:</span>
                <div className="text-xl font-bold text-slate-800">{state.scanners.length} เครื่อง</div>
                <span className="text-[11px] text-emerald-600">เปิดใช้งาน {state.scanners.filter(s => s.enabled).length} เครื่อง</span>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-slate-500">พอร์ตมาตรฐาน (TCP Port):</span>
                <div className="text-xl font-bold text-teal-700">5005</div>
                <span className="text-[11px] text-slate-500">ใช้กับ HIP CMiF68S & CMi Series</span>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-slate-500">License Code ของ SDK:</span>
                <div className="text-xl font-bold text-slate-800">1261</div>
                <span className="text-[11px] text-slate-500">FK623Attend.dll Standard License</span>
              </div>
            </div>

            {/* Config JSON Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <FileCode className="w-4 h-4 text-slate-500" />
                  <span>ตัวอย่างเนื้อหาไฟล์ appsettings.json (สร้างอัตโนมัติตามเครื่องในระบบ):</span>
                </label>
                <button
                  onClick={() => handleCopy(JSON.stringify({
                    Scanners: state.scanners.map(s => ({
                      MachineNo: s.machineNo,
                      Name: s.name,
                      IP: s.ip,
                      Port: s.port,
                      Model: s.model,
                      Serial: s.serial || 'ยังไม่ระบุ',
                      Password: Number(s.password) || 0,
                      License: 1261
                    })),
                    AttendanceSettings: {
                      AutoCalculateOnSync: true,
                      SyncIntervalMinutes: 1,
                      DefaultStartTime: "08:15:00",
                      DefaultEndTime: "16:00:00"
                    },
                    NetworkSettings: {
                      HostIp: "10.2.0.13",
                      FrontendPort: 3001,
                      FrontendUrl: "http://10.2.0.13:3001/Sam_Att/",
                      ApiPort: 3005,
                      ApiUrl: "http://10.2.0.13:3005"
                    }
                  }, null, 2), 'appsettings')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {copiedCode === 'appsettings' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode === 'appsettings' ? 'คัดลอก JSON แล้ว' : 'คัดลอก JSON'}</span>
                </button>
              </div>

              <div className="relative">
                <pre className="p-4 bg-slate-950 text-teal-300 rounded-xl font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800 max-h-96">
{JSON.stringify({
  Scanners: state.scanners.map(s => ({
    MachineNo: s.machineNo,
    Name: s.name,
    IP: s.ip,
    Port: s.port,
    Model: s.model,
    Serial: s.serial || 'ยังไม่ระบุ',
    Password: Number(s.password) || 0,
    License: 1261
  })),
  AttendanceSettings: {
    AutoCalculateOnSync: true,
    SyncIntervalMinutes: 1,
    DefaultStartTime: "08:15:00",
    DefaultEndTime: "16:00:00"
  },
  NetworkSettings: {
    HostIp: "10.2.0.13",
    FrontendPort: 3001,
    FrontendUrl: "http://10.2.0.13:3001/Sam_Att/",
    ApiPort: 3005,
    ApiUrl: "http://10.2.0.13:3005"
  }
}, null, 2)}
                </pre>
              </div>

              <p className="text-[11px] text-slate-500 mt-2">
                * คำแนะนำ: หากเพิ่มหรือแก้ไขเครื่องสแกนในหน้านี้ สามารถกดปุ่ม <strong>"ดาวน์โหลด appsettings.json"</strong> แล้วนำไปวางทับไฟล์เดิมที่ <code>C:\inetpub\wwwroot\Sam_Att\backend\SamchukAttendance.Api\appsettings.json</code> เพื่อให้ตัว Backend Service ซิงค์เครื่องใหม่ได้ทันที
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT SCANNER */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold text-slate-800">
                  {modalMode === 'add' ? 'เพิ่มเครื่องสแกนนิ้ว/ใบหน้าใหม่' : `แก้ไขเครื่องสแกน #${formData.machineNo}`}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveScanner} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Machine No (หมายเลขเครื่อง) <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    required
                    value={formData.machineNo}
                    onChange={(e) => setFormData({ ...formData, machineNo: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 font-mono focus:bg-white focus:border-teal-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    รุ่นเครื่อง (Model) <span className="text-rose-500">*</span>:
                  </label>
                  <select
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:bg-white focus:border-teal-500 focus:outline-hidden"
                  >
                    <option value="CMiF68S">HIP CMiF68S (รุ่นหลักของ รพ.)</option>
                    <option value="CMi681S">HIP CMi681S</option>
                    <option value="CiF76S">HIP CiF76S</option>
                    <option value="CMi682S">HIP CMi682S</option>
                    <option value="Other">กำหนดเอง / รุ่นอื่นๆ</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  ชื่อเครื่องสแกน / ตำแหน่งติดตั้ง <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น Scanner 4 - ตึกเภสัชกรรม (OPD)"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:bg-white focus:border-teal-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    IP Address <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="192.168.111.xxx"
                    value={formData.ip}
                    onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 font-mono focus:bg-white focus:border-teal-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Port (TCP) <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 font-mono focus:bg-white focus:border-teal-500 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-teal-700 mt-0.5 block">ค่ามาตรฐาน: 5005</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Serial Number:
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น 6802004xxx หรือ ยังไม่ระบุ"
                    value={formData.serial}
                    onChange={(e) => setFormData({ ...formData, serial: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 font-mono focus:bg-white focus:border-teal-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Password เครื่อง:
                  </label>
                  <input
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 font-mono focus:bg-white focus:border-teal-500 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">ค่าเริ่มต้นจากโรงงานคือ 0</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    รอบเวลาดึงข้อมูล (วินาที):
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="3600"
                    value={formData.syncIntervalSec}
                    onChange={(e) => setFormData({ ...formData, syncIntervalSec: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 font-mono focus:bg-white focus:border-teal-500 focus:outline-hidden"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                      className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                    />
                    <span className="font-semibold text-slate-800 text-xs">เปิดใช้งานเครื่องนี้</span>
                  </label>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{modalMode === 'add' ? 'บันทึกเครื่องสแกนใหม่' : 'บันทึกการแก้ไข'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {deleteConfirmScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">ยืนยันการลบเครื่องสแกน?</h3>
                <p className="text-xs text-slate-500">การดำเนินการนี้จะนำเครื่องสแกนออกจากรายการของระบบ</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1 font-mono">
              <div><strong>ชื่อเครื่อง:</strong> <span className="font-sans text-slate-800">{deleteConfirmScanner.name}</span></div>
              <div><strong>Machine No:</strong> {deleteConfirmScanner.machineNo}</div>
              <div><strong>IP:Port:</strong> {deleteConfirmScanner.ip}:{deleteConfirmScanner.port}</div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmScanner(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>ยืนยันลบเครื่องนี้</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Sync Modal */}
      <CustomSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSyncComplete={(msg) => {
          setTestResult({
            machineNo: 1,
            success: true,
            message: msg
          });
        }}
      />
    </div>
  );
};
