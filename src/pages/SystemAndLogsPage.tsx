import React, { useState } from 'react';
import { 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Sparkles, 
  Send
} from 'lucide-react';
import { StoreState, attendanceStore } from '../services/attendanceStore';
import { apiClient } from '../services/apiClient';

interface SystemAndLogsPageProps {
  state: StoreState;
}

export const SystemAndLogsPage: React.FC<SystemAndLogsPageProps> = ({ state }) => {
  const [activeTab, setActiveTab] = useState<'database' | 'sync' | 'audit'>('database');

  // =========================================================================
  // Dual Database Testing State
  // =========================================================================
  const [isTestingBoth, setIsTestingBoth] = useState(false);
  const [bothDbResult, setBothDbResult] = useState<any>(null);

  const [isTestingAtt, setIsTestingAtt] = useState(false);
  const [attDbResult, setAttDbResult] = useState<any>(null);

  const [isTestingHos, setIsTestingHos] = useState(false);
  const [hosDbResult, setHosDbResult] = useState<any>(null);

  const [dbActionMsg, setDbActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPurgingStorage, setIsPurgingStorage] = useState(false);
  const [purgeStatus, setPurgeStatus] = useState<string | null>(null);

  const [isPushingHosTest, setIsPushingHosTest] = useState(false);
  const [hosTestPushResult, setHosTestPushResult] = useState<any>(null);

  // Handlers for Dual Database Testing
  const handleTestBothDatabases = async () => {
    setIsTestingBoth(true);
    setDbActionMsg(null);
    try {
      const res = await apiClient.testBothDatabases();
      setBothDbResult(res);
      if (res.success) {
        setDbActionMsg({
          type: 'success',
          text: `เชื่อมต่อสมบูรณ์ทั้ง 2 ฐานข้อมูล! (samchuk_attendance: ${res.attendance?.latencyMs ?? 0}ms, hosoffice: ${res.hosoffice?.latencyMs ?? 0}ms)`
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
          text: `เชื่อมต่อฐานข้อมูล samchuk_attendance @ ${res.host || 'MySQL'} สำเร็จ (${res.latencyMs || 0}ms)`
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
          text: `เชื่อมต่อฐานข้อมูล hosoffice @ ${res.host || 'MySQL'} สำเร็จ (${res.latencyMs || 0}ms)`
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
        setDbActionMsg({ type: 'success', text: res.message || 'ส่งข้อมูลทดสอบสำเร็จ' });
      } else {
        setDbActionMsg({ type: 'error', text: res.message || 'ส่งข้อมูลทดสอบไม่สำเร็จ' });
      }
    } catch (err) {
      setDbActionMsg({ type: 'error', text: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Failed'}` });
    } finally {
      setIsPushingHosTest(false);
    }
  };

  const handlePurgeLocalStorage = async () => {
    if (!window.confirm('คุณต้องการล้าง LocalStorage เพื่อบังคับให้ระบบโหลดข้อมูลตรงจากฐานข้อมูล MySQL 10.2.0.201 เท่านั้นใช่หรือไม่?')) return;
    setIsPurgingStorage(true);
    try {
      attendanceStore.purgeLocalStorageCacheOnly();
      setPurgeStatus('ล้าง LocalStorage เรียบร้อยแล้ว ระบบกำลังใช้ข้อมูลจริงจาก MySQL 10.2.0.201 100%');
      setTimeout(() => setPurgeStatus(null), 5000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsPurgingStorage(false);
    }
  };

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

                {/* Error diagnostics */}
                {attDbResult && !attDbResult.success && (
                  <div className="mt-2 p-2 rounded bg-red-50 border border-red-200 text-red-800 text-[11px] font-sans space-y-1">
                    <div className="font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      <span>{attDbResult.message}</span>
                    </div>
                    {attDbResult.help && <div className="text-slate-600 pl-4">{attDbResult.help}</div>}
                  </div>
                )}

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
                      <span className="text-slate-600">ประเภทบุคลากร & กะ (attendance_personnel_type_shift):</span>
                      <span className="font-bold text-slate-800">{attDbResult.tables.personnelTypes ?? 5} รายการ</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions for DB 1 */}
              <div className="pt-1">
                <button
                  onClick={handleTestAttendanceDb}
                  disabled={isTestingAtt}
                  className="w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingAtt ? 'animate-spin' : ''}`} />
                  <span>ทดสอบเชื่อมต่อ samchuk_attendance</span>
                </button>
              </div>
            </div>

            {/* Card 2: hosoffice */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <Database className="w-5 h-5" />
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

                {/* Error diagnostics */}
                {hosDbResult && !hosDbResult.success && (
                  <div className="mt-2 p-2 rounded bg-red-50 border border-red-200 text-red-800 text-[11px] font-sans space-y-1">
                    <div className="font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      <span>{hosDbResult.message}</span>
                    </div>
                    {hosDbResult.help && <div className="text-slate-600 pl-4">{hosDbResult.help}</div>}
                  </div>
                )}

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
                    <td className="py-2 px-3 font-bold text-slate-800">{a.user}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {a.action}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-700">{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
