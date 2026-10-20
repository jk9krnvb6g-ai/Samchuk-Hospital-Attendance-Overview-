import React, { useState, useMemo } from 'react';
import { 
  Printer, 
  Download, 
  Calendar, 
  Search, 
  Users, 
  AlertCircle, 
  Award,
  CheckCircle,
  Hospital,
  Sparkles,
  RefreshCw,
  Clock,
  Filter,
  TrendingUp,
  Cpu,
  Layers,
  ArrowRight
} from 'lucide-react';
import { 
  StoreState, 
  attendanceStore, 
  AttendanceReportMode, 
  ReportSummaryItem, 
  DailyPersonReport 
} from '../services/attendanceStore';
import { CustomSyncModal } from '../components/CustomSyncModal';

interface MonthlyReportPageProps {
  state: StoreState;
}

export const MonthlyReportPage: React.FC<MonthlyReportPageProps> = ({ state }) => {
  // Mode selection: DAILY, MONTHLY, YEARLY, CUSTOM
  const [reportMode, setReportMode] = useState<AttendanceReportMode>('MONTHLY');
  
  // Date states
  const [selectedDay, setSelectedDay] = useState<string>('2026-10-14');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-10');
  const [selectedYear, setSelectedYear] = useState<string>('2026');
  const [dateFrom, setDateFrom] = useState<string>('2026-10-01');
  const [dateTo, setDateTo] = useState<string>('2026-10-15');

  // Filters
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Processing & Modals
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Departments & Personnel types
  const departments = useMemo(() => Array.from(new Set(state.personnel.map(p => p.hrDepName))).filter(Boolean), [state.personnel]);
  const personTypes = useMemo(() => Array.from(new Set(state.personnel.map(p => p.hrPersonTypeName))).filter(Boolean), [state.personnel]);

  // Compute Daily data or Range/Monthly/Yearly data
  const dailyData: DailyPersonReport[] = useMemo(() => {
    if (reportMode !== 'DAILY') return [];
    return attendanceStore.getDailyReport(selectedDay);
  }, [reportMode, selectedDay, state.rawScans, state.personnel]);

  const summaryData: ReportSummaryItem[] = useMemo(() => {
    if (reportMode === 'DAILY') return [];
    if (reportMode === 'MONTHLY') {
      const [y, m] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      return attendanceStore.getRangeReport(`${selectedMonth}-01`, `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`);
    }
    if (reportMode === 'YEARLY') {
      return attendanceStore.getYearlySummary(selectedYear);
    }
    // CUSTOM
    return attendanceStore.getRangeReport(dateFrom, dateTo);
  }, [reportMode, selectedMonth, selectedYear, dateFrom, dateTo, state.rawScans, state.personnel]);

  // Filter Daily Data
  const filteredDaily = useMemo(() => {
    return dailyData.filter(item => {
      if (selectedDept !== 'ALL' && item.hrDepName !== selectedDept) return false;
      if (selectedType !== 'ALL' && item.hrPersonTypeName !== selectedType) return false;
      if (statusFilter === 'LATE' && item.status !== 'LATE' && item.status !== 'LATE_AND_EARLY') return false;
      if (statusFilter === 'ON_TIME' && item.status !== 'ON_TIME') return false;
      if (statusFilter === 'NO_SCAN' && item.status !== 'NO_SCAN') return false;
      if (statusFilter === 'WORKED' && item.status === 'NO_SCAN') return false;
      
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchName = item.hrFullname.toLowerCase().includes(q);
        const matchFingle = item.fingleId.toString().includes(q);
        const matchCid = item.hrCid?.includes(q);
        const matchPos = item.hrPositionName.toLowerCase().includes(q);
        if (!matchName && !matchFingle && !matchCid && !matchPos) return false;
      }
      return true;
    });
  }, [dailyData, selectedDept, selectedType, statusFilter, searchTerm]);

  // Filter Summary Data
  const filteredSummary = useMemo(() => {
    return summaryData.filter(item => {
      if (selectedDept !== 'ALL' && item.hrDepName !== selectedDept) return false;
      if (selectedType !== 'ALL' && item.hrPersonTypeName !== selectedType) return false;
      if (statusFilter === 'LATE' && item.lateCount === 0) return false;
      if (statusFilter === 'WORKED' && item.daysWorked === 0) return false;
      if (statusFilter === 'OT' && item.totalOtHours === 0) return false;

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchName = item.hrFullname.toLowerCase().includes(q);
        const matchFingle = item.fingleId.toString().includes(q);
        const matchCid = item.hrCid?.includes(q);
        const matchPos = item.hrPositionName.toLowerCase().includes(q);
        if (!matchName && !matchFingle && !matchCid && !matchPos) return false;
      }
      return true;
    });
  }, [summaryData, selectedDept, selectedType, statusFilter, searchTerm]);

  // Aggregated KPIs
  const totalDaysWorked = filteredSummary.reduce((acc, cur) => acc + cur.daysWorked, 0);
  const totalLateCount = filteredSummary.reduce((acc, cur) => acc + cur.lateCount, 0);
  const totalLateMinutes = filteredSummary.reduce((acc, cur) => acc + cur.totalLateMinutes, 0);
  const totalOtHours = filteredSummary.reduce((acc, cur) => acc + cur.totalOtHours, 0);

  // Daily KPIs
  const dailyPresent = filteredDaily.filter(d => d.status !== 'NO_SCAN').length;
  const dailyOnTime = filteredDaily.filter(d => d.status === 'ON_TIME').length;
  const dailyLate = filteredDaily.filter(d => d.status === 'LATE' || d.status === 'LATE_AND_EARLY').length;
  const dailyNoScan = filteredDaily.filter(d => d.status === 'NO_SCAN').length;

  // Title description based on mode
  const getPeriodLabel = () => {
    if (reportMode === 'DAILY') return `ประจำวันที่ ${selectedDay}`;
    if (reportMode === 'MONTHLY') return `ประจำเดือน ${selectedMonth}`;
    if (reportMode === 'YEARLY') return `ประจำปี ${selectedYear} (พ.ศ. ${Number(selectedYear) + 543})`;
    return `ช่วงวันที่ ${dateFrom} ถึง ${dateTo}`;
  };

  // Seed scans for the active mode
  const handleSeedForCurrentScope = async () => {
    setIsProcessing(true);
    setActionMsg(null);
    try {
      const res = await attendanceStore.seedRealisticScansForScope({
        mode: reportMode,
        date: selectedDay,
        month: selectedMonth,
        year: selectedYear,
        dateFrom,
        dateTo
      });
      if (res.success) {
        setActionMsg({ type: 'success', text: res.message });
      } else {
        setActionMsg({ type: 'error', text: res.message });
      }
    } catch (e: any) {
      setActionMsg({ type: 'error', text: e.message });
    } finally {
      setIsProcessing(false);
    }
  };

  // Import from HosOffice
  const handleImportHosoffice = async () => {
    setIsProcessing(true);
    setActionMsg(null);
    try {
      const res = await attendanceStore.importFromHosoffice({
        dateFrom: reportMode === 'CUSTOM' ? dateFrom : undefined,
        dateTo: reportMode === 'CUSTOM' ? dateTo : undefined,
        month: reportMode === 'MONTHLY' ? selectedMonth : undefined,
        year: reportMode === 'YEARLY' ? selectedYear : undefined
      });
      if (res.success) {
        setActionMsg({ type: 'success', text: res.message });
      } else {
        setActionMsg({ type: 'error', text: res.message });
      }
    } catch (e: any) {
      setActionMsg({ type: 'error', text: e.message });
    } finally {
      setIsProcessing(false);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (reportMode === 'DAILY') {
      const headers = [
        'FINGLE_ID',
        'เลขประจำตัวประชาชน (HR_CID)',
        'ชื่อ - นามสกุล',
        'ตำแหน่ง',
        'กลุ่มงาน',
        'หน่วยงานย่อย',
        'ประเภทบุคลากร',
        'วันที่ปฏิบัติงาน',
        'กะการทำงาน',
        'เวลาสแกนเข้า',
        'เวลาสแกนออก',
        'สถานะการมาทำงาน',
        'สาย (นาที)',
        'ออกก่อน (นาที)',
        'ชั่วโมงทำงานจริง',
        'เครื่องสแกนที่บันทึก'
      ];

      const rows = filteredDaily.map(d => [
        d.fingleId,
        `"${d.hrCid}"`,
        `"${d.hrFullname}"`,
        `"${d.hrPositionName}"`,
        `"${d.hrDepName}"`,
        `"${d.hrDepSubName}"`,
        `"${d.hrPersonTypeName}"`,
        d.workDate,
        `"${d.shiftName}"`,
        d.inTime,
        d.outTime,
        `"${d.statusLabel}"`,
        d.lateMinutes,
        d.earlyMinutes,
        d.hoursWorked,
        `"${d.machineNames}"`
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `รายงานเวลาปฏิบัติงาน_รพ.สามชุก_รายวัน_${selectedDay}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const headers = [
        'FINGLE_ID',
        'เลขประจำตัวประชาชน (HR_CID)',
        'ชื่อ - นามสกุล',
        'ตำแหน่ง',
        'กลุ่มงานหลัก',
        'หน่วยงานย่อย',
        'ประเภทบุคลากร',
        'วันปฏิบัติงานจริง (วัน)',
        'เข้าตรงเวลา (ครั้ง)',
        'มาสาย (ครั้ง)',
        'รวมเวลาสาย (นาที)',
        'ออกก่อนเวลา (ครั้ง)',
        'รวม OT (ชั่วโมง)',
        'อัตราตรงเวลา (%)',
        'ไม่พบสแกน/ขาด (วัน)'
      ];

      const rows = filteredSummary.map(d => [
        d.fingleId,
        `"${d.hrCid}"`,
        `"${d.hrFullname}"`,
        `"${d.hrPositionName}"`,
        `"${d.hrDepName}"`,
        `"${d.hrDepSubName}"`,
        `"${d.hrPersonTypeName}"`,
        d.daysWorked,
        d.onTimeCount,
        d.lateCount,
        d.totalLateMinutes,
        d.earlyLeaveCount,
        d.totalOtHours,
        `${d.onTimeRate}%`,
        d.noScanCount
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      const fileSuffix = reportMode === 'MONTHLY' ? selectedMonth : reportMode === 'YEARLY' ? selectedYear : `${dateFrom}_to_${dateTo}`;
      link.setAttribute('download', `รายงานเวลาปฏิบัติงาน_รพ.สามชุก_${reportMode.toLowerCase()}_${fileSuffix}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Print Report
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header and Print Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4 print:hidden">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded bg-teal-50 text-teal-800 text-xs font-semibold mb-1 border border-teal-200">
            <Hospital className="w-3.5 h-3.5" />
            <span>กลุ่มงานทรัพยากรบุคคล (HR) & กลุ่มงานการเงิน โรงพยาบาลสามชุก</span>
          </div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>รายงานสรุปการมาปฏิบัติงานบุคลากร (HR Attendance Report)</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {reportMode === 'DAILY' ? 'รายวัน' : reportMode === 'MONTHLY' ? 'รายเดือน' : reportMode === 'YEARLY' ? 'รายปี' : 'กำหนดช่วงเวลา'}
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            สรุปข้อมูลวันทำงาน, สถิติตรงเวลา/มาสาย, นาทีสายรวม, และชั่วโมง OT {getPeriodLabel()}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsSyncModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer transition-colors"
            title="เลือกเครื่องสแกนและช่วงเวลาเพื่อดึงข้อมูลเข้าระบบ"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>⚡ ดึงข้อมูลจากเครื่องสแกน</span>
          </button>

          <button
            onClick={handleSeedForCurrentScope}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-lg shadow-xs cursor-pointer transition-colors disabled:opacity-50"
            title="สร้างข้อมูลสแกนตัวอย่างจำลอง (ตรงเวลา/สาย) สำหรับช่วงเวลานี้"
          >
            <Sparkles className="w-3.5 h-3.5 text-slate-950" />
            <span>{isProcessing ? 'กำลังประมวลผล...' : '🧪 สร้างข้อมูลสแกน (ปกติ/สาย)'}</span>
          </button>

          <button
            onClick={handleImportHosoffice}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer transition-colors disabled:opacity-50"
            title="ดึงประวัติสแกนจากตาราง fingle_scan ใน HosOffice เข้าสู่ระบบ"
          >
            <span>⚡ ดึงจาก HosOffice</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>ส่งออก CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold rounded-lg shadow-xs cursor-pointer transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>พิมพ์</span>
          </button>
        </div>
      </div>

      {/* Scope / Mode Selection Navigation Bar (Requirement 1) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs print:hidden space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
            <button
              onClick={() => setReportMode('DAILY')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                reportMode === 'DAILY'
                  ? 'bg-white text-teal-800 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-teal-600" />
              <span>1. รายวัน (Daily)</span>
            </button>

            <button
              onClick={() => setReportMode('MONTHLY')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                reportMode === 'MONTHLY'
                  ? 'bg-white text-teal-800 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-teal-600" />
              <span>2. รายเดือน (Monthly)</span>
            </button>

            <button
              onClick={() => setReportMode('YEARLY')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                reportMode === 'YEARLY'
                  ? 'bg-white text-teal-800 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-teal-600" />
              <span>3. รายปี (Yearly)</span>
            </button>

            <button
              onClick={() => setReportMode('CUSTOM')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                reportMode === 'CUSTOM'
                  ? 'bg-white text-teal-800 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-teal-600" />
              <span>4. กำหนดช่วงเวลา (Range)</span>
            </button>
          </div>

          {/* Dynamic Date Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {reportMode === 'DAILY' && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-xl text-xs font-semibold">
                <Calendar className="w-4 h-4 text-teal-600" />
                <span>เลือกวันที่:</span>
                <input
                  type="date"
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  className="font-mono text-slate-800 focus:outline-none cursor-pointer bg-white px-2 py-0.5 rounded border border-slate-200"
                />
              </div>
            )}

            {reportMode === 'MONTHLY' && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-xl text-xs font-semibold">
                <Calendar className="w-4 h-4 text-teal-600" />
                <span>ประจำเดือน:</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="font-mono text-slate-800 focus:outline-none cursor-pointer bg-white px-2 py-0.5 rounded border border-slate-200"
                />
              </div>
            )}

            {reportMode === 'YEARLY' && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-xl text-xs font-semibold">
                <TrendingUp className="w-4 h-4 text-teal-600" />
                <span>ประจำปี:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="font-mono text-slate-800 focus:outline-none cursor-pointer bg-white px-2 py-0.5 rounded border border-slate-200 font-bold"
                >
                  <option value="2026">ค.ศ. 2026 (พ.ศ. 2569 - ปัจจุบัน)</option>
                  <option value="2025">ค.ศ. 2025 (พ.ศ. 2568)</option>
                  <option value="2024">ค.ศ. 2024 (พ.ศ. 2567)</option>
                </select>
              </div>
            )}

            {reportMode === 'CUSTOM' && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-xl text-xs font-semibold">
                <Calendar className="w-4 h-4 text-teal-600" />
                <span>ตั้งแต่วันที่:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="font-mono text-slate-800 focus:outline-none cursor-pointer bg-white px-2 py-0.5 rounded border border-slate-200"
                />
                <span className="text-slate-400">ถึง</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="font-mono text-slate-800 focus:outline-none cursor-pointer bg-white px-2 py-0.5 rounded border border-slate-200"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {actionMsg && (
        <div className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
          actionMsg.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
            : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
        </div>
      )}

      {/* Printable Report Header (Visible on print) */}
      <div className="hidden print:block text-center space-y-1 mb-6 border-b border-slate-400 pb-4">
        <h1 className="text-lg font-bold text-slate-900">
          รายงานสรุปการลงเวลาปฏิบัติงานและค่าตอบแทนนอกเวลา
        </h1>
        <h2 className="text-sm font-semibold text-slate-800">
          โรงพยาบาลสามชุก จังหวัดสุพรรณบุรี
        </h2>
        <p className="text-xs text-slate-600">
          {getPeriodLabel()} (ข้อมูล ณ วันที่ {new Date().toLocaleDateString('th-TH')})
        </p>
      </div>

      {/* Dynamic Summary KPI Strip */}
      {reportMode === 'DAILY' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>เจ้าหน้าที่ทั้งหมด</span>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-800 font-mono tabular-nums">
              {filteredDaily.length} <span className="text-xs font-normal text-slate-500">ท่าน</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">ในหน่วยงานที่เลือก</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>ปกติ (ตรงเวลา)</span>
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-700 font-mono tabular-nums">
              {dailyOnTime} <span className="text-xs font-normal text-emerald-600">ท่าน</span>
            </div>
            <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
              มาปฏิบัติงานรวม {dailyPresent} ท่าน
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>มาสาย</span>
              <AlertCircle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-amber-700 font-mono tabular-nums">
              {dailyLate} <span className="text-xs font-normal text-amber-600">ท่าน</span>
            </div>
            <div className="text-[11px] text-amber-700 font-medium mt-0.5 font-mono">
              หลังเกณฑ์เวลา 08:15 น.
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>ไม่พบสแกน / ขาด</span>
              <Clock className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-2xl font-bold text-rose-700 font-mono tabular-nums">
              {dailyNoScan} <span className="text-xs font-normal text-rose-600">ท่าน</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">ไม่มีบันทึกสแกนในวันนี้</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>เจ้าหน้าที่ในรายงาน</span>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-800 font-mono tabular-nums">
              {filteredSummary.length} <span className="text-xs font-normal text-slate-500">ท่าน</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">ในหน่วยงานที่เลือก</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>รวมวันปฏิบัติงานจริง</span>
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-700 font-mono tabular-nums">
              {totalDaysWorked.toLocaleString()} <span className="text-xs font-normal text-emerald-600">วัน</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">นับเฉพาะวันที่มีสแกน IN/OUT</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>สถิติมาสายรวม</span>
              <AlertCircle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-amber-700 font-mono tabular-nums">
              {totalLateCount.toLocaleString()} <span className="text-xs font-normal text-amber-600">ครั้ง</span>
            </div>
            <div className="text-[11px] text-amber-700 font-medium mt-0.5 font-mono">
              รวมสายทั้งสิ้น {totalLateMinutes.toLocaleString()} นาที
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>รวมชั่วโมง OT ทั้งสิ้น</span>
              <Award className="w-4 h-4 text-teal-600" />
            </div>
            <div className="text-2xl font-bold text-teal-700 font-mono tabular-nums">
              {totalOtHours.toFixed(1)} <span className="text-xs font-normal text-teal-600">ชม.</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">สำหรับส่งฝ่ายการเงินเบิกจ่าย</div>
          </div>
        </div>
      )}

      {/* Filter Toolbar (Hidden on print) */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs print:hidden">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ, FINGLE_ID, เลขบัตรประชาชน..."
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
            <option value="ALL">ทุกกลุ่มงาน/ฝ่ายหลัก (HR_DEPARTMENT)</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
          >
            <option value="ALL">ทุกประเภทบุคลากร (ข้าราชการ/ลูกจ้าง/พนักงาน)</option>
            {personTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
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
            <option value="ON_TIME">เฉพาะปกติ / ตรงเวลา</option>
            <option value="LATE">เฉพาะมาสาย</option>
            <option value="WORKED">เฉพาะคนที่มาปฏิบัติงาน</option>
            {reportMode === 'DAILY' ? (
              <option value="NO_SCAN">เฉพาะไม่พบสแกน / ขาด</option>
            ) : (
              <option value="OT">เฉพาะคนที่มี OT</option>
            )}
          </select>
        </div>
      </div>

      {/* Report Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs print:border-none print:shadow-none">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700">
            แสดง {reportMode === 'DAILY' ? filteredDaily.length : filteredSummary.length} รายการ ({getPeriodLabel()})
          </span>
          <span className="text-slate-500">
            * ระบบจับเวลาอ้างอิงมาตรฐานเครื่องสแกน HIP CMiF68S และตารางเวรโรงพยาบาลสามชุก
          </span>
        </div>

        <div className="overflow-x-auto">
          {reportMode === 'DAILY' ? (
            /* Daily Table View */
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">FINGLE_ID</th>
                  <th className="py-2.5 px-3">เลขประชาชน (HR_CID)</th>
                  <th className="py-2.5 px-3">ชื่อ - สกุล</th>
                  <th className="py-2.5 px-3">ตำแหน่ง / หน่วยงาน</th>
                  <th className="py-2.5 px-3 text-center">สแกนเข้า (IN)</th>
                  <th className="py-2.5 px-3 text-center">สแกนออก (OUT)</th>
                  <th className="py-2.5 px-3 text-center">ชั่วโมงทำงาน</th>
                  <th className="py-2.5 px-3 text-center">สถานะ</th>
                  <th className="py-2.5 px-3 text-right">เครื่องสแกน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredDaily.map((row) => (
                  <tr key={`daily-${row.personId}`} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                      {row.fingleId}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap text-[11px]">
                      {row.hrCid}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                      {row.hrFullname}
                      <div className="text-[10px] text-slate-500 font-normal">{row.hrPersonTypeName}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <div>{row.hrPositionName}</div>
                      <div className="text-[10px] text-teal-700 font-medium">{row.hrDepSubName || row.hrDepName}</div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                      {row.inTime !== '-' ? (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                          {row.inTime} น.
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                      {row.outTime !== '-' ? (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                          {row.outTime} น.
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-700">
                      {row.hoursWorked > 0 ? `${row.hoursWorked} ชม.` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        row.status === 'ON_TIME'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : row.status === 'LATE' || row.status === 'LATE_AND_EARLY'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : row.status === 'EARLY_LEAVE'
                          ? 'bg-orange-100 text-orange-800 border border-orange-300'
                          : row.status === 'IN_ONLY' || row.status === 'OUT_ONLY'
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500 text-[11px]">
                      {row.machineNames}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* Monthly / Yearly / Range Table View */
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">FINGLE_ID</th>
                  <th className="py-2.5 px-3">เลขประชาชน (HR_CID)</th>
                  <th className="py-2.5 px-3">ชื่อ - สกุล</th>
                  <th className="py-2.5 px-3">ตำแหน่ง / หน่วยงานย่อย</th>
                  <th className="py-2.5 px-3 text-center">วันทำงาน (วัน)</th>
                  <th className="py-2.5 px-3 text-center text-emerald-800 font-bold">ปกติ / ตรงเวลา</th>
                  <th className="py-2.5 px-3 text-center text-amber-800 font-bold">มาสาย (ครั้ง)</th>
                  <th className="py-2.5 px-3 text-center">รวมเวลาสาย</th>
                  <th className="py-2.5 px-3 text-center">ออกก่อน</th>
                  <th className="py-2.5 px-3 text-center font-bold text-teal-800">รวม OT (ชม.)</th>
                  <th className="py-2.5 px-3 text-center">อัตราตรงเวลา</th>
                  <th className="py-2.5 px-3 text-right">ไม่พบสแกน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredSummary.map((row, rowIdx) => (
                  <tr key={`${row.personId}-${rowIdx}`} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                      {row.fingleId}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap text-[11px]">
                      {row.hrCid}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                      {row.hrFullname}
                      <div className="text-[10px] text-slate-500 font-normal">{row.hrPersonTypeName}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <div>{row.hrPositionName}</div>
                      <div className="text-[10px] text-teal-700 font-medium">{row.hrDepSubName || row.hrDepName}</div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                      {row.daysWorked}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-emerald-700 font-medium">
                      {row.onTimeCount}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-600">
                      {row.lateCount > 0 ? row.lateCount : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-amber-700">
                      {row.totalLateMinutes > 0 ? `${row.totalLateMinutes} น.` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-500">
                      {row.earlyLeaveCount > 0 ? row.earlyLeaveCount : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-teal-700 bg-teal-50/50">
                      {row.totalOtHours > 0 ? `${row.totalOtHours} ชม.` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-700">
                      {row.daysWorked > 0 ? `${row.onTimeRate}%` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                      {row.noScanCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Signature Strip for Executive approval (Print Mode Only) */}
      <div className="hidden print:grid grid-cols-2 gap-8 pt-12 text-center text-xs text-slate-800">
        <div className="space-y-12">
          <div>ผู้จัดทำรายงาน: ...........................................................</div>
          <div>( เจ้าหน้าที่บริหารงานบุคคล / HR )</div>
        </div>
        <div className="space-y-12">
          <div>ผู้อนุมัติ: ...........................................................</div>
          <div>( ผู้อำนวยการโรงพยาบาลสามชุก )</div>
        </div>
      </div>

      {/* Custom Scanner Sync Modal (Requirement 2) */}
      <CustomSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        defaultDate={selectedDay}
        defaultMonth={selectedMonth}
        onSyncComplete={(msg) => {
          setActionMsg({ type: 'success', text: msg });
        }}
      />
    </div>
  );
};
