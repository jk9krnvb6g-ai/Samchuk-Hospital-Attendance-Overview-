import React, { useState } from 'react';
import { 
  User, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Fingerprint, 
  CalendarClock, 
  Award, 
  Printer, 
  Download, 
  Hospital, 
  Building, 
  Briefcase, 
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Info,
  Sparkles
} from 'lucide-react';
import { StoreState, attendanceStore, formatDate, getDayType } from '../services/attendanceStore';
import { Shift, DailyResult, RawScan, PersonRoster } from '../types/attendance';

interface MyAttendancePageProps {
  state: StoreState;
}

export const MyAttendancePage: React.FC<MyAttendancePageProps> = ({ state }) => {
  const currentUser = state.currentUser;
  const [selectedMonth, setSelectedMonth] = useState('2026-10');
  const [activeTab, setActiveTab] = useState<'attendance' | 'roster' | 'raw_scans'>('attendance');

  // Match the user with HrPerson
  const person = state.personnel.find(p => p.personId === currentUser.personId) || 
                 state.personnel.find(p => p.hrFullname.includes(currentUser.fullname.replace(' (USER)', '').replace(' (ADMIN)', ''))) ||
                 state.personnel[1]; // fallback to Nurse Nittaya

  const fingleId = person ? person.fingleId : 0;

  // Generate date list for the selected month (days 1 to 14 up to current date)
  const daysInMonth = 31;
  const todayStr = '2026-10-14';

  const monthDates: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const pad = day.toString().padStart(2, '0');
    monthDates.push(`${selectedMonth}-${pad}`);
  }

  // Calculate daily attendance for this person for all past days up to today
  const attendanceHistory: DailyResult[] = [];
  monthDates.forEach(dateStr => {
    if (dateStr <= todayStr) {
      const results = attendanceStore.calculateAttendance(dateStr, person.personId);
      if (results.length > 0) {
        attendanceHistory.push(...results);
      }
    }
  });

  // Today's attendance
  const todayResult = attendanceHistory.find(r => r.workDate === todayStr);
  const todayInScan = todayResult?.rawScanIds && todayResult.rawScanIds.length > 0
    ? state.rawScans.find(s => s.id === todayResult.rawScanIds[0])
    : undefined;

  // Raw scans for this person in staging database
  const myRawScans = state.rawScans.filter(s => s.fingleId === fingleId || s.personId === person.personId);

  // Roster entries for this person in selected month
  const myRoster = state.roster.filter(r => r.personId === person.personId && r.workDate.startsWith(selectedMonth));

  // Compute monthly stats
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

  // CSV Export
  const handleExportCsv = () => {
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

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
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
                  {person.hrPositionName} ({person.hrLevelName})
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Building className="w-3.5 h-3.5 text-teal-300" />
                  {person.hrDepName} {person.hrDepSubName ? `(${person.hrDepSubName})` : ''}
                </span>
                <span>•</span>
                <span className="font-mono text-teal-200">
                  CID: {person.hrCid}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 print:hidden">
            <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 px-3 py-2 rounded-xl text-xs font-medium">
              <Calendar className="w-4 h-4 text-teal-400" />
              <span className="text-slate-300">งวดเดือน:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent font-mono text-white focus:outline-none cursor-pointer"
              />
            </div>

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

      {/* Today's Live Attendance Status Banner (Crucial for Daily Check) */}
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
            <span>เข้างานตรงเวลา</span>
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

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1 text-xs font-semibold print:hidden">
        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'attendance'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>ผลการคิดเวลาและประวัติสแกน ({attendanceHistory.length} วัน)</span>
        </button>

        <button
          onClick={() => setActiveTab('roster')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'roster'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <CalendarClock className="w-4 h-4" />
          <span>ตารางเวรที่ได้รับมอบหมาย ({myRoster.length} รายการ)</span>
        </button>

        <button
          onClick={() => setActiveTab('raw_scans')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'raw_scans'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Fingerprint className="w-4 h-4" />
          <span>บันทึกสแกนนิ้วดิบของฉัน ({myRawScans.length} รายการ)</span>
        </button>
      </div>

      {/* Tab 1: Attendance History */}
      {activeTab === 'attendance' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800">
              รายละเอียดผลการลงเวลาปฏิบัติงานประจำวัน (ประจำเดือน {selectedMonth})
            </span>
            <span className="text-slate-500">
              คำนวณตามลำดับ: Roster &gt; Override &gt; Group &gt; Default
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
                          {item.inTime || <span className="text-slate-300 font-normal">-</span>}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                          {item.outTime || <span className="text-slate-300 font-normal">-</span>}
                        </td>
                        <td className="py-2.5 px-3">
                          {item.status === 'ON_TIME' && (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> ตรงเวลา
                            </span>
                          )}
                          {item.status === 'LATE' && (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                              <AlertCircle className="w-3.5 h-3.5" /> สาย
                            </span>
                          )}
                          {item.status === 'EARLY_LEAVE' && (
                            <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                              ออกก่อนเวลา
                            </span>
                          )}
                          {item.status === 'LATE_AND_EARLY' && (
                            <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                              สาย &amp; ออกก่อน
                            </span>
                          )}
                          {item.status === 'NO_SCAN' && (
                            <span className="text-slate-400">
                              ไม่พบสแกน
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {item.lateMinutes > 0 ? (
                            <span className="text-amber-700 font-bold">+{item.lateMinutes} น.</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {item.earlyMinutes > 0 ? (
                            <span className="text-rose-600 font-bold">{item.earlyMinutes} น.</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {item.otMinutes > 0 ? (
                            <span className="text-teal-700 font-bold">{(item.otMinutes / 60).toFixed(1)} ชม.</span>
                          ) : (
                            <span className="text-slate-300">-</span>
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

      {/* Tab 2: Assigned Roster */}
      {activeTab === 'roster' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs space-y-4 p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                ตารางเวรปฏิบัติงานประจำเดือน (Monthly Work Roster)
              </h3>
              <p className="text-xs text-slate-500">
                เวรที่หัวหน้าตึกหรือฝ่ายบริหารมอบหมายให้ปฏิบัติงานในรอบเดือน {selectedMonth}
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-teal-50 text-teal-800 border border-teal-200">
              สังกัด: {person.hrDepSubName || person.hrDepName}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {myRoster.length === 0 ? (
              <div className="col-span-4 p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                ไม่มีการลงตารางเวรเฉพาะเจาะจงในเดือนนี้ (ระบบใช้กะเริ่มต้นตามกลุ่มบุคลากร)
              </div>
            ) : (
              myRoster.map((r, i) => {
                const shiftObj = state.shifts.find(s => s.id === r.shiftId);
                return (
                  <div key={i} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-mono font-bold text-slate-800">
                        {r.workDate}
                      </span>
                      <span 
                        className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                        style={{ backgroundColor: shiftObj?.color || '#0284c7' }}
                      >
                        กะ {shiftObj?.shiftCode || 'เวร'}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-700">
                      {shiftObj?.shiftName || 'กะเวร'}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-1">
                      {shiftObj?.startTime} - {shiftObj?.endTime} น.
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Raw Scans */}
      {activeTab === 'raw_scans' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800">
              บันทึกการแตะลายนิ้วมือที่เครื่องสแกน (Raw Staging Scans)
            </span>
            <span className="text-slate-500">
              FINGLE_ID: #{fingleId}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">วัน-เวลาสแกน</th>
                  <th className="py-2.5 px-3">เครื่องสแกน</th>
                  <th className="py-2.5 px-3">IP เครื่อง</th>
                  <th className="py-2.5 px-3">Verify Mode</th>
                  <th className="py-2.5 px-3">In/Out Mode</th>
                  <th className="py-2.5 px-3">สถานะ Mapped</th>
                  <th className="py-2.5 px-3 text-right">เวลาดึงข้อมูล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myRawScans.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      ไม่พบประวัติการสแกนนิ้วดิบ
                    </td>
                  </tr>
                ) : (
                  myRawScans.map((scan, scanIdx) => (
                    <tr key={`${scan.id}-${scanIdx}`} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {scan.scanDateTime}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        เครื่อง {scan.machineNo}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {scan.deviceIp}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        โหมด {scan.verifyMode}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        IO: {scan.inOutMode}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-emerald-700 font-semibold text-[11px]">
                          ✓ Mapped (ID: {scan.personId})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400 text-[11px]">
                        {scan.receivedAt}
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
  );
};
