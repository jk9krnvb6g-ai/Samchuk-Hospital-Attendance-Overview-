import React from 'react';
import { 
  Users, 
  Fingerprint, 
  UserCheck, 
  AlertCircle, 
  Copy, 
  Cpu, 
  Clock, 
  Send, 
  ArrowRight,
  Server,
  Database
} from 'lucide-react';
import { StoreState } from '../services/attendanceStore';
import { NavTab } from '../components/Navigation';

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
  const today = '2026-10-14';

  // Stats calculation
  const totalPersonnel = state.personnel.length;
  const todayScans = state.rawScans.filter(s => s.scanDateTime.startsWith(today));
  const uniquePersonsToday = new Set(todayScans.map(s => s.personId).filter(Boolean)).size;

  // Pending for hosoffice
  const pendingScans = state.rawScans.filter(s => s.pushStatus === 'PENDING');
  const lastPushBatch = state.pushBatches[0];

  // Scanners
  const onlineScanners = state.scanners.filter(s => s.status === 'ONLINE').length;
  const totalScanners = state.scanners.length;
  const lastSyncTime = state.syncLogs[0]?.timestamp || 'ยังไม่มีการ Sync';

  // Calculate late count from today's attendance calculation
  const uniqueFingles = Array.from(new Set(todayScans.map(s => s.fingleId)));
  let lateCount = 0;
  uniqueFingles.forEach(fid => {
    const person = state.personnel.find(p => p.fingleId === fid);
    if (!person) return;
    const scans = todayScans
      .filter(s => s.fingleId === fid)
      .sort((a, b) => a.scanDateTime.localeCompare(b.scanDateTime));
    if (scans.length > 0) {
      const firstScanTime = scans[0].scanDateTime.split(' ')[1];
      const [h, m] = firstScanTime.split(':').map(Number);
      const minutes = h * 60 + m;
      // Default shift 08:15 = 495 mins
      if (minutes > 495) lateCount++;
    }
  });

  // Calculate duplicate scans count (same person within 5 minutes)
  let duplicateScanCount = 0;
  for (let i = 0; i < todayScans.length; i++) {
    for (let j = i + 1; j < todayScans.length; j++) {
      if (todayScans[i].fingleId === todayScans[j].fingleId) {
        const t1 = new Date(todayScans[i].scanDateTime).getTime();
        const t2 = new Date(todayScans[j].scanDateTime).getTime();
        if (Math.abs(t1 - t2) <= 5 * 60 * 1000) {
          duplicateScanCount++;
          break;
        }
      }
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Enterprise Executive Command Bar */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-500">
            <span className="font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/70">
              LIVE SYSTEM
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-slate-700">โรงพยาบาลสามชุก จ.สุพรรณบุรี</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-400">HIP CMiF68S Telemetry</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            แดชบอร์ดภาพรวมการลงเวลาและเครื่องสแกน
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            เชื่อมต่อเครื่องสแกนนิ้วมือ 3 จุด บันทึกลงระบบ และประมวลผลการเข้างานตามประเภทบุคลากรแบบเรียลไทม์
          </p>
        </div>

        {isAdmin ? (
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => onNavigate('push')}
              className="flex items-center gap-2 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-bold text-xs rounded-lg shadow-2xs transition-all duration-150 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>ส่งข้อมูลเข้า hosoffice ({pendingScans.length})</span>
            </button>
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-3.5 py-2 bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white text-xs font-semibold rounded-lg shadow-2xs transition-all duration-150 cursor-pointer disabled:opacity-50"
            >
              <Fingerprint className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'กำลังดึงเวลา...' : 'Sync สแกนเนอร์'}</span>
            </button>
          </div>
        ) : (
          <div className="text-xs bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-slate-600">
            <span>ผู้ใช้งาน: </span>
            <strong className="text-slate-900">{state.currentUser.fullname}</strong>
          </div>
        )}
      </div>

      {/* ⚡ 1-Step Unified Telemetry Pipeline */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-200/80 flex items-center justify-center text-teal-800 font-bold shrink-0">
            ⚡
          </div>
          <div>
            <div className="font-bold text-slate-900 flex items-center gap-2">
              <span>กระบวนการทำงานอัตโนมัติ (Unified 1-Step Telemetry):</span>
              <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.2 rounded-full font-semibold">
                เชื่อมต่อทำงานปกติ
              </span>
            </div>
            <p className="text-slate-500 text-[11px] mt-0.5">
              ดึง Log สแกนนิ้ว ➔ บันทึก <span className="font-mono text-slate-700">attendance_raw_scan</span> ➔ ประมวลผลเวลากะและสถานะสายตามประเภทบุคลากรทันที
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
          <Clock className="w-3.5 h-3.5 text-teal-700" />
          <span>ประมวลผลล่าสุด:</span>
          <span className="font-bold text-slate-900">{state.lastAutoCalculatedAt?.split(' ')[1] || '08:00:00'}</span>
        </div>
      </div>

      {/* High-Precision SaaS KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Personnel */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs hover:border-teal-400/50 transition-all duration-150">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-medium">บุคลากรทั้งหมด</span>
            <Users className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
            {totalPersonnel}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">ในระบบ hosoffice.hr_person</div>
        </div>

        {/* Today's Scans */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs hover:border-teal-400/50 transition-all duration-150">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-medium">Scan วันนี้</span>
            <Fingerprint className="w-3.5 h-3.5 text-teal-700" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-teal-800 tabular-nums">
            {todayScans.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">รายการ (attendance_raw_scan)</div>
        </div>

        {/* Checked-in People */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs hover:border-teal-400/50 transition-all duration-150">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-medium">คนเข้างานวันนี้</span>
            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-emerald-800 tabular-nums">
            {uniquePersonsToday}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">จากทั้งหมด {totalPersonnel} คน</div>
        </div>

        {/* Late count */}
        <div className="bg-white p-3.5 rounded-xl border border-amber-300/80 bg-amber-500/[0.02] shadow-xs hover:border-amber-400 transition-all duration-150">
          <div className="flex items-center justify-between text-amber-900 text-xs font-bold mb-1">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              คนสาย (Late)
            </span>
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-amber-950 tabular-nums">
            {lateCount}
          </div>
          <div className="text-[11px] text-amber-800/80 mt-0.5">เกินเวลากะตามประเภท</div>
        </div>

        {/* Duplicate Scans */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs hover:border-teal-400/50 transition-all duration-150">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-medium">Scan ซ้ำ &le;5น.</span>
            <Copy className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-700 tabular-nums">
            {duplicateScanCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">กรองออกอัตโนมัติ</div>
        </div>

        {/* Scanners Status */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs hover:border-teal-400/50 transition-all duration-150">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-medium">เครื่องสแกน</span>
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
            {onlineScanners} / {totalScanners}
          </div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-0.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Online พร้อมใช้งาน
          </div>
        </div>
      </div>

      {/* 🆕 Section 26 - ADMIN SPECIFIC CARDS */}
      {isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card: Scan รอส่งเข้า hosoffice */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-5 flex items-start justify-between">
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-md shadow-xs cursor-pointer transition-colors"
                >
                  <span>ไปหน้าส่งข้อมูล</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="p-3 bg-amber-100 rounded-lg text-amber-700 shrink-0">
              <Send className="w-6 h-6" />
            </div>
          </div>

          {/* Card: ส่งเข้า hosoffice ล่าสุดเมื่อไหร่ โดยใคร */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between">
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
            <div className="p-3 bg-teal-50 rounded-lg text-teal-700 shrink-0">
              <Database className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}

      {/* Scanners Status Overview (Section 4 & 8) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              สถานะเครื่องสแกนลายนิ้วมือ (HIP CMiF68S)
            </h2>
            <p className="text-xs text-slate-500">
              ดึงข้อมูลผ่าน Background Service ทุก 1 นาที (Native DLL FK623Attend.dll)
            </p>
          </div>
          <div className="text-xs text-slate-400">
            Last Sync: <span className="font-mono text-slate-600">{lastSyncTime}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {state.scanners.map((scanner, scannerIdx) => (
            <div 
              key={`${scanner.id}-${scannerIdx}`}
              className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800">{scanner.name}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Online
                  </span>
                </div>
                <div className="space-y-1 text-xs text-slate-600 font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">IP & Port:</span>
                    <span>{scanner.ip}:{scanner.port}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">รุ่น / Serial:</span>
                    <span>{scanner.model} · {scanner.serial}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">Logs ที่อ่านได้:</span>
                    <span className="font-bold tabular-nums text-slate-700">{scanner.totalLoadedRecords.toLocaleString()} แถว</span>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-3 pt-2 border-t border-slate-200 flex justify-end">
                  <button
                    onClick={() => onNavigate('scanners')}
                    className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
                  >
                    จัดการเครื่อง &rarr;
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Scans Staging Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              การสแกนนิ้วล่าสุดในระบบ (Staging Data)
            </h2>
            <p className="text-xs text-slate-500">
              เก็บในตาราง attendance_raw_scan เพื่อความถูกต้องก่อนส่งเข้า hosoffice
            </p>
          </div>
          <button
            onClick={() => onNavigate('raw_scans')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 cursor-pointer"
          >
            <span>ดูทั้งหมด ({state.rawScans.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-y border-slate-200">
              <tr>
                <th className="py-2.5 px-3">เวลาสแกน (ค.ศ.)</th>
                <th className="py-2.5 px-3">เครื่อง</th>
                <th className="py-2.5 px-3">FINGLE_ID</th>
                <th className="py-2.5 px-3">ชื่อ - สกุล (HR)</th>
                <th className="py-2.5 px-3">ตำแหน่ง / หน่วยงาน</th>
                <th className="py-2.5 px-3">สถานะ HR</th>
                <th className="py-2.5 px-3 text-right">สถานะการส่ง hosoffice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {state.rawScans.slice(0, 7).map((scan, scanIdx) => (
                <tr key={`${scan.id}-${scanIdx}`} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-3 font-mono font-medium text-slate-700 whitespace-nowrap">
                    {scan.scanDateTime}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                    เครื่อง {scan.machineNo}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                    {scan.fingleId}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-800">
                    {scan.hrFullname || <span className="text-slate-400 italic">ไม่ระบุ</span>}
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
    </div>
  );
};
