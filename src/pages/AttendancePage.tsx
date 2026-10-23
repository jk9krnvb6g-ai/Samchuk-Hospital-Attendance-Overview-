import React, { useState, useMemo, useEffect } from 'react';
import { 
  CheckCircle2, 
  Calendar, 
  Search, 
  RefreshCw, 
  AlertCircle, 
  Clock, 
  Check, 
  Database,
  Download,
  Printer,
  FileSpreadsheet,
  Filter,
  UserCheck,
  TrendingUp,
  AlertTriangle,
  Sparkles
} from 'lucide-react';
import { StoreState, attendanceStore } from '../services/attendanceStore';
import { DailyResult } from '../types/attendance';

interface AttendancePageProps {
  state: StoreState;
}

export const AttendancePage: React.FC<AttendancePageProps> = ({ state }) => {
  const isAdmin = state.currentUser.role === 'ADMIN';

  // Selected date (default 2026-10-14)
  const [selectedDate, setSelectedDate] = useState('2026-10-14');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [shiftFilter, setShiftFilter] = useState<'ALL' | 'MORNING' | 'AFTERNOON' | 'NIGHT'>('ALL');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [saveDbMsg, setSaveDbMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSavingDb, setIsSavingDb] = useState(false);

  // Load results from MySQL when date changes
  useEffect(() => {
    attendanceStore.loadDailyAttendanceFromDb(selectedDate);
  }, [selectedDate]);

  // Calculate daily attendance safely inside useMemo
  const results: DailyResult[] = useMemo(() => {
    // หากไม่มีทั้งข้อมูลบุคลากรและไม่มีสแกนดิบในระบบ จะต้องเป็น 0 รายการ
    if ((!state.personnel || state.personnel.length === 0) && (!state.rawScans || state.rawScans.length === 0)) {
      return [];
    }
    return attendanceStore.getDailyAttendance(selectedDate);
  }, [selectedDate, state.rawScans, state.personnel, state.personnelTypes, state.shifts]);

  // Shift counts for badges
  const morningCount = useMemo(() => results.filter(r => (r.shiftName || '').includes('เช้า')).length, [results]);
  const afternoonCount = useMemo(() => results.filter(r => (r.shiftName || '').includes('บ่าย')).length, [results]);
  const nightCount = useMemo(() => results.filter(r => (r.shiftName || '').includes('ดึก')).length, [results]);

  // Personnel Types list for filter
  const personnelTypesList = useMemo(() => {
    const fromTypes = (state.personnelTypes || []).map(t => t.name);
    const fromResults = results.map(r => r.personnelTypeName).filter(Boolean) as string[];
    return Array.from(new Set([...fromTypes, ...fromResults]));
  }, [state.personnelTypes, results]);

  // Departments list for filter
  const departments = useMemo(() => {
    return Array.from(new Set(state.personnel.map(p => p.hrDepName)));
  }, [state.personnel]);

  // Filtered results
  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      // ตัวกรองกะ (Shift filter)
      if (shiftFilter !== 'ALL') {
        const sName = r.shiftName || '';
        if (shiftFilter === 'MORNING' && !sName.includes('เช้า')) return false;
        if (shiftFilter === 'AFTERNOON' && !sName.includes('บ่าย')) return false;
        if (shiftFilter === 'NIGHT' && !sName.includes('ดึก')) return false;
      }
      if (selectedType !== 'ALL' && (r.personnelTypeName || '') !== selectedType) return false;
      if (selectedDept !== 'ALL' && r.department !== selectedDept) return false;
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'LATE') {
          if (r.status !== 'LATE' && r.status !== 'LATE_AND_EARLY') return false;
        } else if (statusFilter === 'ON_TIME') {
          if (r.status !== 'ON_TIME') return false;
        } else if (r.status !== statusFilter) {
          return false;
        }
      }
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchName = r.fullname.toLowerCase().includes(q);
        const matchFingle = r.fingleId.toString().includes(q);
        const matchPos = r.position.toLowerCase().includes(q);
        const matchType = (r.personnelTypeName || '').toLowerCase().includes(q);
        if (!matchName && !matchFingle && !matchPos && !matchType) return false;
      }
      return true;
    });
  }, [results, shiftFilter, selectedType, selectedDept, statusFilter, searchTerm]);

  // Summary counts
  const totalCount = results.length;
  const presentCount = results.filter(r => r.status !== 'NO_SCAN').length;
  const onTimeCount = results.filter(r => r.status === 'ON_TIME').length;
  const lateCount = results.filter(r => r.status === 'LATE' || r.status === 'LATE_AND_EARLY').length;
  const noScanCount = results.filter(r => r.status === 'NO_SCAN').length;
  const inOnlyCount = results.filter(r => r.status === 'IN_ONLY').length;

  // On-time percentage calculation
  const onTimeRate = presentCount > 0 ? Math.round((onTimeCount / presentCount) * 100) : 0;
  const lateMinutesTotal = results.reduce((acc, r) => acc + (r.lateMinutes || 0), 0);
  const avgLateMinutes = lateCount > 0 ? Math.round(lateMinutesTotal / lateCount) : 0;

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    setSaveDbMsg(null);
    try {
      await attendanceStore.recalculateDailyAttendance(selectedDate);
      setIsRecalculating(false);
      setSaveDbMsg({ type: 'success', text: 'คำนวณผลเวลาใหม่และบันทึกลง MySQL สำเร็จ' });
    } catch (e: any) {
      setIsRecalculating(false);
      setSaveDbMsg({ type: 'error', text: `ประมวลผลไม่สำเร็จ: ${e.message}` });
    }
  };

  const handleSaveToMySQL = async () => {
    setIsSavingDb(true);
    setSaveDbMsg(null);
    try {
      const res = await attendanceStore.saveDailyResultsToMySql(selectedDate);
      if (res.success) {
        setSaveDbMsg({ type: 'success', text: res.message || 'บันทึกลง MySQL เรียบร้อย' });
      } else {
        setSaveDbMsg({ type: 'error', text: res.message || 'บันทึกลง MySQL ไม่สำเร็จ' });
      }
    } catch (e: any) {
      setSaveDbMsg({ type: 'error', text: `บันทึกไม่สำเร็จ: ${e.message}` });
    } finally {
      setIsSavingDb(false);
    }
  };

  // Export CSV for Executive Report
  const handleExportCsv = () => {
    const headers = ['วันที่,FINGLE_ID,ชื่อ-สกุล,ตำแหน่ง,กลุ่มงาน,ประเภทบุคลากร,กะ,เวลาที่กำหนด,เวลาเข้างาน,เวลาออกงาน,สถานะ,สาย(นาที),จำนวนสแกน'];
    const rows = filteredResults.map(r => {
      const statusText = r.status === 'ON_TIME' ? 'ตรงเวลา' :
                         r.status === 'LATE' ? `สาย ${r.lateMinutes} นาที` :
                         r.status === 'IN_ONLY' ? 'รอสแกนออก' : 'ไม่พบสแกน';
      return `"${r.workDate}","${r.fingleId}","${r.fullname}","${r.position}","${r.department}","${r.personnelTypeName || '-'}","${r.shiftName || '-'}","${r.plannedStartTime || '-'} - ${r.plannedEndTime || '-'}","${r.inTime || '-'}","${r.outTime || '-'}","${statusText}",${r.lateMinutes},${r.scansCount}`;
    });
    const blob = new Blob(["\uFEFF" + [headers, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `รายงานเวลาปฏิบัติงาน_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12 print:p-0">
      {/* Executive Command Strip (Top Bar) */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-500">
            <span className="font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/70">
              EXECUTIVE AUDIT
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-500">รพ.สามชุก จ.สุพรรณบุรี</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-400">attendance_daily_result</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-teal-700" />
            รายงานสรุปเวลาปฏิบัติงานผู้บริหาร
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ตรวจเวลาสแกนจริงเปรียบเทียบตามประเภทบุคลากร สรุปจำนวนสายและเวลาเข้า-ออกจริง
          </p>
        </div>

        {/* Date Selector & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Date Selector */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300/90 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-teal-700" />
            <span className="text-slate-600 font-medium">วันที่:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="font-mono text-slate-900 bg-transparent focus:outline-none cursor-pointer text-xs"
            />
          </div>

          {/* Export Report Action (Solid Matte) */}
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 shadow-2xs cursor-pointer transition-all duration-150"
            title="ส่งออกรายงานสรุปเป็นไฟล์ Excel (.csv)"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>ส่งออกรายงาน</span>
          </button>

          {/* Print Report */}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 shadow-2xs cursor-pointer transition-all duration-150 print:hidden"
            title="พิมพ์รายงานสรุป"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>พิมพ์</span>
          </button>

          {isAdmin && (
            <>
              {/* Recalculate (Matte Teal) */}
              <button
                onClick={handleRecalculate}
                disabled={isRecalculating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white text-xs font-semibold rounded-lg shadow-2xs cursor-pointer disabled:opacity-50 transition-all duration-150"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
                <span>{isRecalculating ? 'กำลังคำนวณ...' : 'คำนวณใหม่'}</span>
              </button>

              {/* Seed Scans Demo Button */}
              <button
                onClick={async () => {
                  setIsRecalculating(true);
                  try {
                    const res = await attendanceStore.seedRealisticMonthScans(selectedDate.substring(0, 7), 14);
                    setSaveDbMsg({ type: res.success ? 'success' : 'error', text: res.message });
                  } catch (e: any) {
                    setSaveDbMsg({ type: 'error', text: e.message });
                  } finally {
                    setIsRecalculating(false);
                  }
                }}
                disabled={isRecalculating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 text-xs font-bold rounded-lg shadow-2xs cursor-pointer disabled:opacity-50 transition-all duration-150"
                title="สร้างข้อมูลสแกนตัวอย่างทั้งโรงพยาบาล (ปกติ/สาย) และคำนวณทันที"
              >
                <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                <span>🧪 สร้างสแกน (ปกติ/สาย)</span>
              </button>

              {/* Clear Daily Attendance (Red/Rose) */}
              <button
                onClick={async () => {
                  if (confirm('คุณต้องการล้างข้อมูลผลการคำนวณในตาราง attendance_daily_result ของ samchuk_attendance หรือไม่?')) {
                    setIsRecalculating(true);
                    try {
                      const res = await attendanceStore.clearDailyAttendanceFromMySql();
                      setSaveDbMsg({ type: res.success ? 'success' : 'error', text: res.message });
                    } catch (e: any) {
                      setSaveDbMsg({ type: 'error', text: e.message });
                    } finally {
                      setIsRecalculating(false);
                    }
                  }
                }}
                disabled={isRecalculating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-semibold rounded-lg shadow-2xs cursor-pointer disabled:opacity-50 transition-all duration-150"
                title="ล้างข้อมูลผลการคำนวณในตาราง attendance_daily_result ให้ว่างเปล่า"
              >
                <span>ล้างผลในตาราง DB</span>
              </button>

              {/* Save MySQL (Matte Slate) */}
              <button
                onClick={handleSaveToMySQL}
                disabled={isSavingDb}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white text-xs font-semibold rounded-lg shadow-2xs cursor-pointer disabled:opacity-50 transition-all duration-150"
                title="บันทึกผลการคำนวณสถานะ ปกติ/สาย ลงตาราง attendance_daily_result ใน MySQL"
              >
                <Database className="w-3.5 h-3.5 text-teal-400" />
                <span>{isSavingDb ? 'กำลังบันทึก...' : 'บันทึกลง MySQL'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Empty Database Banner */}
      {state.personnel.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center shadow-xs">
          <div className="w-10 h-10 bg-amber-100 text-amber-800 rounded-full flex items-center justify-center mx-auto mb-2.5">
            <Database className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-amber-950">
            ฐานข้อมูล samchuk_attendance ว่างเปล่า (ไม่มีข้อมูลบุคลากรในตาราง attendance_personnel)
          </h3>
          <p className="text-xs text-amber-800 mt-1 max-w-lg mx-auto leading-relaxed">
            ระบบทำงานตรงกับฐานข้อมูล <code>samchuk_attendance</code> อย่างแท้จริง เมื่อลบข้อมูลในตารางออกหมด รายงานสรุปเวลาสำหรับผู้บริหารจะแสดง 0 รายการทันที<br />
            คุณสามารถสั่งดึงข้อมูลรายชื่อจากฐาน HOSOffice ได้ที่เมนู <strong>"ข้อมูลบุคลากร HR"</strong>
          </p>
        </div>
      )}

      {/* Action Notification Toast */}
      {saveDbMsg && (
        <div className={`p-3 rounded-lg text-xs flex items-center justify-between border transition-all ${
          saveDbMsg.type === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-rose-50 text-rose-900 border-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{saveDbMsg.text}</span>
          </div>
          <button onClick={() => setSaveDbMsg(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
        </div>
      )}

      {/* Quick Stats Grid with On-Time Rate Visual Meter */}
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* On-Time Rate Mini Meter */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">อัตราตรงเวลา (On-time Rate)</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
              {onTimeRate}%
            </span>
            <span className="text-[11px] text-slate-500">
              ({onTimeCount}/{presentCount} คน)
            </span>
          </div>
          {/* Progress Mini Bar */}
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                onTimeRate >= 85 ? 'bg-emerald-500' : onTimeRate >= 70 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, onTimeRate)}%` }}
            ></div>
          </div>
        </div>

        {/* Total & Present Staff */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">บุคลากรทั้งหมด</span>
            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
            {totalCount} <span className="text-xs font-normal text-slate-400">คน</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            มาสแกน <strong className="text-slate-800 font-mono">{presentCount}</strong> คน ({totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0}%)
          </div>
        </div>

        {/* Late Count (Amber Accent) */}
        <div className="bg-white p-3.5 rounded-xl border border-amber-300/80 bg-amber-500/[0.02] shadow-xs">
          <div className="flex items-center justify-between text-xs text-amber-900 font-bold">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              มาสาย (Late)
            </span>
            <span className="text-[10px] font-mono text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded font-semibold">
              เฉลี่ย {avgLateMinutes} น.
            </span>
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tracking-tight text-amber-950 tabular-nums">
            {lateCount} <span className="text-xs font-normal text-slate-500">คน</span>
          </div>
          <div className="text-[11px] text-amber-800/90 mt-1">
            สแกนเข้าเกินเวลากะตามประเภท
          </div>
        </div>

        {/* On-Time Staff (Emerald Accent) */}
        <div className="bg-white p-3.5 rounded-xl border border-emerald-300/80 bg-emerald-500/[0.02] shadow-xs">
          <div className="flex items-center justify-between text-xs text-emerald-900 font-bold">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              ตรงเวลา (On Time)
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tracking-tight text-emerald-950 tabular-nums">
            {onTimeCount} <span className="text-xs font-normal text-slate-500">คน</span>
          </div>
          <div className="text-[11px] text-emerald-800/90 mt-1">
            สแกนเข้าทันเกณฑ์เวลา (≤ 08:15 น.)
          </div>
        </div>

        {/* No Scan */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs hidden lg:block">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">ยังไม่พบสแกน</span>
            <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tracking-tight text-slate-600 tabular-nums">
            {noScanCount} <span className="text-xs font-normal text-slate-400">คน</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            วันหยุด / ลา / ไม่ได้ลงเวลา
          </div>
        </div>
      </div>

      {/* Quick-Pill Segmented Filter Bar */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-xs space-y-3">
        {/* Row 1: Status Quick-Pills + Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          {/* Status Quick Pills */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-md font-medium cursor-pointer transition-all duration-150 ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ทั้งหมด ({results.length})
            </button>
            <button
              onClick={() => setStatusFilter('LATE')}
              className={`px-3 py-1 rounded-md font-medium cursor-pointer transition-all duration-150 flex items-center gap-1.5 ${
                statusFilter === 'LATE'
                  ? 'bg-white text-amber-900 shadow-2xs font-bold ring-1 ring-amber-300'
                  : 'text-amber-800 hover:text-amber-950'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              <span>มาสาย ({lateCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('ON_TIME')}
              className={`px-3 py-1 rounded-md font-medium cursor-pointer transition-all duration-150 flex items-center gap-1.5 ${
                statusFilter === 'ON_TIME'
                  ? 'bg-white text-emerald-900 shadow-2xs font-bold ring-1 ring-emerald-300'
                  : 'text-emerald-800 hover:text-emerald-950'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>ปกติ / ตรงเวลา ({onTimeCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('NO_SCAN')}
              className={`px-3 py-1 rounded-md font-medium cursor-pointer transition-all duration-150 ${
                statusFilter === 'NO_SCAN'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ไม่พบสแกน / ขาดสแกน ({noScanCount})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="ค้นหาชื่อ, ตำแหน่ง, รหัสสแกน..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Row 1.5: Shift Quick-Pills (ติวเตอร์ปุ่ม / ตัวกรองกะ) */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1 mr-1">
              <Clock className="w-3.5 h-3.5 text-teal-600" />
              <span>กะการทำงาน:</span>
            </span>

            <button
              type="button"
              onClick={() => setShiftFilter('ALL')}
              className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-all duration-150 flex items-center gap-1.5 border ${
                shiftFilter === 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span>ทุกกะ</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums ${shiftFilter === 'ALL' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {results.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShiftFilter('MORNING')}
              className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-all duration-150 flex items-center gap-1.5 border ${
                shiftFilter === 'MORNING'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-2xs ring-1 ring-amber-400'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-amber-50 hover:border-amber-300'
              }`}
            >
              <span>🌅 กะเช้า (08:15)</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums ${shiftFilter === 'MORNING' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800'}`}>
                {morningCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShiftFilter('AFTERNOON')}
              className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-all duration-150 flex items-center gap-1.5 border ${
                shiftFilter === 'AFTERNOON'
                  ? 'bg-orange-600 text-white border-orange-600 shadow-2xs ring-1 ring-orange-400'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-orange-50 hover:border-orange-300'
              }`}
            >
              <span>🌇 กะบ่าย (16:00)</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums ${shiftFilter === 'AFTERNOON' ? 'bg-orange-700 text-white' : 'bg-orange-100 text-orange-800'}`}>
                {afternoonCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShiftFilter('NIGHT')}
              className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-all duration-150 flex items-center gap-1.5 border ${
                shiftFilter === 'NIGHT'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs ring-1 ring-indigo-400'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-indigo-50 hover:border-indigo-300'
              }`}
            >
              <span>🌙 กะดึก (24:00)</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums ${shiftFilter === 'NIGHT' ? 'bg-indigo-700 text-white' : 'bg-indigo-100 text-indigo-800'}`}>
                {nightCount}
              </span>
            </button>

            {shiftFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setShiftFilter('ALL')}
                className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold cursor-pointer underline ml-1"
              >
                ✕ ล้างตัวกรองกะ
              </button>
            )}
          </div>

          <span className="text-[11px] text-slate-400 font-medium">
            * สแกนแรกของกะ: เช้า (08:15 น.), บ่าย (16:00 น. เริ่มตรวจ 15:30 น.), ดึก (24:00 น. เริ่มตรวจ 23:30 น.)
          </span>
        </div>

        {/* Row 2: Personnel Type Quick Pills + Department Filter */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs pt-1 border-t border-slate-100">
          {/* Personnel Type Pills */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">ประเภทบุคลากร:</span>
            <button
              onClick={() => setSelectedType('ALL')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${
                selectedType === 'ALL'
                  ? 'bg-teal-800 text-white font-semibold'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              ทุกประเภท
            </button>
            {personnelTypesList.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${
                  selectedType === t
                    ? 'bg-teal-800 text-white font-semibold'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Department Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-500 font-medium">กลุ่มงาน:</span>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-teal-600 cursor-pointer max-w-[200px] truncate"
            >
              <option value="ALL">ทุกกลุ่มงาน/ฝ่าย ({departments.length})</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Counter & Rule Note */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <div>
          แสดงผล <span className="font-bold text-slate-900 font-mono tabular-nums">{filteredResults.length}</span> จากทั้งหมด {results.length} รายการ
          {selectedType !== 'ALL' && (
            <span className="ml-2 font-medium text-teal-800">
              · ประเภท: {selectedType}
            </span>
          )}
          {statusFilter !== 'ALL' && (
            <span className="ml-2 font-medium text-amber-900">
              · กรองสถานะ: {statusFilter}
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400 font-mono">
          *เวลาเข้างานเกินเวลาเริ่มกะ คิดเป็นนาทีสายทันที (Zero Tolerance)
        </div>
      </div>

      {/* Executive Attendance Table with Sticky Header & Left Accent Borders */}
      <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto max-h-[640px]">
          <table className="w-full text-left text-xs border-collapse">
            {/* Sticky Table Header */}
            <thead className="sticky top-0 bg-slate-100 text-slate-700 font-semibold border-b border-slate-200/90 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">วันที่</th>
                <th className="py-3 px-3.5">ชื่อ - สกุล</th>
                <th className="py-3 px-3.5">ประเภทบุคลากร</th>
                <th className="py-3 px-3.5">กะการทำงาน</th>
                <th className="py-3 px-3.5 text-center">เวลาเข้างาน</th>
                <th className="py-3 px-3.5 text-center">เวลาออกงาน</th>
                <th className="py-3 px-3.5">สถานะการลงเวลา</th>
                <th className="py-3 px-3.5 text-right">จำนวนสแกน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-slate-400">
                    ไม่พบข้อมูลการลงเวลาตามเงื่อนไขที่เลือก
                  </td>
                </tr>
              ) : (
                filteredResults.map((row, rowIdx) => {
                  const isLate = row.status === 'LATE' || row.status === 'LATE_AND_EARLY';
                  const isOnTime = row.status === 'ON_TIME';

                  return (
                    <tr 
                      key={`${row.personId}-${rowIdx}`} 
                      className={`transition-colors duration-150 ${
                        isLate 
                          ? 'border-l-4 border-l-amber-500 bg-amber-500/[0.03] hover:bg-amber-500/[0.07]' 
                          : 'border-l-4 border-l-transparent hover:bg-slate-50/80'
                      }`}
                    >
                      {/* วันที่ */}
                      <td className="py-2.5 px-3.5 font-mono text-slate-600 whitespace-nowrap">
                        {row.workDate}
                      </td>

                      {/* ชื่อ - สกุล & ข้อมูลตำแหน่ง */}
                      <td className="py-2.5 px-3.5">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <span>{row.fullname}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5 font-sans">
                          <span className="font-mono text-teal-800 font-semibold">#{row.fingleId}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-600">{row.position}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-400 truncate max-w-xs">{row.department}</span>
                        </div>
                      </td>

                      {/* ประเภทบุคลากร */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <span className="text-[11px] font-medium text-slate-800">
                          {row.personnelTypeName || 'ข้าราชการ'}
                        </span>
                      </td>

                      {/* กะการทำงาน */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap font-mono">
                        <div className="font-bold text-slate-800 text-[11px]">
                          {row.shiftName}
                        </div>
                        <div className="text-[10px] text-slate-500 font-sans">
                          {row.plannedStartTime} - {row.plannedEndTime} น.
                        </div>
                      </td>

                      {/* เวลาเข้างาน (IN) */}
                      <td className="py-2.5 px-3.5 font-mono text-center whitespace-nowrap">
                        {row.inTime ? (
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold tabular-nums ${
                            row.lateMinutes > 0 
                              ? 'bg-amber-100 text-amber-950 font-bold border border-amber-300/80' 
                              : 'bg-slate-100 text-slate-800'
                          }`}>
                            {row.inTime}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* เวลาออกงาน (OUT) */}
                      <td className="py-2.5 px-3.5 font-mono text-center whitespace-nowrap">
                        {row.outTime ? (
                          <span className="font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px] tabular-nums">
                            {row.outTime}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* สถานะการลงเวลา (ตรงเวลา / สาย +Xm) */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        {isOnTime && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                            <span>ปกติ (ตรงเวลา)</span>
                          </span>
                        )}
                        {isLate && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-amber-950 bg-amber-500/15 border border-amber-400">
                            <AlertCircle className="w-3 h-3 text-amber-600" />
                            <span>สาย {row.lateMinutes} นาที (+{row.lateMinutes}m)</span>
                          </span>
                        )}
                        {row.status === 'IN_ONLY' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200">
                            <Clock className="w-3 h-3 text-blue-500" />
                            <span>สแกนเข้าอย่างเดียว (ยังไม่สแกนออก)</span>
                          </span>
                        )}
                        {row.status === 'NO_SCAN' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] text-slate-500 bg-slate-100 border border-slate-200">
                            <AlertCircle className="w-3 h-3 text-slate-400" />
                            <span>ไม่พบสแกน (ไม่สแกนเข้า)</span>
                          </span>
                        )}
                      </td>

                      {/* จำนวนสแกน */}
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-700 tabular-nums">
                        {row.scansCount > 0 ? (
                          <span>{row.scansCount}</span>
                        ) : (
                          <span className="text-slate-300 font-normal">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
