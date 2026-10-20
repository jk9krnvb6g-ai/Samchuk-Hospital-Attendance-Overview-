import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  Download, 
  Users, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Cpu, 
  Filter, 
  Building2,
  ExternalLink,
  ArrowUpDown
} from 'lucide-react';
import { DailyPersonReport } from '../services/attendanceStore';
import { RawScan } from '../types/attendance';

export type DrillDownType = 
  | 'ALL_PERSONNEL'
  | 'CHECKED_IN'
  | 'ON_TIME'
  | 'LATE'
  | 'NO_SCAN'
  | 'EARLY_LEAVE'
  | 'SCANNER'
  | 'HOUR'
  | 'DEPARTMENT'
  | 'PENDING_PUSH';

interface DashboardDrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: DrillDownType;
  title: string;
  subtitle?: string;
  dailyData: DailyPersonReport[];
  rawScans?: RawScan[];
  targetFilter?: string | number; // e.g. scanner machineNo or hour or department
  onSelectPerson?: (personId: number) => void;
}

export const DashboardDrillDownModal: React.FC<DashboardDrillDownModalProps> = ({
  isOpen,
  onClose,
  type,
  title,
  subtitle,
  dailyData,
  rawScans = [],
  targetFilter,
  onSelectPerson
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [sortField, setSortField] = useState<'name' | 'time' | 'late' | 'fingle'>('time');
  const [sortAsc, setSortAsc] = useState(false);

  // Filter based on drill down type
  const baseItems = useMemo(() => {
    switch (type) {
      case 'ON_TIME':
        return dailyData.filter(d => d.status === 'ON_TIME');
      case 'LATE':
        return dailyData.filter(d => d.status === 'LATE' || d.status === 'LATE_AND_EARLY');
      case 'CHECKED_IN':
        return dailyData.filter(d => d.status !== 'NO_SCAN');
      case 'NO_SCAN':
        return dailyData.filter(d => d.status === 'NO_SCAN');
      case 'EARLY_LEAVE':
        return dailyData.filter(d => d.earlyMinutes > 0 || d.status === 'EARLY_LEAVE');
      case 'SCANNER':
        if (targetFilter) {
          const mStr = `เครื่อง ${targetFilter}`;
          return dailyData.filter(d => d.machineNames.includes(mStr));
        }
        return dailyData.filter(d => d.status !== 'NO_SCAN');
      case 'HOUR':
        if (targetFilter !== undefined) {
          const hStr = String(targetFilter).padStart(2, '0') + ':';
          return dailyData.filter(d => d.inTime.startsWith(hStr) || d.outTime.startsWith(hStr));
        }
        return dailyData;
      case 'DEPARTMENT':
        if (targetFilter) {
          return dailyData.filter(d => d.hrDepName === targetFilter || d.hrDepSubName === targetFilter);
        }
        return dailyData;
      case 'PENDING_PUSH':
        // Show people who have scans with PENDING push status
        const pendingFingleIds = new Set(rawScans.filter(s => s.pushStatus === 'PENDING').map(s => s.fingleId));
        return dailyData.filter(d => pendingFingleIds.has(d.fingleId));
      case 'ALL_PERSONNEL':
      default:
        return dailyData;
    }
  }, [type, dailyData, rawScans, targetFilter]);

  // Unique departments for filter
  const departments = useMemo(() => {
    return Array.from(new Set(baseItems.map(d => d.hrDepName))).filter(Boolean);
  }, [baseItems]);

  // Filter & Sort
  const filteredItems = useMemo(() => {
    return baseItems
      .filter(item => {
        if (deptFilter !== 'ALL' && item.hrDepName !== deptFilter) return false;
        if (searchTerm) {
          const q = searchTerm.toLowerCase();
          const matchName = item.hrFullname.toLowerCase().includes(q);
          const matchFingle = item.fingleId.toString().includes(q);
          const matchCid = item.hrCid?.includes(q);
          const matchPos = item.hrPositionName.toLowerCase().includes(q);
          if (!matchName && !matchFingle && !matchCid && !matchPos) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'name') cmp = a.hrFullname.localeCompare(b.hrFullname);
        else if (sortField === 'fingle') cmp = a.fingleId - b.fingleId;
        else if (sortField === 'late') cmp = b.lateMinutes - a.lateMinutes;
        else {
          // 'time'
          cmp = (a.inTime || '').localeCompare(b.inTime || '');
        }
        return sortAsc ? cmp : -cmp;
      });
  }, [baseItems, deptFilter, searchTerm, sortField, sortAsc]);

  if (!isOpen) return null;

  // Export CSV for this drill-down
  const handleExportCsv = () => {
    const headers = [
      'FINGLE_ID',
      'เลขประจำตัวประชาชน (HR_CID)',
      'ชื่อ - นามสกุล',
      'ตำแหน่ง',
      'กลุ่มงาน',
      'หน่วยงานย่อย',
      'ประเภทบุคลากร',
      'วันที่',
      'เวลาเข้างาน (IN)',
      'เวลาออกงาน (OUT)',
      'สถานะ',
      'สาย (นาที)',
      'ออกก่อน (นาที)',
      'ชั่วโมงทำงาน',
      'เครื่องสแกนที่บันทึก'
    ];

    const rows = filteredItems.map(d => [
      d.fingleId,
      `"${d.hrCid}"`,
      `"${d.hrFullname}"`,
      `"${d.hrPositionName}"`,
      `"${d.hrDepName}"`,
      `"${d.hrDepSubName}"`,
      `"${d.hrPersonTypeName}"`,
      d.workDate,
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
    link.setAttribute('download', `drilldown_${type.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              type === 'LATE' 
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : type === 'ON_TIME'
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                : type === 'NO_SCAN'
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                : 'bg-teal-500/20 border-teal-500/40 text-teal-400'
            }`}>
              {type === 'LATE' ? <AlertCircle className="w-5 h-5" /> :
               type === 'ON_TIME' ? <CheckCircle className="w-5 h-5" /> :
               type === 'NO_SCAN' ? <Clock className="w-5 h-5" /> :
               type === 'SCANNER' ? <Cpu className="w-5 h-5" /> :
               <Users className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-white/10 text-teal-200 border border-white/10">
                  {filteredItems.length} ท่าน
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {subtitle || 'คลิกที่รายการเพื่อดูข้อมูลเชิงลึกหรือส่งออกข้อมูลเป็น CSV เพื่อวิเคราะห์'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold border border-white/15 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-teal-300" />
              <span>ส่งออก CSV</span>
            </button>
            <button 
              onClick={onClose}
              className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar & Filter Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="ค้นหาชื่อ, FINGLE_ID, เลขบัตร, ตำแหน่ง..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 font-sans"
            />
          </div>

          <div>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
            >
              <option value="ALL">ทุกกลุ่มงาน/ฝ่าย ({departments.length})</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[11px] shrink-0">เรียงตาม:</span>
            <div className="flex-1 flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => {
                  if (sortField === 'time') setSortAsc(!sortAsc);
                  else { setSortField('time'); setSortAsc(true); }
                }}
                className={`flex-1 py-1 text-center rounded text-[11px] font-medium transition-colors ${
                  sortField === 'time' ? 'bg-teal-50 text-teal-800 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                เวลาเข้า {sortField === 'time' ? (sortAsc ? '↑' : '↓') : ''}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (sortField === 'late') setSortAsc(!sortAsc);
                  else { setSortField('late'); setSortAsc(false); }
                }}
                className={`flex-1 py-1 text-center rounded text-[11px] font-medium transition-colors ${
                  sortField === 'late' ? 'bg-teal-50 text-teal-800 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                นาทีสาย {sortField === 'late' ? (sortAsc ? '↑' : '↓') : ''}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (sortField === 'fingle') setSortAsc(!sortAsc);
                  else { setSortField('fingle'); setSortAsc(true); }
                }}
                className={`flex-1 py-1 text-center rounded text-[11px] font-medium transition-colors ${
                  sortField === 'fingle' ? 'bg-teal-50 text-teal-800 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                รหัส Fingle {sortField === 'fingle' ? (sortAsc ? '↑' : '↓') : ''}
              </button>
            </div>
          </div>
        </div>

        {/* Modal Content Table */}
        <div className="flex-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs space-y-2">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="font-semibold text-slate-700">ไม่พบรายการที่ตรงกับเงื่อนไข</div>
              <p className="text-[11px] text-slate-400">ลองเปลี่ยนคำค้นหา หรือเลือกกลุ่มงานอื่น</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3">FINGLE_ID</th>
                  <th className="py-2.5 px-3">ชื่อ - สกุล</th>
                  <th className="py-2.5 px-3">ตำแหน่ง / หน่วยงาน</th>
                  <th className="py-2.5 px-3 text-center">สแกนเข้า (IN)</th>
                  <th className="py-2.5 px-3 text-center">สแกนออก (OUT)</th>
                  <th className="py-2.5 px-3 text-center">ชั่วโมงทำงาน</th>
                  <th className="py-2.5 px-3 text-center">สถานะ</th>
                  <th className="py-2.5 px-3 text-right">เครื่องสแกน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item, idx) => (
                  <tr 
                    key={`${item.personId}-${idx}`}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    onClick={() => onSelectPerson && onSelectPerson(item.personId)}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                      {item.fingleId}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                      {item.hrFullname}
                      <div className="text-[10px] text-slate-400 font-mono font-normal">CID: {item.hrCid}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <div>{item.hrPositionName}</div>
                      <div className="text-[10px] text-teal-700 font-medium">{item.hrDepSubName || item.hrDepName}</div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                      {item.inTime !== '-' ? (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                          {item.inTime} น.
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                      {item.outTime !== '-' ? (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                          {item.outTime} น.
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-700">
                      {item.hoursWorked > 0 ? `${item.hoursWorked} ชม.` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        item.status === 'ON_TIME'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : item.status === 'LATE' || item.status === 'LATE_AND_EARLY'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : item.status === 'EARLY_LEAVE'
                          ? 'bg-orange-100 text-orange-800 border border-orange-300'
                          : item.status === 'IN_ONLY' || item.status === 'OUT_ONLY'
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        {item.statusLabel}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500 text-[11px] font-mono">
                      {item.machineNames}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div>
            แสดง {filteredItems.length} จาก {baseItems.length} รายการในกลุ่มนี้
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
