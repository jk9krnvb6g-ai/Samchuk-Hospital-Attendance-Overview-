import React, { useState } from 'react';
import { 
  Fingerprint, 
  Search, 
  Filter, 
  Calendar, 
  RefreshCw, 
  Download, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Info,
  Layers,
  Link2
} from 'lucide-react';
import { StoreState, attendanceStore } from '../services/attendanceStore';
import { PushStatus, RawScan, HrPerson } from '../types/attendance';
import { QuickMapModal } from '../components/QuickMapModal';

interface RawScansPageProps {
  state: StoreState;
  onSync: () => void;
  isSyncing: boolean;
}

export const RawScansPage: React.FC<RawScansPageProps> = ({
  state,
  onSync,
  isSyncing
}) => {
  const isAdmin = state.currentUser.role === 'ADMIN';

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [machineFilter, setMachineFilter] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>('');
  
  // Quick Map State
  const [quickMapScan, setQuickMapScan] = useState<RawScan | null>(null);
  const [mapSuccessNotice, setMapSuccessNotice] = useState<string | null>(null);

  // Filtered scans
  const filteredScans = state.rawScans.filter((scan) => {
    // Search
    if (searchTerm) {
      const matchName = scan.hrFullname?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchFingle = scan.fingleId.toString().includes(searchTerm);
      const matchDep = scan.hrDepName?.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchName && !matchFingle && !matchDep) return false;
    }

    // Status
    if (statusFilter !== 'ALL' && scan.pushStatus !== statusFilter) {
      return false;
    }

    // Machine
    if (machineFilter !== 'ALL' && scan.machineNo.toString() !== machineFilter) {
      return false;
    }

    // Date
    if (selectedDate && !scan.scanDateTime.startsWith(selectedDate)) {
      return false;
    }

    return true;
  });

  // Export CSV
  const handleExportCsv = () => {
    const headers = [
      'ID',
      'MachineNo',
      'DeviceIP',
      'FingleID',
      'ScanDateTime(AD)',
      'VerifyMode',
      'InOutMode',
      'HRFullname',
      'Position',
      'Department',
      'HRMapped',
      'PushStatus',
      'ReceivedAt'
    ];

    const rows = filteredScans.map(s => [
      s.id,
      s.machineNo,
      s.deviceIp,
      s.fingleId,
      s.scanDateTime,
      s.verifyMode,
      s.inOutMode,
      `"${s.hrFullname || ''}"`,
      `"${s.hrPositionName || ''}"`,
      `"${s.hrDepName || ''}"`,
      s.hrMapped ? 'YES' : 'NO',
      s.pushStatus,
      s.receivedAt
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `samchuk_raw_scans_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Title & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-mono font-medium mb-1">
            <span>ตาราง: attendance_raw_scan (Staging Database)</span>
          </div>
          <h2 className="text-base font-bold text-slate-800">
            บันทึกการสแกนนิ้วดิบจากเครื่องสแกน (Raw Scan Staging)
          </h2>
          <p className="text-xs text-slate-500">
            ข้อมูลที่อ่านจากเครื่องสแกน 1-3 จะเก็บทุกรายการในตารางนี้ก่อน ไม่เดา IN/OUT และยังไม่ลง hosoffice
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>ส่งออก CSV ({filteredScans.length})</span>
          </button>

          {isAdmin && (
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'กำลังดึง...' : 'ดึง Log จากเครื่องสแกน'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ, FINGLE_ID, แผนก..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        {/* Date Filter */}
        <div className="relative">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
          />
          {selectedDate && (
            <button
              onClick={() => setSelectedDate('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Machine Filter */}
        <div>
          <select
            value={machineFilter}
            onChange={(e) => setMachineFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
          >
            <option value="ALL">เครื่องสแกนทั้งหมด (1, 2, 3)</option>
            <option value="1">เครื่อง 1 (หน้าตึกอำนวยการ)</option>
            <option value="2">เครื่อง 2 (ตึกฉุกเฉิน ER)</option>
            <option value="3">เครื่อง 3 (ตึกผู้ป่วยใน IPD)</option>
          </select>
        </div>

        {/* Push Status Filter */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
          >
            <option value="ALL">สถานะส่ง hosoffice ทั้งหมด</option>
            <option value="PENDING">PENDING (รอ ADMIN กดส่ง)</option>
            <option value="PUSHED">PUSHED (ส่งเข้า hosoffice แล้ว)</option>
            <option value="SKIPPED_EXISTS">SKIPPED_EXISTS (ข้ามเพราะมีอยู่แล้ว)</option>
            <option value="EXCLUDED">EXCLUDED (ยกเว้น/ไม่พบ HR)</option>
            <option value="FAILED">FAILED (ล้มเหลว)</option>
          </select>
        </div>
      </div>

      {/* Raw Scans Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700">
            แสดง {filteredScans.length} รายการ (จากทั้งหมด {state.rawScans.length})
          </span>
          <span className="text-slate-500">
            * เวลาสแกนแสดงเป็น ค.ศ. ตามมาตรฐานเครื่องสแกน HIP CMiF68S
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">วัน-เวลาสแกน (SCAN_DATE_TIME)</th>
                <th className="py-2.5 px-3">เครื่อง</th>
                <th className="py-2.5 px-3">FINGLE_ID</th>
                <th className="py-2.5 px-3">ชื่อ - นามสกุล (HR Snapshot)</th>
                <th className="py-2.5 px-3">ตำแหน่ง / หน่วยงาน</th>
                <th className="py-2.5 px-3">โหมด</th>
                <th className="py-2.5 px-3">Map HR</th>
                <th className="py-2.5 px-3">เวลาที่ดึงเข้าระบบ</th>
                <th className="py-2.5 px-3 text-right">สถานะ hosoffice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredScans.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    ไม่พบข้อมูลการสแกนตามเงื่อนไขที่เลือก
                  </td>
                </tr>
              ) : (
                filteredScans.map((scan, scanIdx) => (
                  <tr key={`${scan.id}-${scanIdx}`} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-800 whitespace-nowrap">
                      {scan.scanDateTime}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                      เครื่อง {scan.machineNo}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                      {scan.fingleId}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">
                      {scan.hrFullname || <span className="text-rose-500 font-bold">ไม่พบใน HR</span>}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 truncate max-w-xs">
                      {scan.hrPositionName ? `${scan.hrPositionName} (${scan.hrDepSubName || scan.hrDepName})` : '-'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                      V:{scan.verifyMode} / IO:{scan.inOutMode}
                    </td>
                    <td className="py-2.5 px-3">
                      {scan.hrMapped ? (
                        <span className="text-emerald-700 font-semibold text-[11px]">✓ Mapped</span>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-rose-600 font-bold text-[11px]">⚠ Unmapped</span>
                          {isAdmin && (
                            <button
                              onClick={() => setQuickMapScan(scan)}
                              className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                              title="จับคู่รหัสสแกนนิ้วนี้เข้ากับบุคลากรในตาราง hr_person ทันที"
                            >
                              <Link2 className="w-3 h-3" />
                              <span>Quick Map</span>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {scan.receivedAt.split(' ')[1]}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                        scan.pushStatus === 'PUSHED' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : scan.pushStatus === 'PENDING'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : scan.pushStatus === 'SKIPPED_EXISTS'
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-rose-100 text-rose-800'
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

      {/* Quick Map Modal */}
      {quickMapScan && (
        <QuickMapModal
          isOpen={true}
          onClose={() => setQuickMapScan(null)}
          fingleId={quickMapScan.fingleId}
          scanTime={quickMapScan.scanDateTime}
          machineNo={quickMapScan.machineNo}
          personnelList={state.personnel}
          currentUser={state.currentUser}
          onSuccess={(person, updatedCount) => {
            setMapSuccessNotice(`✓ จับคู่รหัสสแกนนิ้ว FINGLE #${quickMapScan.fingleId} เข้ากับ ${person.hrFullname} สำเร็จ! อัปเดต ${updatedCount} รายการสแกน`);
            setTimeout(() => setMapSuccessNotice(null), 5000);
          }}
        />
      )}

      {/* Success Notification Alert */}
      {mapSuccessNotice && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-900 text-white text-xs px-5 py-3 rounded-xl shadow-xl border border-emerald-700 flex items-center gap-3">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{mapSuccessNotice}</span>
        </div>
      )}
    </div>
  );
};
