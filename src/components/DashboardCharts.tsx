import React from 'react';
import { 
  Clock, 
  TrendingUp, 
  Cpu, 
  Building2, 
  ArrowUpRight, 
  ChevronRight, 
  Users,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { DailyPersonReport } from '../services/attendanceStore';
import { RawScan, Scanner } from '../types/attendance';

interface HourlyChartProps {
  dailyData: DailyPersonReport[];
  rawScans: RawScan[];
  selectedDate: string;
  onHourClick: (hour: number) => void;
}

export const HourlyPunchDistributionChart: React.FC<HourlyChartProps> = ({
  dailyData,
  rawScans,
  selectedDate,
  onHourClick
}) => {
  // Compute scans per hour from 06:00 to 19:00
  const hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  
  const hourData = hours.map(h => {
    const hStr = String(h).padStart(2, '0');
    // Find all raw scans in this hour
    const inScans = rawScans.filter(s => {
      const timePart = (s.scanDateTime || '').replace('T', ' ').split(' ')[1] || '';
      return s.scanDateTime.startsWith(selectedDate) && timePart.startsWith(hStr) && s.inOutMode === 0;
    });

    const outScans = rawScans.filter(s => {
      const timePart = (s.scanDateTime || '').replace('T', ' ').split(' ')[1] || '';
      return s.scanDateTime.startsWith(selectedDate) && timePart.startsWith(hStr) && s.inOutMode === 1;
    });

    // Also look at dailyData
    const onTimeIn = dailyData.filter(d => d.inTime.startsWith(`${hStr}:`) && d.status === 'ON_TIME').length;
    const lateIn = dailyData.filter(d => d.inTime.startsWith(`${hStr}:`) && (d.status === 'LATE' || d.status === 'LATE_AND_EARLY')).length;
    const regularOut = dailyData.filter(d => d.outTime.startsWith(`${hStr}:`)).length;

    const total = Math.max(inScans.length + outScans.length, onTimeIn + lateIn + regularOut);

    return {
      hour: h,
      label: `${hStr}:00`,
      onTime: onTimeIn,
      late: lateIn,
      out: regularOut,
      total
    };
  });

  const maxTotal = Math.max(...hourData.map(d => d.total), 1);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-teal-600" />
            <span>การกระจายตัวของเวลาสแกนตลอดวัน (Hourly Scan Distribution)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            คลิกที่แท่งเวลาเพื่อดิวดาวน์ดูรายชื่อเจ้าหน้าที่ที่สแกนในแต่ละชั่วโมง
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
            <span>ตรงเวลา</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span>
            <span>มาสาย</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500"></span>
            <span>สแกนออก</span>
          </div>
        </div>
      </div>

      {/* Chart Bars */}
      <div className="h-44 flex items-end gap-2 pt-6 pb-1 border-b border-slate-200">
        {hourData.map((d) => {
          const heightPercent = Math.min(100, Math.max(8, (d.total / maxTotal) * 100));
          const onTimeHeight = d.total > 0 ? (d.onTime / d.total) * 100 : 0;
          const lateHeight = d.total > 0 ? (d.late / d.total) * 100 : 0;
          const outHeight = d.total > 0 ? (d.out / d.total) * 100 : 0;

          return (
            <div
              key={d.hour}
              onClick={() => onHourClick(d.hour)}
              className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative"
              title={`ช่วงเวลา ${d.label} น.: รวม ${d.total} ครั้ง (ตรงเวลา ${d.onTime}, สาย ${d.late}, ออก ${d.out})`}
            >
              {/* Tooltip on hover */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-10 bg-slate-900 text-white text-[10px] py-1 px-2 rounded shadow-md pointer-events-none whitespace-nowrap z-20">
                <span className="font-bold">{d.label} น.</span>: {d.total} ครั้ง
                {d.late > 0 && <span className="text-amber-400"> (สาย {d.late})</span>}
              </div>

              {/* Total label above bar */}
              {d.total > 0 && (
                <span className="text-[10px] font-mono text-slate-500 group-hover:text-teal-700 font-semibold mb-1 tabular-nums">
                  {d.total}
                </span>
              )}

              {/* Stacked bar container */}
              <div 
                className="w-full max-w-[28px] rounded-t-md overflow-hidden bg-slate-100 flex flex-col justify-end group-hover:ring-2 group-hover:ring-teal-500 transition-all shadow-2xs"
                style={{ height: `${heightPercent}%` }}
              >
                {d.out > 0 && (
                  <div 
                    className="w-full bg-blue-500/90 transition-all" 
                    style={{ height: `${outHeight}%` }}
                  />
                )}
                {d.late > 0 && (
                  <div 
                    className="w-full bg-amber-500 transition-all" 
                    style={{ height: `${lateHeight}%` }}
                  />
                )}
                {d.onTime > 0 && (
                  <div 
                    className="w-full bg-emerald-500 transition-all" 
                    style={{ height: `${onTimeHeight}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* X-Axis Labels */}
      <div className="flex items-center gap-2 pt-2 text-[10px] font-mono text-slate-500">
        {hourData.map(d => (
          <div key={d.hour} className="flex-1 text-center font-medium">
            {d.hour}น.
          </div>
        ))}
      </div>
    </div>
  );
};

interface StatusDonutProps {
  onTime: number;
  late: number;
  noScan: number;
  total: number;
  onFilterClick: (status: 'ON_TIME' | 'LATE' | 'NO_SCAN' | 'CHECKED_IN') => void;
}

export const AttendanceStatusProportionCard: React.FC<StatusDonutProps> = ({
  onTime,
  late,
  noScan,
  total,
  onFilterClick
}) => {
  const present = onTime + late;
  const onTimeRate = present > 0 ? ((onTime / present) * 100).toFixed(1) : '0.0';
  const presentRate = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-600" />
            <span>สัดส่วนสถานะการลงเวลา (Status Breakdown)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            คลิกสถานะใดก็ได้เพื่อเปิดรายชื่อผู้ที่อยู่ในกลุ่มนั้นทันที
          </p>
        </div>
      </div>

      {/* Progress Multi-Bar */}
      <div className="space-y-4 my-2">
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
            <span className="text-slate-700">อัตราการมาปฏิบัติงาน:</span>
            <span className="font-mono font-bold text-slate-900">{present} / {total} ท่าน ({presentRate}%)</span>
          </div>
          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
            <div 
              style={{ width: `${total > 0 ? (onTime / total) * 100 : 0}%` }} 
              className="bg-emerald-500 transition-all duration-500"
              title={`ตรงเวลา ${onTime} คน`}
            />
            <div 
              style={{ width: `${total > 0 ? (late / total) * 100 : 0}%` }} 
              className="bg-amber-500 transition-all duration-500"
              title={`มาสาย ${late} คน`}
            />
            <div 
              style={{ width: `${total > 0 ? (noScan / total) * 100 : 0}%` }} 
              className="bg-slate-300 transition-all duration-500"
              title={`ไม่พบสแกน ${noScan} คน`}
            />
          </div>
        </div>

        {/* Clickable Status Cards */}
        <div className="grid grid-cols-3 gap-2.5 pt-1 text-xs">
          <button
            type="button"
            onClick={() => onFilterClick('ON_TIME')}
            className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/70 text-left transition-colors cursor-pointer group shadow-2xs"
          >
            <div className="flex items-center justify-between text-emerald-800 text-[11px] font-semibold">
              <span>ปกติ (ตรงเวลา)</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-900 mt-1 tabular-nums">
              {onTime}
            </div>
            <div className="text-[10px] text-emerald-700 font-medium mt-0.5 font-mono">
              {onTimeRate}% ของคนที่มา
            </div>
          </button>

          <button
            type="button"
            onClick={() => onFilterClick('LATE')}
            className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-100/70 text-left transition-colors cursor-pointer group shadow-2xs"
          >
            <div className="flex items-center justify-between text-amber-800 text-[11px] font-semibold">
              <span>มาสาย (Late)</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
            </div>
            <div className="text-xl font-bold font-mono text-amber-950 mt-1 tabular-nums">
              {late}
            </div>
            <div className="text-[10px] text-amber-800 font-medium mt-0.5">
              เกิน 08:15 น.
            </div>
          </button>

          <button
            type="button"
            onClick={() => onFilterClick('NO_SCAN')}
            className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-left transition-colors cursor-pointer group shadow-2xs"
          >
            <div className="flex items-center justify-between text-slate-600 text-[11px] font-semibold">
              <span>ไม่พบสแกน</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
            </div>
            <div className="text-xl font-bold font-mono text-slate-800 mt-1 tabular-nums">
              {noScan}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
              ยังไม่มีการสแกน
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

interface ScannerCardsProps {
  scanners: Scanner[];
  rawScans: RawScan[];
  selectedDate: string;
  onScannerClick: (machineNo: number) => void;
}

export const ScannerTelemetryCards: React.FC<ScannerCardsProps> = ({
  scanners,
  rawScans,
  selectedDate,
  onScannerClick
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-teal-600" />
            <span>สถานะและปริมาณการใช้งานเครื่องสแกน 3 จุด (HIP CMiF68S Telemetry)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            คลิกที่การ์ดเครื่องเพื่อดูประวัติสแกนเฉพาะเครื่องนั้น
          </p>
        </div>
        <div className="text-xs font-mono text-slate-500">
          Sync Socket: <span className="font-semibold text-emerald-700">Port 5005 Active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {scanners.map((sc) => {
          // Count scans today for this machine
          const machineTodayScans = rawScans.filter(s => 
            s.machineNo === sc.machineNo && s.scanDateTime.startsWith(selectedDate)
          );

          return (
            <div
              key={sc.machineNo}
              onClick={() => onScannerClick(sc.machineNo)}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-teal-50/40 hover:border-teal-300 transition-all cursor-pointer group shadow-2xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-xs text-slate-900 group-hover:text-teal-900">
                    {sc.name}
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Online
                  </span>
                </div>

                <div className="space-y-1 text-[11px] text-slate-600 font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">IP Address:</span>
                    <span>{sc.ip}:5005</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">โมเดล:</span>
                    <span>{sc.model}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">สแกนวันนี้:</span>
                    <span className="font-bold text-teal-800">{machineTodayScans.length} รายการ</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">รวม Logs: {sc.totalLoadedRecords.toLocaleString()} แถว</span>
                <span className="text-teal-700 font-semibold group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
                  ดิวดาวน์ &rarr;
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface DeptChartProps {
  dailyData: DailyPersonReport[];
  onDeptClick: (deptName: string) => void;
}

export const DepartmentAttendanceOverview: React.FC<DeptChartProps> = ({
  dailyData,
  onDeptClick
}) => {
  // Aggregate by department
  const deptMap = new Map<string, { total: number; present: number; onTime: number; late: number }>();

  dailyData.forEach(d => {
    const dep = d.hrDepName || 'อื่นๆ';
    const cur = deptMap.get(dep) || { total: 0, present: 0, onTime: 0, late: 0 };
    cur.total++;
    if (d.status !== 'NO_SCAN') {
      cur.present++;
      if (d.status === 'ON_TIME') cur.onTime++;
      if (d.status === 'LATE' || d.status === 'LATE_AND_EARLY') cur.late++;
    }
    deptMap.set(dep, cur);
  });

  const deptList = Array.from(deptMap.entries())
    .map(([name, stat]) => ({
      name,
      ...stat,
      rate: stat.total > 0 ? Math.round((stat.present / stat.total) * 100) : 0
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-600" />
            <span>สถิติการมาปฏิบัติงานแยกตามกลุ่มงาน (Department Ranking)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            คลิกที่แถบกลุ่มงานเพื่อดิวดาวน์ดูรายชื่อเจ้าหน้าที่ในฝ่ายนั้น
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {deptList.map(dep => (
          <div
            key={dep.name}
            onClick={() => onDeptClick(dep.name)}
            className="p-2.5 rounded-xl border border-slate-100 hover:border-teal-300 hover:bg-slate-50/80 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-800 group-hover:text-teal-900 flex items-center gap-1.5">
                <span>{dep.name}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-700 group-hover:translate-x-0.5 transition-all" />
              </span>
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span className="text-slate-600 font-semibold">{dep.present}/{dep.total} ท่าน ({dep.rate}%)</span>
                {dep.late > 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold">
                    สาย {dep.late}
                  </span>
                )}
              </div>
            </div>

            {/* Horizontal Bar */}
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
              <div 
                style={{ width: `${dep.total > 0 ? (dep.onTime / dep.total) * 100 : 0}%` }}
                className="bg-teal-600 transition-all duration-300"
              />
              <div 
                style={{ width: `${dep.total > 0 ? (dep.late / dep.total) * 100 : 0}%` }}
                className="bg-amber-500 transition-all duration-300"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
