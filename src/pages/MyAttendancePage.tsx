import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Fingerprint, 
  Award, 
  Printer, 
  Download, 
  Building2, 
  Briefcase, 
  Sparkles,
  Users,
  User,
  Search,
  Filter,
  ArrowRight,
  Eye,
  CalendarDays,
  UserCheck
} from 'lucide-react';
import { StoreState, attendanceStore, getDayType } from '../services/attendanceStore';
import { DailyResult, HrPerson } from '../types/attendance';

interface MyAttendancePageProps {
  state: StoreState;
}

export const MyAttendancePage: React.FC<MyAttendancePageProps> = ({ state }) => {
  const currentUser = state.currentUser;
  const [selectedMonth, setSelectedMonth] = useState('2026-10');
  const [viewMode, setViewMode] = useState<'INDIVIDUAL' | 'DEPARTMENT'>('INDIVIDUAL');
  const [activeTab, setActiveTab] = useState<'attendance' | 'raw_scans'>('attendance');

  // Department and Person selection states
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedPersonId, setSelectedPersonId] = useState<number>(() => {
    if (currentUser.personId) return currentUser.personId;
    if (state.personnel.length > 0) return state.personnel[0].personId;
    return 1;
  });
  const [personSearchTerm, setPersonSearchTerm] = useState('');
  const [deptSearchTerm, setDeptSearchTerm] = useState('');

  // Extract distinct departments
  const departments = useMemo(() => {
    const list = state.personnel
      .map(p => (p.hrDepName || '').trim())
      .filter(d => d.length > 0);
    return Array.from(new Set(list)).sort();
  }, [state.personnel]);

  // Filtered personnel list for selector
  const personnelInDept = useMemo(() => {
    return state.personnel.filter(p => {
      if (selectedDept !== 'ALL' && p.hrDepName !== selectedDept) return false;
      if (personSearchTerm) {
        const q = personSearchTerm.toLowerCase();
        const matchName = (p.hrFullname || '').toLowerCase().includes(q);
        const matchFingle = String(p.fingleId).includes(q);
        const matchPos = (p.hrPositionName || '').toLowerCase().includes(q);
        const matchCid = (p.hrCid || '').includes(q);
        if (!matchName && !matchFingle && !matchPos && !matchCid) return false;
      }
      return true;
    });
  }, [state.personnel, selectedDept, personSearchTerm]);

  // Selected person object
  const person = useMemo<HrPerson | undefined>(() => {
    if (state.personnel.length === 0) return undefined;
    return (
      state.personnel.find(p => p.personId === selectedPersonId) ||
      state.personnel.find(p => p.personId === currentUser.personId) ||
      state.personnel[0]
    );
  }, [state.personnel, selectedPersonId, currentUser.personId]);

  // If no personnel in database
  if (state.personnel.length === 0) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 max-w-xl mx-auto mt-12 shadow-sm">
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-600 border border-amber-200">
          <Users className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-bold text-slate-800">ยังไม่มีรายชื่อบุคลากรในฐานข้อมูล samchuk_attendance</h3>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          ฐานข้อมูลลงเวลาตาราง <code>attendance_personnel</code> ยังว่างอยู่<br />
          คุณสามารถเข้าไปสั่งดึงข้อมูลรายชื่อจากฐาน HOSOffice ได้ที่เมนู <strong>"ข้อมูลบุคลากร HR"</strong>
        </p>
      </div>
    );
  }

  const fingleId = person ? Number(person.fingleId) : 0;
  const personId = person ? Number(person.personId) : 0;
  const personName = (person?.hrFullname || '').trim().toLowerCase();

  // Raw scans for this person in staging database
  const myRawScans = state.rawScans.filter(s => {
    const sFid = Number(s.fingleId);
    const sPid = Number(s.personId);
    const sName = (s.hrFullname || '').trim().toLowerCase();
    return (
      (fingleId > 0 && sFid > 0 && sFid === fingleId) ||
      (personId > 0 && sPid > 0 && sPid === personId) ||
      (personName && sName && (sName === personName || sName.includes(personName) || personName.includes(sName)))
    );
  });

  // Generate date list for the selected month
  const today = new Date();
  const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  let maxDays = 31;
  if (selectedMonth === currentYearMonth) {
    maxDays = Math.min(31, Math.max(14, today.getDate()));
  }

  const dateSet = new Set<string>();
  for (let day = 1; day <= maxDays; day++) {
    const pad = day.toString().padStart(2, '0');
    dateSet.add(`${selectedMonth}-${pad}`);
  }
  myRawScans.forEach(s => {
    const sDate = (s.scanDateTime || '').replace('T', ' ').substring(0, 10);
    if (sDate.startsWith(selectedMonth)) {
      dateSet.add(sDate);
    }
  });

  const monthDates = Array.from(dateSet).sort();

  // Calculate daily attendance for this person
  const attendanceHistory: DailyResult[] = [];
  if (person) {
    monthDates.forEach(dateStr => {
      const results = attendanceStore.calculateAttendance(dateStr, person.personId);
      if (results.length > 0) {
        attendanceHistory.push(...results);
      }
    });
  }

  // Today's attendance for selected person
  const todayStr = '2026-10-14';
  const todayResult = attendanceHistory.find(r => r.workDate === todayStr);
  const todayInScan = todayResult?.rawScanIds && todayResult.rawScanIds.length > 0
    ? state.rawScans.find(s => s.id === todayResult.rawScanIds[0])
    : undefined;

  // Monthly stats for individual
  const daysWorked = attendanceHistory.filter(r => r.status !== 'NO_SCAN').length;
  const onTimeCount = attendanceHistory.filter(r => r.status === 'ON_TIME').length;
  const lateCount = attendanceHistory.filter(r => r.status === 'LATE' || r.status === 'LATE_AND_EARLY').length;
  const totalLateMinutes = attendanceHistory.reduce((acc, cur) => acc + (cur.lateMinutes || 0), 0);
  const totalOtMinutes = attendanceHistory.reduce((acc, cur) => acc + (cur.otMinutes || 0), 0);
  const totalOtHours = (totalOtMinutes / 60).toFixed(1);

  // Print function
  const handlePrint = () => {
    window.print();
  };

  // CSV Export for individual
  const handleExportCsv = () => {
    if (!person) return;
    const headers = [
      'วันที่',
      'วันในสัปดาห์',
      'กะปฏิบัติงาน',
      'เวลาเริ่ม-เลิก',
      'เวลาสแกนเข้า',
      'เวลาสแกนออก',
      'สถานะ',
      'สาย (นาที)',
      'ออกก่อน (นาที)',
      'OT (นาที)'
    ];

    const rows = attendanceHistory.map(r => [
      r.workDate,
      getDayType(r.workDate).name,
      `"${r.shiftName || ''}"`,
      `"${r.plannedStartTime || ''} - ${r.plannedEndTime || ''}"`,
      r.inTime || '-',
      r.outTime || '-',
      r.status,
      r.lateMinutes || 0,
      r.earlyMinutes || 0,
      r.otMinutes || 0
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ประวัติเวลาทำงาน_${person.hrFullname}_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Department Roster calculation
  const currentDeptPersonnel = useMemo(() => {
    return state.personnel.filter(p => {
      if (selectedDept !== 'ALL' && p.hrDepName !== selectedDept) return false;
      if (deptSearchTerm) {
        const q = deptSearchTerm.toLowerCase();
        const matchName = (p.hrFullname || '').toLowerCase().includes(q);
        const matchPos = (p.hrPositionName || '').toLowerCase().includes(q);
        const matchFingle = String(p.fingleId).includes(q);
        if (!matchName && !matchPos && !matchFingle) return false;
      }
      return true;
    });
  }, [state.personnel, selectedDept, deptSearchTerm]);

  // Today stats for department roster
  const deptStats = useMemo(() => {
    let scannedToday = 0;
    let onTimeToday = 0;
    let lateToday = 0;
    let notScannedToday = 0;

    currentDeptPersonnel.forEach(p => {
      const pResults = attendanceStore.calculateAttendance(todayStr, p.personId);
      const res = pResults.find(r => r.workDate === todayStr);
      if (res && res.inTime) {
        scannedToday++;
        if (res.status === 'ON_TIME') onTimeToday++;
        else if (res.status === 'LATE' || res.status === 'LATE_AND_EARLY') lateToday++;
      } else {
        notScannedToday++;
      }
    });

    return {
      total: currentDeptPersonnel.length,
      scannedToday,
      onTimeToday,
      lateToday,
      notScannedToday
    };
  }, [currentDeptPersonnel, todayStr]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Filter & View Mode Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* View Mode Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start">
            <button
              onClick={() => setViewMode('INDIVIDUAL')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'INDIVIDUAL'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <User className="w-4 h-4" />
              <span>ดูข้อมูลรายคน (Individual)</span>
            </button>
            <button
              onClick={() => setViewMode('DEPARTMENT')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'DEPARTMENT'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>ดูข้อมูลภาพรวมฝ่าย (Department)</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700 font-mono">
                {currentDeptPersonnel.length}
              </span>
            </button>
          </div>

          {/* Department & Person Selectors */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Department Dropdown */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              <label htmlFor="dept-select" className="text-slate-500 font-medium shrink-0">ฝ่าย/กลุ่มงาน:</label>
              <select
                id="dept-select"
                aria-label="เลือกฝ่ายหรือกลุ่มงาน"
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  // Auto pick first person in this dept if in individual mode
                  const inDept = state.personnel.filter(p => e.target.value === 'ALL' || p.hrDepName === e.target.value);
                  if (inDept.length > 0 && !inDept.some(p => p.personId === selectedPersonId)) {
                    setSelectedPersonId(inDept[0].personId);
                  }
                }}
                className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer max-w-[200px] truncate"
              >
                <option value="ALL">ทุกฝ่าย / กลุ่มงาน ({state.personnel.length} คน)</option>
                {departments.map((d, i) => (
                  <option key={i} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Person Dropdown (Active in Individual Mode) */}
            {viewMode === 'INDIVIDUAL' && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
                <User className="w-4 h-4 text-slate-400 shrink-0" />
                <label htmlFor="person-select" className="text-slate-500 font-medium shrink-0">รายบุคคล:</label>
                <select
                  id="person-select"
                  aria-label="เลือกบุคลากรรายบุคคล"
                  value={selectedPersonId}
                  onChange={(e) => setSelectedPersonId(Number(e.target.value))}
                  className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer max-w-[220px] truncate"
                >
                  {personnelInDept.map(p => (
                    <option key={p.personId} value={p.personId}>
                      {p.hrFullname} (#{p.fingleId}) - {p.hrPositionName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quick My Record Shortcut */}
            {currentUser.personId && (
              <button
                onClick={() => {
                  if (currentUser.personId) {
                    setSelectedPersonId(currentUser.personId);
                  }
                  setViewMode('INDIVIDUAL');
                }}
                title="สลับกลับมาดูข้อมูลของฉัน"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  selectedPersonId === currentUser.personId && viewMode === 'INDIVIDUAL'
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 text-teal-600" />
                <span>ข้อมูลของฉัน</span>
              </button>
            )}

            {/* Month Selector */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
              <Calendar className="w-4 h-4 text-slate-400" />
              <label htmlFor="month-select" className="text-slate-500 font-medium">งวดเดือน:</label>
              <input
                id="month-select"
                aria-label="เลือกงวดเดือน"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent font-mono text-slate-800 font-bold focus:outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODE 1: INDIVIDUAL VIEW                                                   */}
      {/* ========================================================================= */}
      {viewMode === 'INDIVIDUAL' && person && (
        <div className="space-y-6">
          {/* User Welcome & Identity Header */}
          <div className="bg-gradient-to-r from-teal-800 to-slate-900 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-teal-600/40 border border-teal-400/40 text-teal-200 flex items-center justify-center font-bold text-2xl shadow-inner shrink-0">
                  {person.hrFullname.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-xl font-bold tracking-tight text-white">
                      {person.hrFullname}
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/30 text-teal-200 border border-teal-400/30">
                      {person.hrPersonTypeName}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-400 text-slate-950">
                      FINGLE #{person.fingleId}
                    </span>
                  </div>
                  <div className="text-xs text-teal-100/90 mt-1.5 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Briefcase className="w-3.5 h-3.5 text-teal-300" />
                      {person.hrPositionName} ({person.hrLevelName || 'ทั่วไป'})
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-teal-300" />
                      {person.hrDepName} {person.hrDepSubName ? `(${person.hrDepSubName})` : ''}
                    </span>
                    {person.hrCid && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-teal-200">
                          CID: {person.hrCid}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 print:hidden">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>พิมพ์บัตรเวลา</span>
                </button>

                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>ส่งออก CSV</span>
                </button>
              </div>
            </div>
          </div>

          {/* Today's Live Attendance Status Banner */}
          <div className={`p-5 rounded-2xl border shadow-xs transition-all ${
            todayResult && todayResult.inTime
              ? todayResult.status === 'ON_TIME'
                ? 'bg-emerald-50/80 border-emerald-300'
                : 'bg-amber-50/80 border-amber-300'
              : 'bg-slate-100 border-slate-300'
          }`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                  todayResult && todayResult.inTime
                    ? todayResult.status === 'ON_TIME'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 text-slate-950'
                    : 'bg-slate-300 text-slate-600'
                }`}>
                  <Fingerprint className="w-6 h-6" />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      สถานะการลงเวลาวันนี้ (Live Telemetry วันที่ 14 ต.ค. 2569)
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white border border-slate-200 text-slate-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      ระบบออนไลน์
                    </span>
                  </div>

                  <div className="text-base font-bold text-slate-900 mt-0.5 flex items-center gap-2">
                    {todayResult && todayResult.inTime ? (
                      todayResult.status === 'ON_TIME' ? (
                        <span className="text-emerald-800 flex items-center gap-1.5">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          สแกนนิ้วติดแล้ว — เข้างานตรงเวลา
                        </span>
                      ) : (
                        <span className="text-amber-800 flex items-center gap-1.5">
                          <AlertCircle className="w-5 h-5 text-amber-600" />
                          สแกนนิ้วติดแล้ว — มาสาย {todayResult.lateMinutes} นาที
                        </span>
                      )
                    ) : (
                      <span className="text-slate-700 flex items-center gap-1.5">
                        <Clock className="w-5 h-5 text-slate-400" />
                        ยังไม่พบการสแกนนิ้วในวันนี้
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 mt-1 flex items-center gap-4 flex-wrap">
                    <span>
                      กะที่ได้รับมอบหมาย: <strong className="text-slate-800">{todayResult?.shiftName || 'กะเช้า'}</strong> ({todayResult?.plannedStartTime || '08:15'} - {todayResult?.plannedEndTime || '16:00'})
                    </span>
                    <span>•</span>
                    <span>
                      เวลาสแกนเข้า: <strong className="font-mono text-slate-800 font-bold">{todayResult?.inTime || '-'}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      เวลาสแกนออก: <strong className="font-mono text-slate-800 font-bold">{todayResult?.outTime || 'ยังไม่สแกนออก'}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="inline-block p-3 rounded-xl bg-white border border-slate-200 text-xs shadow-2xs">
                  <div className="text-slate-400 text-[10px]">เครื่องสแกนที่บันทึกล่าสุด</div>
                  <div className="font-bold text-slate-800 font-mono mt-0.5">
                    {todayInScan?.machineNo ? `Scanner เครื่องที่ ${todayInScan.machineNo}` : 'Scanner 1 - หน้าตึกอำนวยการ'}
                  </div>
                  <div className="text-[11px] text-teal-700 font-semibold mt-0.5">
                    {todayInScan?.scanDateTime || '14/10/2026 07:54:30'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Monthly KPI Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>วันปฏิบัติงานจริง</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-slate-800 font-mono tabular-nums">
                {daysWorked} <span className="text-xs font-normal text-slate-500">วัน</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">ในรอบเดือน {selectedMonth}</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>เข้างานปกติ (ตรงเวลา)</span>
                <Sparkles className="w-4 h-4 text-teal-600" />
              </div>
              <div className="text-2xl font-bold text-teal-700 font-mono tabular-nums">
                {onTimeCount} <span className="text-xs font-normal text-teal-600">ครั้ง</span>
              </div>
              <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
                {daysWorked > 0 ? `${((onTimeCount / daysWorked) * 100).toFixed(0)}% ของวันทำงาน` : '0%'}
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>สถิติมาสาย</span>
                <AlertCircle className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold text-amber-700 font-mono tabular-nums">
                {lateCount} <span className="text-xs font-normal text-amber-600">ครั้ง</span>
              </div>
              <div className="text-[11px] text-amber-700 font-mono mt-0.5">
                รวมสาย {totalLateMinutes} นาที
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>ชั่วโมง OT สะสม</span>
                <Award className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-2xl font-bold text-indigo-700 font-mono tabular-nums">
                {totalOtHours} <span className="text-xs font-normal text-indigo-600">ชม.</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">เบิกจ่ายค่าตอบแทนเวร</div>
            </div>
          </div>

          {/* Subtabs Navigation */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-1 text-xs font-semibold print:hidden">
            <button
              onClick={() => setActiveTab('attendance')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-colors ${
                activeTab === 'attendance'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>ผลการคิดเวลาและประวัติสแกน ({attendanceHistory.length} วัน)</span>
            </button>

            <button
              onClick={() => setActiveTab('raw_scans')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-colors ${
                activeTab === 'raw_scans'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Fingerprint className="w-4 h-4" />
              <span>บันทึกสแกนนิ้วดิบ ({myRawScans.length} รายการ)</span>
            </button>
          </div>

          {/* Subtab 1: Daily Attendance Table */}
          {activeTab === 'attendance' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  รายละเอียดผลการลงเวลาปฏิบัติงานประจำวัน (ประจำเดือน {selectedMonth})
                </span>
                <span className="text-teal-700 font-medium">
                  เงื่อนไขเวลาตามประเภทบุคลากร: {person.hrPersonTypeName || 'ข้าราชการ'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">วันที่</th>
                      <th className="py-2.5 px-3">วัน</th>
                      <th className="py-2.5 px-3">กะปฏิบัติงาน</th>
                      <th className="py-2.5 px-3">เวลาตามกะ</th>
                      <th className="py-2.5 px-3">สแกนเข้า (IN)</th>
                      <th className="py-2.5 px-3">สแกนออก (OUT)</th>
                      <th className="py-2.5 px-3">สถานะ</th>
                      <th className="py-2.5 px-3 text-right">สาย</th>
                      <th className="py-2.5 px-3 text-right">ออกก่อน</th>
                      <th className="py-2.5 px-3 text-right">OT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attendanceHistory.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-400">
                          ไม่พบประวัติการลงเวลาในเดือนนี้
                        </td>
                      </tr>
                    ) : (
                      attendanceHistory.map((item, idx) => {
                        const dayInfo = getDayType(item.workDate);
                        const isToday = item.workDate === todayStr;
                        const shiftObj = state.shifts.find(s => s.shiftCode === item.shiftCode);

                        return (
                          <tr 
                            key={idx} 
                            className={`hover:bg-slate-50 transition-colors ${
                              isToday ? 'bg-teal-50/40 font-medium' : ''
                            }`}
                          >
                            <td className="py-2.5 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                              {item.workDate} {isToday && <span className="ml-1 px-1.5 py-0.2 rounded bg-teal-600 text-white text-[10px]">วันนี้</span>}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {dayInfo.name}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                                <span 
                                  className="w-2 h-2 rounded-full" 
                                  style={{ backgroundColor: shiftObj?.color || '#0284c7' }}
                                ></span>
                                <span>{item.shiftName}</span>
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                              {item.plannedStartTime} - {item.plannedEndTime}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                              {item.inTime ? (
                                <span className={item.lateMinutes && item.lateMinutes > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                                  {item.inTime}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                              {item.outTime || <span className="text-slate-400">-</span>}
                            </td>
                            <td className="py-2.5 px-3">
                              {item.status === 'ON_TIME' && (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                                  ตรงเวลา
                                </span>
                              )}
                              {(item.status === 'LATE' || item.status === 'LATE_AND_EARLY') && (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
                                  สาย {item.lateMinutes} นาที
                                </span>
                              )}
                              {item.status === 'EARLY_LEAVE' && (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800">
                                  ออกก่อน {item.earlyMinutes} นาที
                                </span>
                              )}
                              {item.status === 'NO_SCAN' && (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-500">
                                  ขาด/ไม่มีสแกน
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {item.lateMinutes ? (
                                <span className="text-amber-700 font-bold">+{item.lateMinutes} น.</span>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {item.earlyMinutes ? (
                                <span className="text-rose-700 font-bold">-{item.earlyMinutes} น.</span>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {item.otMinutes ? (
                                <span className="text-indigo-700 font-bold">+{item.otMinutes} น.</span>
                              ) : (
                                <span className="text-slate-400">0</span>
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
          )}

          {/* Subtab 2: Raw Scans Table */}
          {activeTab === 'raw_scans' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  สแกนนิ้วดิบจากเครื่อง HIP CMiF68S ในตาราง <code>attendance_raw_scan</code>
                </span>
                <span className="text-slate-500 font-mono">
                  รวม {myRawScans.length} รายการ
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">วันและเวลาที่สแกน</th>
                      <th className="py-2.5 px-3">เครื่องสแกน (Machine)</th>
                      <th className="py-2.5 px-3">FINGLE ID</th>
                      <th className="py-2.5 px-3">โหมด</th>
                      <th className="py-2.5 px-3">In/Out Mode</th>
                      <th className="py-2.5 px-3">สถานะส่ง HOSOffice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {myRawScans.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          ไม่พบประวัติสแกนนิ้วดิบของบุคคลนี้ในระบบ
                        </td>
                      </tr>
                    ) : (
                      myRawScans.map((scan, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 font-mono">
                          <td className="py-2.5 px-4 font-bold text-slate-800">
                            {scan.scanDateTime}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            เครื่องที่ {scan.machineNo} ({scan.deviceIp})
                          </td>
                          <td className="py-2.5 px-3 text-teal-700 font-bold">
                            #{scan.fingleId}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {scan.verifyMode === 1 ? 'ลายนิ้วมือ (Finger)' : 'รหัสผ่าน/การ์ด'}
                          </td>
                          <td className="py-2.5 px-3">
                            {scan.inOutMode === 0 ? (
                              <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-100 text-emerald-800">เข้า (0)</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] bg-indigo-100 text-indigo-800">ออก (1)</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              scan.pushStatus === 'PUSHED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {scan.pushStatus}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: DEPARTMENT VIEW                                                   */}
      {/* ========================================================================= */}
      {viewMode === 'DEPARTMENT' && (
        <div className="space-y-6">
          {/* Department Header Banner */}
          <div className="bg-gradient-to-r from-teal-800 to-slate-900 rounded-2xl p-6 text-white shadow-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-teal-600/40 border border-teal-400/40 text-teal-200 flex items-center justify-center font-bold text-2xl shadow-inner shrink-0">
                  <Building2 className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-xl font-bold tracking-tight text-white">
                      {selectedDept === 'ALL' ? 'ทุกฝ่าย / กลุ่มงาน โรงพยาบาลสามชุก' : selectedDept}
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/30 text-teal-200 border border-teal-400/30">
                      {currentDeptPersonnel.length} ท่าน
                    </span>
                  </div>
                  <p className="text-xs text-teal-100/80 mt-1">
                    ภาพรวมสถานะการสแกนนิ้วประจำวันและสถิติการลงเวลารวมในงวดเดือน {selectedMonth}
                  </p>
                </div>
              </div>

              {/* Search Within Dept */}
              <div className="relative min-w-[260px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ, ตำแหน่ง, รหัส..."
                  value={deptSearchTerm}
                  onChange={(e) => setDeptSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-800/90 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-teal-400"
                />
              </div>
            </div>
          </div>

          {/* Department Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-500 mb-1">บุคลากรทั้งหมด</div>
              <div className="text-2xl font-bold text-slate-800 font-mono">
                {deptStats.total} <span className="text-xs font-normal text-slate-400">คน</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">ในสังกัดนี้</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
                <span>สแกนเข้าแล้ว</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-700 font-mono">
                {deptStats.scannedToday} <span className="text-xs font-normal text-emerald-600">คน</span>
              </div>
              <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
                {deptStats.total > 0 ? `${((deptStats.scannedToday / deptStats.total) * 100).toFixed(0)}% ของฝ่าย` : '0%'}
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
                <span>เข้างานตรงเวลา</span>
                <Sparkles className="w-4 h-4 text-teal-600" />
              </div>
              <div className="text-2xl font-bold text-teal-700 font-mono">
                {deptStats.onTimeToday} <span className="text-xs font-normal text-teal-600">คน</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">ไม่มีหักนาทีสาย</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
                <span>มาสายวันนี้</span>
                <AlertCircle className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold text-amber-700 font-mono">
                {deptStats.lateToday} <span className="text-xs font-normal text-amber-600">คน</span>
              </div>
              <div className="text-[11px] text-amber-700 mt-0.5">สแกนเกินเกณฑ์กะ</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
                <span>ยังไม่สแกน</span>
                <Clock className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl font-bold text-slate-500 font-mono">
                {deptStats.notScannedToday} <span className="text-xs font-normal text-slate-400">คน</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">รอสแกนเข้า</div>
            </div>
          </div>

          {/* Department Staff Attendance Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800">
                รายชื่อบุคลากรและสถานะการลงเวลาประจำวัน ({todayStr})
              </span>
              <span className="text-slate-500">
                แสดง {currentDeptPersonnel.length} ท่าน (คลิกเพื่อดูประวัติรายคน)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 w-12 text-center">ลำดับ</th>
                    <th className="py-2.5 px-3">รหัส/Fingle</th>
                    <th className="py-2.5 px-3">ชื่อ - สกุล</th>
                    <th className="py-2.5 px-3">ตำแหน่ง / กลุ่มงานย่อย</th>
                    <th className="py-2.5 px-3">ประเภทบุคลากร</th>
                    <th className="py-2.5 px-3">เวลาสแกนเข้าวันนี้</th>
                    <th className="py-2.5 px-3">สถานะวันนี้</th>
                    <th className="py-2.5 px-3 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentDeptPersonnel.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        ไม่พบรายชื่อบุคลากรในเงื่อนไขการค้นหานี้
                      </td>
                    </tr>
                  ) : (
                    currentDeptPersonnel.map((p, idx) => {
                      const pResults = attendanceStore.calculateAttendance(todayStr, p.personId);
                      const res = pResults.find(r => r.workDate === todayStr);
                      const hasIn = Boolean(res && res.inTime);
                      const isLate = res && (res.status === 'LATE' || res.status === 'LATE_AND_EARLY');

                      return (
                        <tr 
                          key={p.personId} 
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="py-3 px-4 text-center text-slate-400 font-mono">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-3 font-mono">
                            <span className="font-bold text-teal-700">#{p.fingleId}</span>
                            <span className="text-slate-400 text-[10px] block">ID: {p.personId}</span>
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-800">
                            {p.hrFullname}
                            {p.hrCid && (
                              <span className="text-[10px] text-slate-400 font-mono block">
                                CID: {p.hrCid}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-600">
                            <div>{p.hrPositionName}</div>
                            {p.hrDepSubName && (
                              <div className="text-[11px] text-slate-400">{p.hrDepSubName}</div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                              {p.hrPersonTypeName || 'ข้าราชการ'}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold">
                            {hasIn ? (
                              <span className={isLate ? 'text-amber-700' : 'text-emerald-700'}>
                                {res?.inTime}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {hasIn ? (
                              isLate ? (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
                                  สาย {res?.lateMinutes} นาที
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                                  ตรงเวลา
                                </span>
                              )
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-500">
                                ยังไม่สแกน
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => {
                                setSelectedPersonId(p.personId);
                                setViewMode('INDIVIDUAL');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 font-semibold text-xs transition-colors cursor-pointer border border-teal-200"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>ดูรายคน</span>
                            </button>
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
      )}
    </div>
  );
};
