import React, { useState, useMemo } from 'react';
import { 
  X, 
  Calendar, 
  Clock, 
  Cpu, 
  CheckCircle, 
  AlertCircle, 
  Download, 
  Printer, 
  User, 
  Award,
  Filter,
  ArrowRight,
  ShieldCheck,
  Building2,
  FileText,
  Zap
} from 'lucide-react';
import { DailyPersonReport, ReportSummaryItem, attendanceStore } from '../services/attendanceStore';
import { RawScan } from '../types/attendance';

interface PersonAttendanceDrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  personId?: number;
  fingleId?: number;
  month?: string; // e.g. '2026-10'
  date?: string;  // e.g. '2026-10-20'
  rawScans: RawScan[];
  dailyItem?: DailyPersonReport;
  summaryItem?: ReportSummaryItem;
}

export const PersonAttendanceDrillDownModal: React.FC<PersonAttendanceDrillDownModalProps> = ({
  isOpen,
  onClose,
  personId,
  fingleId,
  month = '2026-10',
  date = '2026-10-20',
  rawScans
}) => {
  const [activeTab, setActiveTab] = useState<'LOGS' | 'MONTHLY_CALENDAR' | 'RAW_SCANS'>('MONTHLY_CALENDAR');
  const [filterMonth, setFilterMonth] = useState(month);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState<string | null>(null);

  const handleSeedPerson = async () => {
    setIsGenerating(true);
    setGenMessage(null);
    try {
      const res = await attendanceStore.seedScansForPerson(effectivePersonId, effectiveFingleId, filterMonth);
      if (res.success) {
        setGenMessage(res.message);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Find person details
  const person = useMemo(() => {
    const list = attendanceStore.getState().personnel;
    if (personId) return list.find(p => p.personId === personId);
    if (fingleId) return list.find(p => p.fingleId === fingleId);
    return null;
  }, [personId, fingleId]);

  const effectiveFingleId = person?.fingleId || fingleId || 57;
  const effectivePersonId = person?.personId || personId || 1;
  const effectiveFullname = person?.hrFullname || 'นายทวีสิทธิ์ พุ่มพฤกษ์';
  const effectivePosition = person?.hrPositionName || 'นักวิชาการคอมพิวเตอร์';
  const effectiveDept = person?.hrDepName || 'กลุ่มงานสุขภาพดิจิทัล';
  const effectiveSubDept = person?.hrDepSubName || 'งานเทคโนโลยีและสารสนเทศทางการแพทย์';
  const effectiveType = person?.hrPersonTypeName || 'ข้าราชการ';
  const effectiveCid = person?.hrCid || '3-7204-00123-45-6';

  // All raw scans of this person
  const personRawScans = useMemo(() => {
    return rawScans
      .filter(s => s.fingleId === effectiveFingleId || (personId && s.personId === personId))
      .sort((a, b) => b.scanDateTime.localeCompare(a.scanDateTime));
  }, [rawScans, effectiveFingleId, personId]);

  // Today/Selected Date Scans
  const todayScans = useMemo(() => {
    return personRawScans.filter(s => s.scanDateTime.startsWith(date));
  }, [personRawScans, date]);

  // Day-by-Day timeline for the selected month
  const monthlyTimeline = useMemo(() => {
    const [y, m] = filterMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const rows = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const curDateStr = `${filterMonth}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(curDateStr).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      const dayScans = personRawScans
        .filter(s => s.scanDateTime.startsWith(curDateStr))
        .sort((a, b) => a.scanDateTime.localeCompare(b.scanDateTime));

      let inTime = '-';
      let outTime = '-';
      let status = isWeekend ? 'WEEKEND' : 'NO_SCAN';
      let statusLabel = isWeekend ? 'วันหยุด' : 'ไม่พบสแกน';
      let lateMinutes = 0;
      let hoursWorked = 0;
      const machines = Array.from(new Set(dayScans.map(s => `เครื่อง ${s.machineNo}`))).join(', ');

      if (dayScans.length > 0) {
        const first = dayScans[0];
        const timePart = first.scanDateTime.split(' ')[1] || '';
        inTime = timePart.substring(0, 5);

        const [h, min] = inTime.split(':').map(Number);
        const mins = h * 60 + min;
        // 1. กะดึก: เวลาสแกน 23:30 – 05:00 น. (เกณฑ์ 24:00 น. เริ่มตรวจ 23:30 น.)
        const isNight = (h === 23 && min >= 30) || (h < 5);

        // 2. กะบ่าย: เวลาสแกน 15:30 – 23:29 น. (เกณฑ์ 16:00 น. เริ่มตรวจ 15:30 น.)
        const isAfternoon = !isNight && ((h === 15 && min >= 30) || (h >= 16 && (h < 23 || (h === 23 && min < 30))));

        if (isNight) {
          // กะดึก: เริ่ม 00:00 น. อนุญาตให้สแกนเข้าก่อนได้ 30 นาที (ตั้งแต่ 23:30 น.)
          if (h >= 22) {
            status = 'ON_TIME';
            statusLabel = 'ตรงเวลา (กะดึก)';
            lateMinutes = 0;
          } else if (h === 0 && min === 0) {
            status = 'ON_TIME';
            statusLabel = 'ตรงเวลา (กะดึก)';
            lateMinutes = 0;
          } else {
            lateMinutes = h * 60 + min;
            status = 'LATE';
            statusLabel = `สาย ${lateMinutes} นาที (กะดึก)`;
          }
        } else if (isAfternoon) {
          // กะบ่าย: เริ่ม 16:00 น. อนุญาตให้สแกนเข้าก่อนได้ 30 นาที (ตั้งแต่ 15:30 น.)
          const afternoonTarget = 16 * 60;
          if (mins <= afternoonTarget) {
            status = 'ON_TIME';
            statusLabel = 'ตรงเวลา (กะบ่าย)';
            lateMinutes = 0;
          } else {
            lateMinutes = mins - afternoonTarget;
            status = 'LATE';
            statusLabel = `สาย ${lateMinutes} นาที (กะบ่าย)`;
          }
        } else {
          // กะเช้า: เกณฑ์เวลาเริ่ม 08:15 น.
          const morningTarget = 8 * 60 + 15;
          if (mins <= morningTarget) {
            status = 'ON_TIME';
            statusLabel = 'ตรงเวลา';
            lateMinutes = 0;
          } else {
            lateMinutes = mins - morningTarget;
            status = 'LATE';
            statusLabel = `สาย ${lateMinutes} นาที`;
          }
        }

        // กรณีมีสแกนมากกว่า 1 ครั้งในวันเดียวกัน จึงดึงเวลาสุดท้ายมาแสดงในช่อง OUT
        if (dayScans.length > 1) {
          const last = dayScans[dayScans.length - 1];
          const outTimePart = last.scanDateTime.split(' ')[1] || '';
          outTime = outTimePart.substring(0, 5);

          const [outH, outMin] = outTime.split(':').map(Number);
          const durationMins = (outH * 60 + outMin) - (h * 60 + min);
          hoursWorked = Number((Math.max(0, durationMins) / 60).toFixed(1));
        } else {
          // สแกนเข้าครั้งเดียว ถือว่าปฏิบัติงานเต็มวันตามกะปกติ 8.0 ชม.
          hoursWorked = 8.0;
        }
      }

      rows.push({
        date: curDateStr,
        dayOfWeek,
        isWeekend,
        dayScans,
        inTime,
        outTime,
        status,
        statusLabel,
        lateMinutes,
        hoursWorked,
        machines
      });
    }

    return rows;
  }, [filterMonth, personRawScans]);

  // Aggregate stats for the month
  const monthlyStats = useMemo(() => {
    const workedDays = monthlyTimeline.filter(d => d.dayScans.length > 0);
    const onTimeDays = monthlyTimeline.filter(d => d.status === 'ON_TIME');
    const lateDays = monthlyTimeline.filter(d => d.status === 'LATE');
    const totalLateMinutes = monthlyTimeline.reduce((acc, cur) => acc + cur.lateMinutes, 0);
    const totalHoursWorked = monthlyTimeline.reduce((acc, cur) => acc + cur.hoursWorked, 0);

    return {
      daysWorked: workedDays.length,
      onTimeCount: onTimeDays.length,
      lateCount: lateDays.length,
      totalLateMinutes,
      totalHoursWorked: Number(totalHoursWorked.toFixed(1)),
      onTimeRate: workedDays.length > 0 ? Math.round((onTimeDays.length / workedDays.length) * 100) : 100
    };
  }, [monthlyTimeline]);

  if (!isOpen) return null;

  const handleExportCsv = () => {
    const headers = ['วันที่', 'วันในสัปดาห์', 'เวลาเข้า (IN)', 'เวลาออก (OUT)', 'สถานะ', 'สาย (นาที)', 'ชั่วโมงทำงาน', 'เครื่องสแกน', 'จำนวนครั้งที่สแกน'];
    const daysTh = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const rows = monthlyTimeline.map(r => [
      r.date,
      daysTh[r.dayOfWeek],
      r.inTime,
      r.outTime,
      r.statusLabel,
      r.lateMinutes,
      r.hoursWorked,
      `"${r.machines}"`,
      r.dayScans.length
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ประวัติเวลา_${effectiveFullname}_${filterMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 md:p-6 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-linear-to-r from-teal-800 to-slate-900 text-white flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 font-bold text-lg shadow-inner">
              {effectiveFullname.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  {effectiveFullname}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-teal-400/20 text-teal-200 border border-teal-400/30">
                  FINGLE_ID: {effectiveFingleId}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/10 text-slate-200 border border-white/10">
                  {effectiveType}
                </span>
              </div>
              <p className="text-xs text-teal-200/80 mt-1 flex items-center gap-2 flex-wrap">
                <span>{effectivePosition}</span>
                <span>•</span>
                <span>{effectiveSubDept || effectiveDept}</span>
                <span>•</span>
                <span className="font-mono text-slate-300">CID: {effectiveCid}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Month Selector & Month KPI Ribbon */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-700" />
            <span className="text-xs font-bold text-slate-700">ประจำเดือน:</span>
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="bg-white border border-slate-300 text-xs rounded-lg px-2.5 py-1 text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-teal-500 shadow-2xs"
            />
          </div>

          {/* Aggregated KPI Badges */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold">
              วันทำงาน: {monthlyStats.daysWorked} วัน
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-teal-100 text-teal-900 border border-teal-300 font-bold">
              ตรงเวลา: {monthlyStats.onTimeCount} วัน ({monthlyStats.onTimeRate}%)
            </span>
            {monthlyStats.lateCount > 0 ? (
              <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                สาย: {monthlyStats.lateCount} ครั้ง ({monthlyStats.totalLateMinutes} นาที)
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                ✓ ไม่มีประวัติสาย
              </span>
            )}
            <span className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 font-mono">
              รวม: {monthlyStats.totalHoursWorked} ชม.
            </span>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="px-6 border-b border-slate-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('MONTHLY_CALENDAR')}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'MONTHLY_CALENDAR'
                  ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>ปฏิทินสรุปรายวันตลอดทั้งเดือน ({monthlyTimeline.filter(d => d.dayScans.length > 0).length} วัน)</span>
            </button>

            <button
              onClick={() => setActiveTab('RAW_SCANS')}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'RAW_SCANS'
                  ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>ประวัติสแกนดิบจากเครื่องทั้งหมด ({personRawScans.length} รายการ)</span>
            </button>
          </div>

          <div className="flex items-center gap-2 py-2">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1 px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>ส่งออก CSV บุคคล</span>
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>พิมพ์</span>
            </button>
          </div>
        </div>

        {/* Modal Body / Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* แจ้งเตือนเมื่อยังไม่พบประวัติสแกนของบุคคลนี้ พร้อมปุ่มสร้างข้อมูลทันที */}
          {personRawScans.length === 0 && (
            <div className="p-4 bg-amber-50/95 border border-amber-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-950 shadow-xs">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-900">
                    ยังไม่มีข้อมูลประวัติสแกนของ {effectiveFullname} (FINGLE: {effectiveFingleId}) ในเดือน {filterMonth}
                  </div>
                  <div className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                    เนื่องจากเพิ่งมีการล้างตารางใน MySQL หรือยังไม่ได้เชื่อมต่อดึงข้อมูลจากเครื่องสแกน คุณสามารถกดปุ่มเพื่อจำลองประวัติการลงเวลาจริงของ รพ.สามชุก ครบทั้งเดือนได้ทันที
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSeedPerson}
                disabled={isGenerating}
                className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-lg shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 text-xs transition-colors"
              >
                <Zap className={`w-3.5 h-3.5 ${isGenerating ? 'animate-bounce' : ''}`} />
                <span>{isGenerating ? 'กำลังสร้างข้อมูล...' : '⚡ คลิกสร้างประวัติสแกนเดือนนี้ทันที'}</span>
              </button>
            </div>
          )}

          {genMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{genMessage}</span>
            </div>
          )}

          {activeTab === 'MONTHLY_CALENDAR' ? (
            /* Tab 1: Day-by-Day Timeline */
            <div className="space-y-3">
              <div className="text-xs text-slate-500 flex items-center justify-between">
                <span>แสดงการมาปฏิบัติงานทุกวันในเดือน {filterMonth} เกณฑ์เวลาเข้ากะปกติ: 08:15 น.</span>
                <span className="text-[11px] text-teal-700 font-medium">* คลิกวันที่เพื่อดูรายการสแกนดิบที่สแกนในวันนั้น</span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">วันที่</th>
                      <th className="py-2.5 px-3 text-center">เวลาเข้า (IN)</th>
                      <th className="py-2.5 px-3 text-center">เวลาออก (OUT)</th>
                      <th className="py-2.5 px-3 text-center">ผลเวลา</th>
                      <th className="py-2.5 px-3 text-center">สาย (นาที)</th>
                      <th className="py-2.5 px-3 text-center">ชม. ทำงาน</th>
                      <th className="py-2.5 px-3">เครื่องสแกนที่บันทึก</th>
                      <th className="py-2.5 px-3 text-right">จำนวนสแกน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthlyTimeline.map((item) => {
                      const daysTh = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
                      const dayName = daysTh[item.dayOfWeek];
                      const isTodayRow = item.date === date;

                      return (
                        <tr 
                          key={item.date} 
                          className={`transition-colors ${
                            isTodayRow 
                              ? 'bg-amber-50/70 font-semibold' 
                              : item.isWeekend 
                              ? 'bg-slate-50/40 text-slate-400' 
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2 px-3 font-mono">
                            <span className="font-bold text-slate-800">{item.date}</span>
                            <span className="ml-1 text-[11px] text-slate-500 font-sans">({dayName})</span>
                            {isTodayRow && (
                              <span className="ml-1.5 px-1.5 py-0.2 rounded text-[10px] bg-amber-200 text-amber-900 border border-amber-300 font-bold">
                                วันที่เลือก
                              </span>
                            )}
                          </td>

                          <td className="py-2 px-3 text-center font-mono font-bold">
                            {item.inTime !== '-' ? (
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                                {item.inTime} น.
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          <td className="py-2 px-3 text-center font-mono font-bold">
                            {item.outTime !== '-' ? (
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                                {item.outTime} น.
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          <td className="py-2 px-3 text-center">
                            {item.status === 'ON_TIME' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                {item.statusLabel}
                              </span>
                            )}
                            {item.status === 'LATE' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                <AlertCircle className="w-3 h-3 text-amber-600" />
                                {item.statusLabel}
                              </span>
                            )}
                            {item.status === 'NO_SCAN' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-400">
                                ไม่พบสแกน
                              </span>
                            )}
                            {item.status === 'WEEKEND' && item.dayScans.length === 0 && (
                              <span className="text-[11px] text-slate-400">
                                วันหยุดประจำสัปดาห์
                              </span>
                            )}
                          </td>

                          <td className="py-2 px-3 text-center font-mono">
                            {item.lateMinutes > 0 ? (
                              <span className="text-amber-700 font-bold">+{item.lateMinutes} นาที</span>
                            ) : (
                              <span className="text-slate-300">0</span>
                            )}
                          </td>

                          <td className="py-2 px-3 text-center font-mono text-slate-700">
                            {item.hoursWorked > 0 ? `${item.hoursWorked} ชม.` : '-'}
                          </td>

                          <td className="py-2 px-3 text-slate-600 text-[11px]">
                            {item.machines || '-'}
                          </td>

                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-700">
                            {item.dayScans.length > 0 ? (
                              <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                                {item.dayScans.length} ครั้ง
                              </span>
                            ) : (
                              <span className="text-slate-300">0</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Tab 2: All Raw Scans Table */
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                รายการสแกนดิบทั้งหมดของ {effectiveFullname} (FINGLE_ID: {effectiveFingleId}) จากเครื่องสแกนนิ้วมือใน Staging DB
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">วัน-เวลาสแกน</th>
                      <th className="py-2.5 px-3">เครื่องสแกน</th>
                      <th className="py-2.5 px-3 text-center">โหมดเข้า/ออก</th>
                      <th className="py-2.5 px-3 text-center">วิธีตรวจสอบ</th>
                      <th className="py-2.5 px-3 text-center">สถานะ HosOffice</th>
                      <th className="py-2.5 px-3 text-right">เวลาที่ดึงเข้าระบบ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {personRawScans.map((scan) => (
                      <tr key={scan.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-bold text-slate-800">
                          {scan.scanDateTime}
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          เครื่อง {scan.machineNo} ({scan.deviceIp})
                        </td>
                        <td className="py-2 px-3 text-center">
                          {scan.inOutMode === 0 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              สแกนเข้า (IN)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              สแกนออก (OUT)
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center text-slate-600">
                          สแกนนิ้วมือ (Fingerprint)
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            scan.pushStatus === 'PUSHED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : scan.pushStatus === 'PENDING'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {scan.pushStatus}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-400 text-[11px]">
                          {scan.receivedAt || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            * ข้อมูลเวลาสแกนจะอัปเดตอัตโนมัติเมื่อกดซิงค์เครื่องสแกน หรือดึงจาก HosOffice
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
};
