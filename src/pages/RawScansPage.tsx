import React, { useState } from 'react';
import { 
  Fingerprint, 
  Search, 
  Calendar, 
  RefreshCw, 
  Download, 
  CheckCircle, 
  Link2
} from 'lucide-react';
import { StoreState, attendanceStore } from '../services/attendanceStore';
import { PushStatus, RawScan } from '../types/attendance';
import { QuickMapModal } from '../components/QuickMapModal';
import { CustomSyncModal } from '../components/CustomSyncModal';
import { DataTablePagination, PageSizeOption } from '../components/DataTablePagination';
import { TableHeaderFilterCell, ColumnSortConfig } from '../components/TableHeaderFilterCell';

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
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  
  // Quick Map State
  const [quickMapScan, setQuickMapScan] = useState<RawScan | null>(null);
  const [mapSuccessNotice, setMapSuccessNotice] = useState<string | null>(null);

  // Pagination & Column Header Filters (Default 10 rows)
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [showColumnFilters, setShowColumnFilters] = useState<boolean>(true);
  const [sortConfig, setSortConfig] = useState<ColumnSortConfig | null>({ key: 'scanDateTime', direction: 'desc' });
  const [colFilters, setColFilters] = useState<Record<string, string>>({
    scanDateTime: '',
    machineNo: '',
    fingleId: '',
    hrFullname: '',
    hrDepName: '',
    hrMapped: '',
    pushStatus: '',
  });

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (!prev || prev.key !== key) {
        return { key, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return null;
    });
  };

  const handleColFilterChange = (key: string, value: string) => {
    setColFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setColFilters({
      scanDateTime: '',
      machineNo: '',
      fingleId: '',
      hrFullname: '',
      hrDepName: '',
      hrMapped: '',
      pushStatus: '',
    });
    setSearchTerm('');
    setStatusFilter('ALL');
    setMachineFilter('ALL');
    setSelectedDate('');
    setCurrentPage(1);
  };

  const activeColFilterCount = Object.values(colFilters).filter(v => v.trim() !== '').length;

  // Filtered scans
  const filteredScans = state.rawScans.filter((scan) => {
    // Toolbar Search
    if (searchTerm) {
      const matchName = scan.hrFullname?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchFingle = scan.fingleId.toString().includes(searchTerm);
      const matchDep = scan.hrDepName?.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchName && !matchFingle && !matchDep) return false;
    }

    // Toolbar Status
    if (statusFilter !== 'ALL' && scan.pushStatus !== statusFilter) {
      return false;
    }

    // Toolbar Machine
    if (machineFilter !== 'ALL' && scan.machineNo.toString() !== machineFilter) {
      return false;
    }

    // Toolbar Date
    if (selectedDate && !scan.scanDateTime.startsWith(selectedDate)) {
      return false;
    }

    // Column Header Filters
    if (colFilters.scanDateTime && !scan.scanDateTime.toLowerCase().includes(colFilters.scanDateTime.toLowerCase())) {
      return false;
    }
    if (colFilters.machineNo && scan.machineNo.toString() !== colFilters.machineNo) {
      return false;
    }
    if (colFilters.fingleId && !scan.fingleId.toString().includes(colFilters.fingleId)) {
      return false;
    }
    if (colFilters.hrFullname && !(scan.hrFullname || '').toLowerCase().includes(colFilters.hrFullname.toLowerCase())) {
      return false;
    }
    if (colFilters.hrDepName) {
      const q = colFilters.hrDepName.toLowerCase();
      const depMatch = (scan.hrDepName || '').toLowerCase().includes(q);
      const subMatch = (scan.hrDepSubName || '').toLowerCase().includes(q);
      const posMatch = (scan.hrPositionName || '').toLowerCase().includes(q);
      if (!depMatch && !subMatch && !posMatch) return false;
    }
    if (colFilters.hrMapped) {
      if (colFilters.hrMapped === 'MAPPED' && !scan.hrMapped) return false;
      if (colFilters.hrMapped === 'UNMAPPED' && scan.hrMapped) return false;
    }
    if (colFilters.pushStatus && scan.pushStatus !== colFilters.pushStatus) {
      return false;
    }

    return true;
  });

  // Sorted scans
  const sortedScans = [...filteredScans].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    let aVal: any = (a as any)[key];
    let bVal: any = (b as any)[key];

    if (aVal === undefined || aVal === null) aVal = '';
    if (bVal === undefined || bVal === null) bVal = '';

    let comp = 0;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      comp = aVal - bVal;
    } else {
      comp = String(aVal).localeCompare(String(bVal));
    }
    return direction === 'asc' ? comp : -comp;
  });

  // Paginated scans
  const effectiveSize = pageSize === -1 ? Math.max(sortedScans.length, 1) : pageSize;
  const paginatedScans = pageSize === -1
    ? sortedScans
    : sortedScans.slice((currentPage - 1) * effectiveSize, currentPage * effectiveSize);

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
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>MySQL 10.2.0.201 : attendance_raw_scan ({state.rawScans.length} รายการ)</span>
            </span>
          </div>
          <h2 className="text-base font-bold text-slate-800">
            บันทึกการสแกนนิ้วดิบจากเครื่องสแกน (Raw Scan Staging DB)
          </h2>
          <p className="text-xs text-slate-500">
            ข้อมูลที่อ่านจากเครื่องสแกน 1-3 จะเก็บทุกรายการในตาราง attendance_raw_scan ของ MySQL 10.2.0.201 โดยตรง
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => attendanceStore.loadFromMySqlDb()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-xs cursor-pointer border border-slate-300"
            title="ดึงข้อมูลสแกนสดจาก MySQL attendance_raw_scan"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>โหลดสดจาก MySQL</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>ส่งออก CSV ({filteredScans.length})</span>
          </button>

          {isAdmin && (
            <>
              <button
                onClick={() => setIsSyncModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
                title="เลือกเครื่องสแกนและกำหนดช่วงเวลา/วัน/เดือน/ปี ที่ต้องการดึงข้อมูล"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>⚡ ดึงข้อมูลตามเงื่อนไข (กำหนดเครื่อง/วันที่)</span>
              </button>

              <button
                onClick={onSync}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
                title="ดึงข้อมูลจากเครื่องสแกนและบันทึกลง MySQL attendance_raw_scan ทันที"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'กำลังดึง...' : 'ดึงด่วน'}</span>
              </button>
            </>
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
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <TableHeaderFilterCell
                  title="เวลาสแกนนิ้วจริง (SCAN TIME)"
                  columnKey="scanDateTime"
                  sortable={true}
                  currentSort={sortConfig}
                  onSort={handleSort}
                  filterValue={colFilters.scanDateTime}
                  onFilterChange={(v) => handleColFilterChange('scanDateTime', v)}
                  filterType="text"
                  placeholder="ค้นเวลาเช่น 14 08:..."
                  showFilterRow={showColumnFilters}
                  className="bg-teal-50/90 text-teal-950 border-r border-teal-100 whitespace-nowrap min-w-[190px]"
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <Fingerprint className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                    <span>เวลาสแกนนิ้วจริง (SCAN TIME)</span>
                  </div>
                </TableHeaderFilterCell>

                <TableHeaderFilterCell
                  title="เครื่อง"
                  columnKey="machineNo"
                  sortable={true}
                  currentSort={sortConfig}
                  onSort={handleSort}
                  filterValue={colFilters.machineNo}
                  onFilterChange={(v) => handleColFilterChange('machineNo', v)}
                  filterType="select"
                  selectOptions={[
                    { label: 'เครื่อง 1 (ตึกอำนวยการ)', value: '1' },
                    { label: 'เครื่อง 2 (ตึกฉุกเฉิน ER)', value: '2' },
                    { label: 'เครื่อง 3 (ตึก IPD)', value: '3' },
                  ]}
                  showFilterRow={showColumnFilters}
                  className="whitespace-nowrap min-w-[120px]"
                />

                <TableHeaderFilterCell
                  title="FINGLE_ID"
                  columnKey="fingleId"
                  sortable={true}
                  currentSort={sortConfig}
                  onSort={handleSort}
                  filterValue={colFilters.fingleId}
                  onFilterChange={(v) => handleColFilterChange('fingleId', v)}
                  filterType="text"
                  placeholder="รหัส..."
                  showFilterRow={showColumnFilters}
                  className="whitespace-nowrap min-w-[90px]"
                />

                <TableHeaderFilterCell
                  title="ชื่อ - นามสกุล (HR)"
                  columnKey="hrFullname"
                  sortable={true}
                  currentSort={sortConfig}
                  onSort={handleSort}
                  filterValue={colFilters.hrFullname}
                  onFilterChange={(v) => handleColFilterChange('hrFullname', v)}
                  filterType="text"
                  placeholder="ค้นชื่อ..."
                  showFilterRow={showColumnFilters}
                  className="min-w-[180px]"
                />

                <TableHeaderFilterCell
                  title="ตำแหน่ง / หน่วยงาน"
                  columnKey="hrDepName"
                  sortable={true}
                  currentSort={sortConfig}
                  onSort={handleSort}
                  filterValue={colFilters.hrDepName}
                  onFilterChange={(v) => handleColFilterChange('hrDepName', v)}
                  filterType="text"
                  placeholder="ค้นหน่วยงาน..."
                  showFilterRow={showColumnFilters}
                  className="min-w-[160px]"
                />

                <th className="py-2.5 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  <div>โหมด</div>
                  {showColumnFilters && <div className="mt-1.5 text-[10px] text-slate-400 font-normal">V/IO</div>}
                </th>

                <TableHeaderFilterCell
                  title="Map HR"
                  columnKey="hrMapped"
                  sortable={false}
                  currentSort={sortConfig}
                  onSort={handleSort}
                  filterValue={colFilters.hrMapped}
                  onFilterChange={(v) => handleColFilterChange('hrMapped', v)}
                  filterType="select"
                  selectOptions={[
                    { label: '✓ Mapped แล้ว', value: 'MAPPED' },
                    { label: '⚠ Unmapped (ยังไม่ผูก)', value: 'UNMAPPED' },
                  ]}
                  showFilterRow={showColumnFilters}
                  className="whitespace-nowrap min-w-[110px]"
                />

                <th className="py-2.5 px-3 text-slate-500 font-normal whitespace-nowrap">
                  <div>เวลาที่ดึงเข้าระบบ (Sync)</div>
                  {showColumnFilters && <div className="mt-1.5 text-[10px] text-slate-400 font-normal">Auto Sync</div>}
                </th>

                <TableHeaderFilterCell
                  title="สถานะ hosoffice"
                  columnKey="pushStatus"
                  sortable={true}
                  currentSort={sortConfig}
                  onSort={handleSort}
                  filterValue={colFilters.pushStatus}
                  onFilterChange={(v) => handleColFilterChange('pushStatus', v)}
                  filterType="select"
                  selectOptions={[
                    { label: 'PUSHED', value: 'PUSHED' },
                    { label: 'PENDING', value: 'PENDING' },
                    { label: 'SKIPPED_EXISTS', value: 'SKIPPED_EXISTS' },
                    { label: 'EXCLUDED', value: 'EXCLUDED' },
                    { label: 'FAILED', value: 'FAILED' },
                  ]}
                  showFilterRow={showColumnFilters}
                  align="right"
                  className="whitespace-nowrap min-w-[130px]"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedScans.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Fingerprint className="w-8 h-8 text-slate-300" />
                      <span className="font-medium text-slate-600">ไม่พบข้อมูลการสแกนตามเงื่อนไขที่เลือก</span>
                      {activeColFilterCount > 0 && (
                        <button
                          onClick={handleResetFilters}
                          className="mt-1 text-teal-700 hover:underline text-xs font-semibold cursor-pointer"
                        >
                          ล้างฟิลเตอร์ทั้งหมดเพื่อแสดงข้อมูล
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedScans.map((scan, scanIdx) => (
                  <tr key={`${scan.id}-${scanIdx}`} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-mono bg-teal-50/30 border-r border-teal-100/50 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Fingerprint className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <span className="font-extrabold text-slate-950 text-[12px]">{scan.scanDateTime}</span>
                      </div>
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
                    <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                      <span className="inline-block bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200 text-[10px]" title={`เวลาที่ระบบดึงข้อมูลเข้าฐาน: ${scan.receivedAt || '-'}`}>
                        ดึงเข้าฐาน {scan.receivedAt ? scan.receivedAt.split(' ')[1] || scan.receivedAt : '-'}
                      </span>
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

        {/* Standard 10-row DataTablePagination */}
        <DataTablePagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalItems={state.rawScans.length}
          totalFilteredItems={filteredScans.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          showColumnFilters={showColumnFilters}
          onToggleColumnFilters={() => setShowColumnFilters(!showColumnFilters)}
          activeFilterCount={activeColFilterCount}
          onResetFilters={handleResetFilters}
        />
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

      {/* Custom Sync Modal */}
      <CustomSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSyncComplete={(msg) => {
          setMapSuccessNotice(`✓ ${msg}`);
          setTimeout(() => setMapSuccessNotice(null), 6000);
        }}
      />
    </div>
  );
};
