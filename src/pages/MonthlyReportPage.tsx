import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Printer, 
  Download, 
  Calendar, 
  Search, 
  Filter, 
  Building, 
  Users, 
  Clock, 
  AlertCircle, 
  Award,
  CheckCircle,
  Hospital
} from 'lucide-react';
import { StoreState, attendanceStore, MonthlyPersonSummary } from '../services/attendanceStore';

interface MonthlyReportPageProps {
  state: StoreState;
}

export const MonthlyReportPage: React.FC<MonthlyReportPageProps> = ({ state }) => {
  const [selectedMonth, setSelectedMonth] = useState('2026-10');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch monthly summary from attendanceStore
  const summaryData: MonthlyPersonSummary[] = attendanceStore.getMonthlySummary(selectedMonth);

  const departments = Array.from(new Set(state.personnel.map(p => p.hrDepName)));
  const personTypes = Array.from(new Set(state.personnel.map(p => p.hrPersonTypeName)));

  // Filtered summaries
  const filteredData = summaryData.filter(item => {
    if (selectedDept !== 'ALL' && item.hrDepName !== selectedDept) return false;
    if (selectedType !== 'ALL' && item.hrPersonTypeName !== selectedType) return false;
    if (searchTerm) {
      const matchName = item.hrFullname.toLowerCase().includes(searchTerm.toLowerCase());
      const matchFingle = item.fingleId.toString().includes(searchTerm);
      const matchCid = item.hrCid?.includes(searchTerm);
      const matchPos = item.hrPositionName.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchName && !matchFingle && !matchCid && !matchPos) return false;
    }
    return true;
  });

  // Aggregated totals
  const totalDaysWorked = filteredData.reduce((acc, cur) => acc + cur.daysWorked, 0);
  const totalLateCount = filteredData.reduce((acc, cur) => acc + cur.lateCount, 0);
  const totalLateMinutes = filteredData.reduce((acc, cur) => acc + cur.totalLateMinutes, 0);
  const totalOtHours = filteredData.reduce((acc, cur) => acc + cur.totalOtHours, 0);

  // Export CSV
  const handleExportCsv = () => {
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
      'ไม่พบสแกน/ขาด (วัน)'
    ];

    const rows = filteredData.map(d => [
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
      d.noScanCount
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `รายงานเวลาปฏิบัติงาน_รพ.สามชุก_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Report
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header and Print Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4 print:hidden">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded bg-teal-50 text-teal-800 text-xs font-semibold mb-1 border border-teal-200">
            <Hospital className="w-3.5 h-3.5" />
            <span>กลุ่มงานทรัพยากรบุคคล (HR) & กลุ่มงานการเงิน โรงพยาบาลสามชุก</span>
          </div>
          <h2 className="text-base font-bold text-slate-800">
            รายงานสรุปการมาปฏิบัติงานประจำเดือน (Monthly HR Attendance Report)
          </h2>
          <p className="text-xs text-slate-500">
            สรุปยอดรวมวันทำงาน, จำนวนครั้งที่สาย, นาทีสายรวม, และชั่วโมง OT เพื่อใช้ประกอบการประเมินและเบิกจ่ายค่าตอบแทน
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold">
            <Calendar className="w-4 h-4 text-teal-600" />
            <span>ประจำเดือน:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="font-mono text-slate-800 focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>ส่งออก Excel / CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>พิมพ์รายงาน (Print)</span>
          </button>
        </div>
      </div>

      {/* Printable Report Header (Visible on print) */}
      <div className="hidden print:block text-center space-y-1 mb-6 border-b border-slate-400 pb-4">
        <h1 className="text-lg font-bold text-slate-900">
          รายงานสรุปการลงเวลาปฏิบัติงานและค่าตอบแทนนอกเวลา
        </h1>
        <h2 className="text-sm font-semibold text-slate-800">
          โรงพยาบาลสามชุก จังหวัดสุพรรณบุรี
        </h2>
        <p className="text-xs text-slate-600">
          ประจำงวดเดือน: {selectedMonth} (ข้อมูล ณ วันที่ {new Date().toLocaleDateString('th-TH')})
        </p>
      </div>

      {/* Monthly Summary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>เจ้าหน้าที่ในรายงาน</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-800 font-mono tabular-nums">
            {filteredData.length} <span className="text-xs font-normal text-slate-500">ท่าน</span>
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
            {totalLateCount} <span className="text-xs font-normal text-amber-600">ครั้ง</span>
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

      {/* Filter Toolbar (Hidden on print) */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs print:hidden">
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
      </div>

      {/* Monthly Report Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs print:border-none print:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">FINGLE_ID</th>
                <th className="py-2.5 px-3">เลขประชาชน (HR_CID)</th>
                <th className="py-2.5 px-3">ชื่อ - สกุล</th>
                <th className="py-2.5 px-3">ตำแหน่ง / หน่วยงานย่อย</th>
                <th className="py-2.5 px-3 text-center">วันทำงาน (วัน)</th>
                <th className="py-2.5 px-3 text-center">ตรงเวลา</th>
                <th className="py-2.5 px-3 text-center">สาย (ครั้ง)</th>
                <th className="py-2.5 px-3 text-center">รวมเวลาสาย</th>
                <th className="py-2.5 px-3 text-center">ออกก่อน</th>
                <th className="py-2.5 px-3 text-center font-bold text-teal-800">รวม OT (ชม.)</th>
                <th className="py-2.5 px-3 text-right">ไม่พบสแกน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredData.map((row, rowIdx) => (
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
                  <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                    {row.noScanCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
};
