import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Calendar, 
  Search, 
  RefreshCw, 
  AlertCircle, 
  Clock, 
  Download, 
  Filter,
  Check,
  XCircle,
  HelpCircle
} from 'lucide-react';
import { StoreState, attendanceStore } from '../services/attendanceStore';
import { DailyResult } from '../types/attendance';

interface AttendancePageProps {
  state: StoreState;
}

export const AttendancePage: React.FC<AttendancePageProps> = ({ state }) => {
  const isAdmin = state.currentUser.role === 'ADMIN';

  // Selected date (default today 2026-10-14)
  const [selectedDate, setSelectedDate] = useState('2026-10-14');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Calculate daily attendance (uses auto-calculated results upon sync by default)
  const results: DailyResult[] = attendanceStore.getDailyAttendance(selectedDate);

  // Departments list for filter
  const departments = Array.from(new Set(state.personnel.map(p => p.hrDepName)));

  // Filtered results
  const filteredResults = results.filter((r) => {
    if (selectedDept !== 'ALL' && r.department !== selectedDept) return false;
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (searchTerm) {
      const matchName = r.fullname.toLowerCase().includes(searchTerm.toLowerCase());
      const matchFingle = r.fingleId.toString().includes(searchTerm);
      if (!matchName && !matchFingle) return false;
    }
    return true;
  });

  // Summary counts
  const presentCount = results.filter(r => r.status !== 'NO_SCAN').length;
  const onTimeCount = results.filter(r => r.status === 'ON_TIME').length;
  const lateCount = results.filter(r => r.status === 'LATE' || r.status === 'LATE_AND_EARLY').length;
  const noScanCount = results.filter(r => r.status === 'NO_SCAN').length;
  const inOnlyCount = results.filter(r => r.status === 'IN_ONLY').length;

  const handleRecalculate = () => {
    setIsRecalculating(true);
    setTimeout(() => {
      attendanceStore.getDailyAttendance(selectedDate, true);
      setIsRecalculating(false);
    }, 400);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              ⚡ ประมวลผลเวลาอัตโนมัติ Real-time (Auto-Calculated on Sync)
            </span>
            {state.lastAutoCalculatedAt && (
              <span className="text-[11px] text-slate-500 font-mono">
                ล่าสุด: {state.lastAutoCalculatedAt.split(' ')[1]}
              </span>
            )}
          </div>
          <h2 className="text-base font-bold text-slate-800">
            ผลการประมวลผลเวลาปฏิบัติงาน (Daily Attendance Processing)
          </h2>
          <p className="text-xs text-slate-500">
            จับคู่ Raw Scan กับกะการทำงาน (Roster &gt; Override &gt; กลุ่ม &gt; มาตรฐาน) คำนวณการเข้าตรงเวลา สาย ออกก่อน และ OT อัตโนมัติทันที
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold">
            <Calendar className="w-4 h-4 text-teal-600" />
            <span>ประจำวันที่:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="font-mono text-slate-800 focus:outline-none cursor-pointer"
            />
          </div>

          {isAdmin && (
            <button
              onClick={handleRecalculate}
              disabled={isRecalculating}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
              <span>{isRecalculating ? 'กำลังคำนวณ...' : 'คำนวณใหม่ (Recalculate)'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500">มาปฏิบัติงาน</div>
          <div className="text-xl font-bold text-slate-800 font-mono tabular-nums mt-0.5">
            {presentCount} <span className="text-xs font-normal text-slate-400">/ {results.length} คน</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
          <div className="text-xs text-emerald-700 font-medium">เข้างานตรงเวลา</div>
          <div className="text-xl font-bold text-emerald-700 font-mono tabular-nums mt-0.5">
            {onTimeCount} คน
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
          <div className="text-xs text-amber-700 font-medium">มาสาย (Late)</div>
          <div className="text-xl font-bold text-amber-600 font-mono tabular-nums mt-0.5">
            {lateCount} คน
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500">สแกนเข้าอย่างเดียว</div>
          <div className="text-xl font-bold text-slate-700 font-mono tabular-nums mt-0.5">
            {inOnlyCount} คน
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
          <div className="text-xs text-rose-600 font-medium">ยังไม่พบการสแกน</div>
          <div className="text-xl font-bold text-rose-700 font-mono tabular-nums mt-0.5">
            {noScanCount} คน
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="ค้นหาชื่อเจ้าหน้าที่, FINGLE_ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
          >
            <option value="ALL">ทุกกลุ่มงาน/ฝ่าย</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
          >
            <option value="ALL">สถานะทั้งหมด</option>
            <option value="ON_TIME">ตรงเวลา (ON_TIME)</option>
            <option value="LATE">มาสาย (LATE)</option>
            <option value="IN_ONLY">สแกนเข้าอย่างเดียว (IN_ONLY)</option>
            <option value="NO_SCAN">ยังไม่มีการสแกน (NO_SCAN)</option>
          </select>
        </div>
      </div>

      {/* Attendance Processing Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">FINGLE_ID</th>
                <th className="py-2.5 px-3">ชื่อ - สกุล</th>
                <th className="py-2.5 px-3">กลุ่มงาน / หน่วยงาน</th>
                <th className="py-2.5 px-3">กะที่กำหนด</th>
                <th className="py-2.5 px-3">ที่มาของกะ</th>
                <th className="py-2.5 px-3">เวลาเข้า (IN)</th>
                <th className="py-2.5 px-3">เวลาออก (OUT)</th>
                <th className="py-2.5 px-3">ผลการลงเวลา</th>
                <th className="py-2.5 px-3 text-right">จำนวนสแกน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredResults.map((row, rowIdx) => (
                <tr key={`${row.personId}-${rowIdx}`} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                    {row.fingleId}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-900">
                    {row.fullname}
                    <div className="text-[10px] text-slate-400">{row.position}</div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 truncate max-w-xs">
                    {row.department}
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    <span className="font-bold text-slate-800">[{row.shiftCode}]</span>{' '}
                    <span className="text-slate-600 text-[11px]">{row.plannedStartTime}–{row.plannedEndTime}</span>
                  </td>
                  <td className="py-2.5 px-3 text-[11px]">
                    <span className={`px-1.5 py-0.5 rounded font-mono ${
                      row.resolutionSource === 'ROSTER'
                        ? 'bg-purple-100 text-purple-800 font-semibold'
                        : row.resolutionSource === 'PERSON_OVERRIDE'
                        ? 'bg-blue-100 text-blue-800 font-semibold'
                        : row.resolutionSource === 'GROUP_OVERRIDE'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {row.resolutionSource}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    {row.inTime ? (
                      <span className="font-bold text-slate-800">{row.inTime}</span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    {row.outTime ? (
                      <span className="font-bold text-slate-800">{row.outTime}</span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    {row.status === 'ON_TIME' && (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>ตรงเวลา</span>
                      </span>
                    )}
                    {row.status === 'LATE' && (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-bold text-[11px]">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span>สาย {row.lateMinutes} นาที</span>
                      </span>
                    )}
                    {row.status === 'IN_ONLY' && (
                      <span className="text-slate-600 font-medium text-[11px]">
                        ลงเวลาเข้าแล้ว (รอออก)
                      </span>
                    )}
                    {row.status === 'NO_SCAN' && (
                      <span className="text-slate-400 italic text-[11px]">
                        ไม่พบการสแกน
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">
                    {row.scansCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
