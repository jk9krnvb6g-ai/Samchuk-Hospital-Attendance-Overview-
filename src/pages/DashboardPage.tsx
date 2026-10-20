import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Fingerprint, 
  UserCheck, 
  AlertCircle, 
  Cpu, 
  Clock, 
  Send, 
  ArrowRight,
  Database,
  Calendar,
  Sparkles,
  RefreshCw,
  Building2,
  CheckCircle2,
  Activity,
  Layers,
  Search,
  Filter
} from 'lucide-react';
import { StoreState, attendanceStore, DailyPersonReport } from '../services/attendanceStore';
import { NavTab } from '../components/Navigation';
import { 
  HourlyPunchDistributionChart, 
  AttendanceStatusProportionCard, 
  ScannerTelemetryCards, 
  DepartmentAttendanceOverview 
} from '../components/DashboardCharts';
import { DashboardDrillDownModal, DrillDownType } from '../components/DashboardDrillDownModal';
import { CustomSyncModal } from '../components/CustomSyncModal';
import { PersonAttendanceDrillDownModal } from '../components/PersonAttendanceDrillDownModal';

interface DashboardPageProps {
  state: StoreState;
  onNavigate: (tab: NavTab) => void;
  onSync: () => void;
  isSyncing: boolean;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  state,
  onNavigate,
  onSync,
  isSyncing
}) => {
  const isAdmin = state.currentUser.role === 'ADMIN';

  // Date Selection for Dashboard
  const [selectedDate, setSelectedDate] = useState<string>('2026-10-14');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');

  // Modals & Drill-down State
  const [drillDownModal, setDrillDownModal] = useState<{
    isOpen: boolean;
    type: DrillDownType;
    title: string;
    subtitle?: string;
    targetFilter?: string | number;
  }>({
    isOpen: false,
    type: 'ALL_PERSONNEL',
    title: ''
  });

  // Individual Person Drill-down
  const [personDrillDown, setPersonDrillDown] = useState<{
    isOpen: boolean;
    personId?: number;
    fingleId?: number;
  }>({ isOpen: false });

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Departments
  const departments = useMemo(() => {
    return Array.from(new Set(state.personnel.map(p => p.hrDepName))).filter(Boolean);
  }, [state.personnel]);

  // Compute daily data for selected date
  const dailyData: DailyPersonReport[] = useMemo(() => {
    let data = attendanceStore.getDailyReport(selectedDate);
    if (selectedDept !== 'ALL') {
      data = data.filter(d => d.hrDepName === selectedDept);
    }
    return data;
  }, [selectedDate, selectedDept, state.rawScans, state.personnel]);

  // Scans for selected date
  const dateScans = useMemo(() => {
    return state.rawScans.filter(s => s.scanDateTime.startsWith(selectedDate));
  }, [selectedDate, state.rawScans]);

  // Key Metrics
  const totalPersonnel = state.personnel.length;
  const filteredPersonnelCount = selectedDept === 'ALL' ? totalPersonnel : dailyData.length;
  
  const presentCount = dailyData.filter(d => d.status !== 'NO_SCAN').length;
  const onTimeCount = dailyData.filter(d => d.status === 'ON_TIME').length;
  const lateCount = dailyData.filter(d => d.status === 'LATE' || d.status === 'LATE_AND_EARLY').length;
  const noScanCount = dailyData.filter(d => d.status === 'NO_SCAN').length;
  const earlyLeaveCount = dailyData.filter(d => d.earlyMinutes > 0).length;

  // Total late minutes today
  const totalLateMins = dailyData.reduce((acc, cur) => acc + cur.lateMinutes, 0);

  // Online scanners
  const onlineScanners = state.scanners.filter(s => s.status === 'ONLINE').length;
  const totalScanners = state.scanners.length;

  // Staging pending scans
  const pendingScans = state.rawScans.filter(s => s.pushStatus === 'PENDING');
  const lastPushBatch = state.pushBatches[0];

  // Open Drill-Down Handlers
  const handleOpenDrillDown = (type: DrillDownType, title: string, subtitle?: string, targetFilter?: string | number) => {
    setDrillDownModal({
      isOpen: true,
      type,
      title,
      subtitle,
      targetFilter
    });
  };

  // Seed demo data for today if needed
  const handleSeedToday = async () => {
    try {
      const res = await attendanceStore.seedRealisticScansForScope({
        mode: 'DAILY',
        date: selectedDate
      });
      if (res.success) {
        setActionMsg({ type: 'success', text: res.message });
      } else {
        setActionMsg({ type: 'error', text: res.message });
      }
    } catch (e: any) {
      setActionMsg({ type: 'error', text: e.message });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Executive Command Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5 text-xs text-slate-500">
            <span className="font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/70">
              โรงพยาบาลสามชุก จ.สุพรรณบุรี
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-600 font-medium">ระบบบริหารเวลาปฏิบัติงานและเครื่องสแกนนิ้ว</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-700 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Telemetry
            </span>
          </div>

          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            แดชบอร์ดภาพรวมการลงเวลาและเครื่องสแกน
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ติดตามสถานะการเข้างานของบุคลากรทั้งโรงพยาบาล สถิติตรงเวลา/สาย และสถานะเครื่องสแกน 3 จุดแบบเรียลไทม์
          </p>
        </div>

        {/* Global Controls & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-xl text-xs font-semibold">
            <Calendar className="w-4 h-4 text-teal-600" />
            <span>วันที่:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="font-mono text-slate-800 focus:outline-none cursor-pointer bg-white px-2 py-0.5 rounded border border-slate-200"
            />
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 px-2.5 py-1.5 rounded-xl text-xs">
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer text-xs"
            >
              <option value="ALL">ทุกกลุ่มงาน/ฝ่าย</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Sync Button (Custom Sync Modal) */}
          <button
            onClick={() => setIsSyncModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            title="กำหนดเครื่องสแกนและช่วงเวลาที่ต้องการดึงข้อมูล"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>⚡ ดึงข้อมูลสแกน</span>
          </button>

          {/* Seed Demo Button */}
          {presentCount === 0 && (
            <button
              onClick={handleSeedToday}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              title="จำลองข้อมูลสแกนนิ้วสำหรับวันนี้เพื่อดูรายงานทันที"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>🧪 จำลองสแกนวันนี้</span>
            </button>
          )}

          {/* Push to Hosoffice Quick Button */}
          {isAdmin && (
            <button
              onClick={() => onNavigate('push')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              title="ส่งข้อมูลสแกนดิบเข้าตาราง hosoffice.fingle_scan"
            >
              <Send className="w-3.5 h-3.5 text-amber-400" />
              <span>ส่ง HosOffice ({pendingScans.length})</span>
            </button>
          )}
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

      {/* Hero Metric Cards with Instant Click-to-Drill-Down */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Card 1: Total Personnel */}
        <div 
          onClick={() => handleOpenDrillDown('ALL_PERSONNEL', 'รายชื่อบุคลากรทั้งหมดในระบบ', `บุคลากรในฐานข้อมูล hosoffice.hr_person (${filteredPersonnelCount} ท่าน)`)}
          className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs hover:border-teal-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold text-slate-700">บุคลากรทั้งหมด</span>
            <Users className="w-4 h-4 text-slate-400 group-hover:text-teal-600 transition-colors" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
            {filteredPersonnelCount}
          </div>
          <div className="text-[11px] text-teal-700 font-medium mt-1 flex items-center justify-between">
            <span>ฐานข้อมูล HR</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
          </div>
        </div>

        {/* Card 2: Checked In Today */}
        <div 
          onClick={() => handleOpenDrillDown('CHECKED_IN', `บุคลากรที่มาปฏิบัติงาน วันที่ ${selectedDate}`, `สแกนเข้างานแล้ว ${presentCount} จาก ${filteredPersonnelCount} ท่าน`)}
          className="bg-white p-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/[0.15] shadow-xs hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-emerald-900">มาทำงานวันนี้</span>
            <UserCheck className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-emerald-900 tabular-nums">
            {presentCount}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1 flex items-center justify-between">
            <span>{filteredPersonnelCount > 0 ? `${((presentCount / filteredPersonnelCount) * 100).toFixed(1)}%` : '0%'} ของทั้งหมด</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
          </div>
        </div>

        {/* Card 3: On-Time */}
        <div 
          onClick={() => handleOpenDrillDown('ON_TIME', `บุคลากรที่เข้างานตรงเวลา วันที่ ${selectedDate}`, `สแกนก่อนเวลา 08:15 น. (ตรงเวลา ${onTimeCount} ท่าน)`)}
          className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs hover:border-teal-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold text-emerald-800">ปกติ (ตรงเวลา)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-emerald-800 tabular-nums">
            {onTimeCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>{presentCount > 0 ? `${((onTimeCount / presentCount) * 100).toFixed(1)}%` : '0%'} ของคนที่มา</span>
            <span className="text-teal-700 opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
          </div>
        </div>

        {/* Card 4: Late */}
        <div 
          onClick={() => handleOpenDrillDown('LATE', `บุคลากรที่มาสาย วันที่ ${selectedDate}`, `มาสายเกินเกณฑ์เวลากะ 08:15 น. (${lateCount} ท่าน, รวมสาย ${totalLateMins} นาที)`)}
          className="bg-white p-4 rounded-2xl border border-amber-300 bg-amber-500/[0.04] shadow-xs hover:border-amber-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-bold text-amber-900 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              มาสาย (Late)
            </span>
            <AlertCircle className="w-4 h-4 text-amber-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-amber-950 tabular-nums">
            {lateCount}
          </div>
          <div className="text-[11px] text-amber-800 font-medium mt-1 flex items-center justify-between">
            <span>รวม {totalLateMins} นาที</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
          </div>
        </div>

        {/* Card 5: Absent / No Scan */}
        <div 
          onClick={() => handleOpenDrillDown('NO_SCAN', `บุคลากรที่ไม่พบสแกน/ยังไม่มา วันที่ ${selectedDate}`, `ยังไม่มีบันทึกเวลาสแกนในวันนี้ (${noScanCount} ท่าน)`)}
          className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs hover:border-rose-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold text-slate-700">ไม่พบสแกน</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-700 tabular-nums">
            {noScanCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>ยังไม่มีสแกนวันนี้</span>
            <span className="text-teal-700 opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
          </div>
        </div>

        {/* Card 6: Scanners Online */}
        <div 
          onClick={() => onNavigate('scanners')}
          className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs hover:border-teal-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold text-slate-700">เครื่องสแกน</span>
            <Cpu className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
            {onlineScanners} / {totalScanners}
          </div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Online ทุกจุด
            </span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
          </div>
        </div>
      </div>

      {/* Interactive Charts Section (Requirement) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chart 1: Hourly Punch Distribution */}
        <HourlyPunchDistributionChart
          dailyData={dailyData}
          rawScans={dateScans}
          selectedDate={selectedDate}
          onHourClick={(hour) => {
            const hStr = `${String(hour).padStart(2, '0')}:00`;
            handleOpenDrillDown('HOUR', `รายชื่อผู้ลงเวลาช่วง ${hStr} น. (วันที่ ${selectedDate})`, `เจ้าหน้าที่ที่สแกนเข้า/ออกในช่วงเวลาชั่วโมงนี้`, hour);
          }}
        />

        {/* Chart 2: Attendance Status Breakdown & Donut */}
        <AttendanceStatusProportionCard
          onTime={onTimeCount}
          late={lateCount}
          noScan={noScanCount}
          total={filteredPersonnelCount}
          onFilterClick={(status) => {
            if (status === 'ON_TIME') {
              handleOpenDrillDown('ON_TIME', `รายชื่อบุคลากรเข้างานตรงเวลา วันที่ ${selectedDate}`);
            } else if (status === 'LATE') {
              handleOpenDrillDown('LATE', `รายชื่อบุคลากรมาสาย วันที่ ${selectedDate}`);
            } else if (status === 'NO_SCAN') {
              handleOpenDrillDown('NO_SCAN', `รายชื่อบุคลากรไม่พบสแกน วันที่ ${selectedDate}`);
            } else {
              handleOpenDrillDown('CHECKED_IN', `รายชื่อบุคลากรที่มาปฏิบัติงาน วันที่ ${selectedDate}`);
            }
          }}
        />
      </div>

      {/* Telemetry and Department Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Scanner Traffic Cards (2 columns on large screen) */}
        <div className="lg:col-span-2">
          <ScannerTelemetryCards
            scanners={state.scanners}
            rawScans={dateScans}
            selectedDate={selectedDate}
            onScannerClick={(machineNo) => {
              const sc = state.scanners.find(s => s.machineNo === machineNo);
              handleOpenDrillDown('SCANNER', `ประวัติสแกนจาก ${sc?.name || `เครื่อง #${machineNo}`} (วันที่ ${selectedDate})`, `รายการสแกนนิ้วที่บันทึกผ่าน IP: ${sc?.ip}:5005`, machineNo);
            }}
          />
        </div>

        {/* Department Ranking Comparison (1 column) */}
        <div>
          <DepartmentAttendanceOverview
            dailyData={dailyData}
            onDeptClick={(deptName) => {
              handleOpenDrillDown('DEPARTMENT', `บุคลากร ${deptName} (วันที่ ${selectedDate})`, `ตรวจสอบเวลาเข้า-ออกและสถานะของกลุ่มงานนี้`, deptName);
            }}
          />
        </div>
      </div>

      {/* Admin Staging Pipeline Card */}
      {isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 flex items-start justify-between shadow-xs">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                <h3 className="text-sm font-bold text-amber-950">
                  ข้อมูลรอส่งเข้า hosoffice (Staging PENDING)
                </h3>
              </div>
              <p className="text-xs text-amber-800 max-w-md leading-relaxed">
                ข้อมูลการสแกนนิ้วถูกบันทึกลง Attendance DB ของระบบก่อนอย่างปลอดภัย จะยังไม่ถูกบันทึกลงใน MySQL hosoffice จนกว่า ADMIN จะกดปุ่มส่งข้อมูล
              </p>
              <div className="pt-2 flex items-center gap-3">
                <div className="text-2xl font-black text-amber-900 font-mono tabular-nums">
                  {pendingScans.length} <span className="text-sm font-normal text-amber-700">รายการรอส่ง</span>
                </div>
                <button
                  onClick={() => onNavigate('push')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
                >
                  <span>ไปหน้าส่งข้อมูล</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="p-3 bg-amber-100 rounded-xl text-amber-700 shrink-0">
              <Send className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-start justify-between shadow-xs">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  ส่งเข้า hosoffice ครั้งล่าสุด
                </h3>
              </div>
              {lastPushBatch ? (
                <div className="space-y-1.5 pt-1 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">เวลาที่ส่ง:</span>
                    <span className="font-semibold text-slate-700 font-mono">{lastPushBatch.requestedAt}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">ผู้ส่ง (ADMIN):</span>
                    <span className="font-semibold text-slate-700">{lastPushBatch.requestedBy}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">ผลการส่ง:</span>
                    <span className="text-emerald-700 font-medium">
                      Insert สำเร็จ {lastPushBatch.totalInserted} รายการ
                      {lastPushBatch.totalSkippedExists > 0 && ` (ข้ามที่ซ้ำ ${lastPushBatch.totalSkippedExists})`}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 pt-1">ยังไม่มีประวัติการส่งเข้า hosoffice</p>
              )}
              <div className="pt-1">
                <button
                  onClick={() => onNavigate('push')}
                  className="text-xs text-teal-700 hover:text-teal-900 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>ดูประวัติ Batch ทั้งหมด</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="p-3 bg-teal-50 rounded-xl text-teal-700 shrink-0">
              <Database className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}

      {/* Recent Scans Real-time Feed */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-600" />
              <span>การสแกนนิ้วล่าสุดในระบบ (Real-Time Staging Logs)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              บันทึกทุกรายการจากเครื่องสแกน 1-3 เข้าสู่ตาราง attendance_raw_scan
            </p>
          </div>
          <button
            onClick={() => onNavigate('raw_scans')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors"
          >
            <span>ดูรายการสแกนทั้งหมด ({state.rawScans.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-y border-slate-200">
              <tr>
                <th className="py-2.5 px-3">เวลาสแกน</th>
                <th className="py-2.5 px-3">เครื่องสแกน</th>
                <th className="py-2.5 px-3">FINGLE_ID</th>
                <th className="py-2.5 px-3">ชื่อ - สกุล (HR)</th>
                <th className="py-2.5 px-3">ตำแหน่ง / หน่วยงาน</th>
                <th className="py-2.5 px-3">สถานะ HR</th>
                <th className="py-2.5 px-3 text-right">สถานะการส่ง hosoffice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {state.rawScans.slice(0, 7).map((scan, scanIdx) => (
                <tr 
                  key={`${scan.id}-${scanIdx}`} 
                  className="hover:bg-teal-50/70 transition-colors cursor-pointer group"
                  onClick={() => {
                    setPersonDrillDown({
                      isOpen: true,
                      personId: scan.personId,
                      fingleId: scan.fingleId
                    });
                  }}
                  title="คลิกเพื่อดูประวัติการสแกนและปฏิทินเวลาของเจ้าหน้าที่ท่านนี้แบบเจาะลึก"
                >
                  <td className="py-2.5 px-3 font-mono font-medium text-slate-700 whitespace-nowrap">
                    {scan.scanDateTime}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                    เครื่อง {scan.machineNo}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 group-hover:bg-teal-100 group-hover:text-teal-900 border border-slate-200 transition-colors">
                      {scan.fingleId}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span className="group-hover:text-teal-800 transition-colors">
                        {scan.hrFullname || <span className="text-slate-400 italic">ไม่ระบุ</span>}
                      </span>
                      <span className="opacity-0 group-hover:opacity-100 text-[10px] text-teal-600 transition-opacity">🔍</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 truncate max-w-xs">
                    {scan.hrPositionName ? `${scan.hrPositionName} (${scan.hrDepSubName || scan.hrDepName})` : '-'}
                  </td>
                  <td className="py-2.5 px-3">
                    {scan.hrMapped ? (
                      <span className="text-emerald-700 font-medium text-[11px]">✓ Map เจอ</span>
                    ) : (
                      <span className="text-rose-600 font-bold text-[11px]">⚠ ไม่พบใน HR</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                      scan.pushStatus === 'PUSHED' 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : scan.pushStatus === 'PENDING'
                        ? 'bg-amber-100 text-amber-900'
                        : scan.pushStatus === 'SKIPPED_EXISTS'
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {scan.pushStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Drill-Down Modal */}
      <DashboardDrillDownModal
        isOpen={drillDownModal.isOpen}
        onClose={() => setDrillDownModal(prev => ({ ...prev, isOpen: false }))}
        type={drillDownModal.type}
        title={drillDownModal.title}
        subtitle={drillDownModal.subtitle}
        dailyData={dailyData}
        rawScans={dateScans}
        targetFilter={drillDownModal.targetFilter}
        onSelectPerson={(pid) => {
          setPersonDrillDown({
            isOpen: true,
            personId: pid
          });
        }}
      />

      {/* Custom Scanner Sync Modal */}
      <CustomSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        defaultDate={selectedDate}
        onSyncComplete={(msg) => {
          setActionMsg({ type: 'success', text: msg });
        }}
      />

      {/* Employee Attendance Drill-Down Modal (Requirement 1 & 4) */}
      <PersonAttendanceDrillDownModal
        isOpen={personDrillDown.isOpen}
        onClose={() => setPersonDrillDown(prev => ({ ...prev, isOpen: false }))}
        personId={personDrillDown.personId}
        fingleId={personDrillDown.fingleId}
        month={selectedDate.substring(0, 7)}
        date={selectedDate}
        rawScans={state.rawScans}
      />
    </div>
  );
};
