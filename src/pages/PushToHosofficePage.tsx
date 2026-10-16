import React, { useState } from 'react';
import { 
  Send, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Database, 
  ShieldAlert, 
  Calendar, 
  Cpu, 
  RefreshCw, 
  FileCheck, 
  XCircle,
  HelpCircle,
  History,
  Layers,
  ArrowRight,
  Copy,
  Link2
} from 'lucide-react';
import { StoreState, attendanceStore } from '../services/attendanceStore';
import { PushBatch, RawScan } from '../types/attendance';
import { QuickMapModal } from '../components/QuickMapModal';
import { apiClient, HOSPITAL_WEB_URL } from '../services/apiClient';

interface PushToHosofficePageProps {
  state: StoreState;
}

export const PushToHosofficePage: React.FC<PushToHosofficePageProps> = ({ state }) => {
  const isAdmin = state.currentUser.role === 'ADMIN';

  // Filters
  const [dateFrom, setDateFrom] = useState('2026-10-13');
  const [dateTo, setDateTo] = useState('2026-10-14');
  const [selectedMachine, setSelectedMachine] = useState<number | 'ALL'>('ALL');
  const [pendingOnly, setPendingOnly] = useState(true);

  // Quick Map State
  const [quickMapScan, setQuickMapScan] = useState<RawScan | null>(null);
  const [mapNotice, setMapNotice] = useState<string | null>(null);

  // Preview state
  const [previewResult, setPreviewResult] = useState<{
    totalSelected: number;
    readyToPush: number;
    willSkipExists: number;
    unmappedCount: number;
    candidates: RawScan[];
  } | null>(null);

  // Confirm Modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [pushErrorMessage, setPushErrorMessage] = useState<string | null>(null);
  const [lastExecutionResult, setLastExecutionResult] = useState<{
    batch: PushBatch;
    inserted: number;
    skippedExists: number;
    failed: number;
  } | null>(null);

  // Selected Batch for Details modal
  const [selectedBatch, setSelectedBatch] = useState<PushBatch | null>(null);

  // Run Preview / Dry Run
  const handlePreview = () => {
    const res = attendanceStore.previewPush({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      machineNo: selectedMachine === 'ALL' ? undefined : selectedMachine,
      pendingOnly
    });
    setPreviewResult(res);
  };

  // Run Push Execution
  const handleExecutePush = async () => {
    setIsPushing(true);
    setPushErrorMessage(null);
    try {
      // ลองเรียกผ่าน Backend API พอร์ต 3002 ก่อน
      try {
        await apiClient.pushBatch({
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          machineNo: selectedMachine === 'ALL' ? undefined : selectedMachine,
          pendingOnly,
          includeUnmapped: false,
          performedBy: state.currentUser.username
        });
      } catch (apiErr) {
        console.warn('API :3002 unreachable, recording locally in store:', apiErr);
      }

      const res = attendanceStore.executePush({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        machineNo: selectedMachine === 'ALL' ? undefined : selectedMachine,
        pendingOnly,
        includeUnmapped: false
      }, state.currentUser);

      setLastExecutionResult(res);
      setShowConfirmModal(false);
      // Re-run preview to reflect current state
      handlePreview();
    } catch (err: unknown) {
      setPushErrorMessage(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการส่งข้อมูล');
    } finally {
      setIsPushing(false);
    }
  };

  // Section 24.2: Guard if non-admin somehow opened this view
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">ไม่อนุญาตให้เข้าถึง (Access Denied)</h2>
        <p className="text-xs text-slate-500">
          ฟังก์ชันการส่งข้อมูลเข้า hosoffice สงวนไว้สำหรับผู้ดูแลระบบ (ADMIN) เท่านั้น
        </p>
      </div>
    );
  }

  // Count unmapped records in pending
  const unmappedPendingScans = state.rawScans.filter(s => !s.hrMapped && s.pushStatus === 'PENDING');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Warning & Policy Card - Section 22 */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 flex items-start gap-4">
        <div className="p-2.5 bg-amber-500/20 text-amber-800 rounded-lg shrink-0">
          <Database className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-amber-950">
            ระบบส่งข้อมูลเข้า MySQL hosoffice (Manual Push เท่านั้น)
          </h2>
          <p className="text-xs text-amber-900 leading-relaxed">
            <strong>กฎสำคัญ (v2):</strong> ระบบจะไม่ส่งข้อมูลเข้า <code className="px-1 py-0.5 bg-amber-200/50 rounded font-mono font-bold">hosoffice.fingle_scan</code> อัตโนมัติเด็ดขาด 
            ข้อมูลที่สแกนจากเครื่องจะถูกจัดเก็บในฐานข้อมูล Attendance DB (Staging) ก่อนเสมอ และจะถูกส่งเข้า hosoffice ต่อเมื่อ ADMIN ได้ตรวจสอบและกดปุ่มส่งข้อมูลนี้เท่านั้น
          </p>
          <div className="flex items-center gap-4 pt-1 text-[11px] text-amber-800">
            <span>✓ ตรวจสอบข้อมูลซ้ำอัตโนมัติ (Idempotent)</span>
            <span>·</span>
            <span>✓ ไม่ลบหรือแก้ไขข้อมูลเดิมใน hosoffice</span>
            <span>·</span>
            <span>✓ บันทึกประวัติและ Audit Log ทุก Batch</span>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {pushErrorMessage && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 flex items-center justify-between gap-3 text-rose-800 text-xs">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="font-medium">{pushErrorMessage}</span>
          </div>
          <button
            onClick={() => setPushErrorMessage(null)}
            className="text-rose-500 hover:text-rose-700 text-xs font-semibold px-2 py-1 rounded"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Main Filter & Action Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              1. กำหนดเงื่อนไขการส่งข้อมูล (Filter Parameters)
            </h3>
            <p className="text-xs text-slate-500">
              เลือกช่วงเวลาและเครื่องสแกนที่ต้องการส่งข้อมูลเข้า fingle_scan
            </p>
          </div>
          <div className="flex flex-col md:flex-row items-end md:items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[11px] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              API ส่งข้อมูล: <strong>:3002</strong> ({apiClient.getBaseUrl()})
            </span>
            <span className="text-slate-500 text-[11px]">
              ปลายทาง: <span className="font-mono font-semibold text-slate-700">10.2.0.201 / hosoffice.fingle_scan</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          {/* Date From */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>ตั้งแต่วันที่:</span>
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
            />
          </div>

          {/* Date To */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>ถึงวันที่:</span>
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
            />
          </div>

          {/* Machine No */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-slate-400" />
              <span>เครื่องสแกน:</span>
            </label>
            <select
              value={selectedMachine}
              onChange={(e) => setSelectedMachine(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
            >
              <option value="ALL">ทุกเครื่อง (เครื่อง 1, 2, 3)</option>
              {state.scanners.map(s => (
                <option key={s.id} value={s.machineNo}>
                  เครื่อง {s.machineNo} ({s.name})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter Toggle */}
          <div className="space-y-1 flex flex-col justify-end">
            <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-300 rounded cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pendingOnly}
                onChange={(e) => setPendingOnly(e.target.checked)}
                className="rounded text-teal-600 focus:ring-teal-500"
              />
              <span className="font-semibold text-slate-700">เฉพาะรายการที่รอส่ง (PENDING)</span>
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handlePreview}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer transition-colors"
          >
            <FileCheck className="w-4 h-4 text-teal-400" />
            <span>ตรวจสอบก่อนส่ง (Preview / Dry-Run)</span>
          </button>

          {previewResult && previewResult.readyToPush > 0 && (
            <button
              onClick={() => setShowConfirmModal(true)}
              className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg shadow-sm cursor-pointer transition-colors"
            >
              <Send className="w-4 h-4" />
              <span>ส่งข้อมูลเข้า hosoffice ({previewResult.readyToPush} รายการ)</span>
            </button>
          )}
        </div>
      </div>

      {/* Preview Breakdown Card - Section 22.2 */}
      {previewResult && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              ผลการตรวจสอบก่อนส่ง (Dry-Run Summary)
            </h3>
            <span className="text-xs text-slate-500">
              พบข้อมูลในเงื่อนไขทั้งหมด <strong className="text-slate-800 tabular-nums">{previewResult.totalSelected}</strong> รายการ
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Ready to Push */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs">
              <div className="text-emerald-700 font-semibold flex items-center justify-between">
                <span>พร้อมส่งเข้า hosoffice</span>
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-emerald-800 font-mono tabular-nums mt-1">
                {previewResult.readyToPush}
              </div>
              <p className="text-[11px] text-emerald-600 mt-0.5">
                ผ่านการตรวจสอบ Map HR และไม่ซ้ำ
              </p>
            </div>

            {/* Will Skip Exists */}
            <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 text-xs">
              <div className="text-slate-700 font-semibold flex items-center justify-between">
                <span>มีใน fingle_scan แล้ว (จะถูกข้าม)</span>
                <Copy className="w-4 h-4 text-slate-500" />
              </div>
              <div className="text-2xl font-black text-slate-800 font-mono tabular-nums mt-1">
                {previewResult.willSkipExists}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                สถานะจะเปลี่ยนเป็น SKIPPED_EXISTS
              </p>
            </div>

            {/* Unmapped Fingle ID */}
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs">
              <div className="text-rose-700 font-semibold flex items-center justify-between">
                <span>ไม่พบ FINGLE_ID ใน HR</span>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-2xl font-black text-rose-800 font-mono tabular-nums mt-1">
                {previewResult.unmappedCount}
              </div>
              <p className="text-[11px] text-rose-600 mt-0.5">
                ต้องตรวจสอบ ไม่ส่งเข้า hosoffice
              </p>
            </div>
          </div>

          {/* Table Preview */}
          <div className="overflow-x-auto max-h-64 border border-slate-200 rounded-lg bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0">
                <tr>
                  <th className="py-2 px-3">เวลาสแกน</th>
                  <th className="py-2 px-3">เครื่อง</th>
                  <th className="py-2 px-3">FINGLE_ID</th>
                  <th className="py-2 px-3">ชื่อ - สกุล</th>
                  <th className="py-2 px-3">หน่วยงาน</th>
                  <th className="py-2 px-3">สถานะปัจจุบัน</th>
                  <th className="py-2 px-3 text-right">ผลการประเมิน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewResult.candidates.map((scan, scanIdx) => {
                  const exists = state.hosofficeScans.some(
                    h => h.fingleId === scan.fingleId && h.scanDateTime === scan.scanDateTime
                  );
                  return (
                    <tr key={`${scan.id}-${scanIdx}`} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono">{scan.scanDateTime}</td>
                      <td className="py-2 px-3">เครื่อง {scan.machineNo}</td>
                      <td className="py-2 px-3 font-mono font-bold">{scan.fingleId}</td>
                      <td className="py-2 px-3">{scan.hrFullname || <span className="text-rose-500 font-semibold">ไม่พบข้อมูล HR</span>}</td>
                      <td className="py-2 px-3 text-slate-500">{scan.hrDepName || '-'}</td>
                      <td className="py-2 px-3">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-700">
                          {scan.pushStatus}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        {!scan.hrMapped ? (
                          <span className="text-rose-600 font-bold text-[11px]">⚠ ข้าม (ไม่พบ HR)</span>
                        ) : exists ? (
                          <span className="text-slate-500 font-medium text-[11px]">ข้าม (มีอยู่แล้ว)</span>
                        ) : (
                          <span className="text-emerald-700 font-bold text-[11px]">✓ จะ Insert</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unmapped Review Panel - Section 22.3 */}
      {unmappedPendingScans.length > 0 && (
        <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <h3 className="text-sm font-bold text-rose-950">
                รายการที่ต้องตรวจสอบ (FINGLE_ID ไม่พบในตาราง hr_person)
              </h3>
            </div>
            <span className="text-xs bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-bold">
              {unmappedPendingScans.length} รายการ
            </span>
          </div>

          <p className="text-xs text-rose-800 leading-relaxed">
            รายการเหล่านี้มีข้อมูลลายนิ้วมือสแกนเข้ามา แต่หมายเลข FINGLE_ID ยังไม่ตรงกับเจ้าหน้าที่ในฐานข้อมูล HR ของโรงพยาบาล 
            ตามสเปกข้อ 22.3 ระบบจะไม่ส่งข้อมูลเหล่านี้เข้า hosoffice โดยอัตโนมัติ เพื่อป้องกันข้อมูลขยะ
          </p>

          <div className="overflow-x-auto bg-white rounded-lg border border-rose-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-rose-100/50 text-rose-800 font-semibold">
                <tr>
                  <th className="py-2 px-3">เวลาสแกน</th>
                  <th className="py-2 px-3">เครื่องสแกน</th>
                  <th className="py-2 px-3">FINGLE_ID</th>
                  <th className="py-2 px-3">สถานะ</th>
                  <th className="py-2 px-3 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-100">
                {unmappedPendingScans.map((scan, unmappedIdx) => (
                  <tr key={`${scan.id}-${unmappedIdx}`}>
                    <td className="py-2 px-3 font-mono">{scan.scanDateTime}</td>
                    <td className="py-2 px-3">เครื่อง {scan.machineNo} ({scan.deviceIp})</td>
                    <td className="py-2 px-3 font-mono font-bold text-rose-700">{scan.fingleId}</td>
                    <td className="py-2 px-3 text-slate-500">รอผูก FINGLE_ID ในระบบ HR</td>
                    <td className="py-2 px-3 text-right">
                      {isAdmin ? (
                        <button
                          onClick={() => setQuickMapScan(scan)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs cursor-pointer transition-colors"
                          title="ผูกรหัสนี้กับเจ้าหน้าที่ HR เพื่อให้สามารถส่งข้อมูลเข้า hosoffice ได้"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>ผูกกับเจ้าหน้าที่ทันที (Quick Map)</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">กรุณาแจ้ง ADMIN เพื่อผูกรหัส</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Push Batch History - Section 22.3 */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800">
              ประวัติการส่งข้อมูลเข้า hosoffice (Push Batches)
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            ทั้งหมด {state.pushBatches.length} ชุดการส่ง
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-y border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Batch ID</th>
                <th className="py-2.5 px-3">วัน-เวลาที่ส่ง</th>
                <th className="py-2.5 px-3">ผู้สั่งส่ง (ADMIN)</th>
                <th className="py-2.5 px-3 text-center">เลือกทั้งหมด</th>
                <th className="py-2.5 px-3 text-center">Insert สำเร็จ</th>
                <th className="py-2.5 px-3 text-center">ข้าม (มีอยู่แล้ว)</th>
                <th className="py-2.5 px-3 text-center">ล้มเหลว</th>
                <th className="py-2.5 px-3">สถานะ Batch</th>
                <th className="py-2.5 px-3 text-right">รายละเอียด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.pushBatches.map((batch, batchIdx) => (
                <tr key={`${batch.id}-${batchIdx}`} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                    #{batch.id}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-600">
                    {batch.requestedAt}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-700">
                    {batch.requestedBy}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                    {batch.totalSelected}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-700">
                    {batch.totalInserted}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono text-slate-500">
                    {batch.totalSkippedExists}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-rose-600">
                    {batch.totalFailed}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                      batch.status === 'SUCCESS'
                        ? 'bg-emerald-100 text-emerald-800'
                        : batch.status === 'PARTIAL'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {batch.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => setSelectedBatch(batch)}
                      className="text-teal-700 hover:text-teal-900 font-semibold cursor-pointer"
                    >
                      ดูรายการ &rarr;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Dialog Modal - Section 22.2 */}
      {showConfirmModal && previewResult && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Send className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                ยืนยันการส่งข้อมูลเข้า hosoffice
              </h3>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <p>
                คุณกำลังจะส่งข้อมูลการลงเวลาสแกนนิ้วเข้าตาราง <strong className="font-mono text-slate-800">hosoffice.fingle_scan</strong>
              </p>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1 font-mono text-slate-700">
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">ช่วงวันที่:</span>
                  <span>{dateFrom} ถึง {dateTo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">รายการที่จะ Insert:</span>
                  <span className="font-bold text-emerald-700">{previewResult.readyToPush} รายการ</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">รายการที่ซ้ำ (จะข้าม):</span>
                  <span>{previewResult.willSkipExists} รายการ</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">ผู้สั่งการ (ADMIN):</span>
                  <span>{state.currentUser.fullname}</span>
                </div>
              </div>

              <p className="text-[11px] text-amber-700 pt-1">
                * ข้อมูลที่ส่งจะถูกบันทึกด้วย DATE_TIME_SAVE = เวลาปัจจุบัน และ CREATE_BY = SCAN_PUSH
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isPushing}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleExecutePush}
                disabled={isPushing}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 rounded-lg shadow-sm cursor-pointer"
              >
                {isPushing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{isPushing ? 'กำลังส่งข้อมูล...' : 'ยืนยันและส่งทันที'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Details Modal */}
      {selectedBatch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  รายละเอียด Batch การส่ง #{selectedBatch.id}
                </h3>
                <p className="text-xs text-slate-500">
                  ส่งเมื่อ {selectedBatch.requestedAt} โดย {selectedBatch.requestedBy}
                </p>
              </div>
              <button
                onClick={() => setSelectedBatch(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                <div className="text-slate-500">เลือกทั้งหมด</div>
                <div className="text-lg font-bold text-slate-800">{selectedBatch.totalSelected}</div>
              </div>
              <div className="p-2.5 bg-emerald-50 rounded border border-emerald-200">
                <div className="text-emerald-700">Insert สำเร็จ</div>
                <div className="text-lg font-bold text-emerald-800">{selectedBatch.totalInserted}</div>
              </div>
              <div className="p-2.5 bg-slate-100 rounded border border-slate-200">
                <div className="text-slate-600">ข้าม (ซ้ำ)</div>
                <div className="text-lg font-bold text-slate-800">{selectedBatch.totalSkippedExists}</div>
              </div>
              <div className="p-2.5 bg-rose-50 rounded border border-rose-200">
                <div className="text-rose-700">ล้มเหลว</div>
                <div className="text-lg font-bold text-rose-800">{selectedBatch.totalFailed}</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg p-2 text-xs font-sans">
              <h4 className="font-semibold text-slate-700 mb-2 px-1">รายการสแกนใน Batch นี้:</h4>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="py-1.5 px-2">เวลาสแกน</th>
                    <th className="py-1.5 px-2">FINGLE_ID</th>
                    <th className="py-1.5 px-2">ชื่อ</th>
                    <th className="py-1.5 px-2">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.rawScans
                    .filter(s => s.pushBatchId === selectedBatch.id)
                    .map((scan, idx) => (
                      <tr key={`${scan.id}-${idx}`}>
                        <td className="py-1.5 px-2 font-mono">{scan.scanDateTime}</td>
                        <td className="py-1.5 px-2 font-mono">{scan.fingleId}</td>
                        <td className="py-1.5 px-2">{scan.hrFullname}</td>
                        <td className="py-1.5 px-2 font-semibold text-emerald-700">{scan.pushStatus}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedBatch(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

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
            setMapNotice(`✓ ผูกรหัส FINGLE #${quickMapScan.fingleId} เข้ากับ ${person.hrFullname} สำเร็จ! ตอนนี้พร้อมส่งเข้า hosoffice ได้แล้ว`);
            // Refresh preview if preview is open
            if (previewResult) {
              handlePreview();
            }
            setTimeout(() => setMapNotice(null), 5000);
          }}
        />
      )}

      {/* Map Success Toast */}
      {mapNotice && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-900 text-white text-xs px-5 py-3 rounded-xl shadow-xl border border-emerald-700 flex items-center gap-3">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{mapNotice}</span>
        </div>
      )}
    </div>
  );
};
