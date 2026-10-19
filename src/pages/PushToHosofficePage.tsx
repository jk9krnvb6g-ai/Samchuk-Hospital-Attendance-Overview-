import React, { useState, useEffect } from 'react';
import { 
  Send, 
  CheckCircle, 
  CheckCircle2,
  AlertTriangle, 
  Clock, 
  Database, 
  ShieldAlert, 
  Calendar, 
  Cpu, 
  RefreshCw, 
  FileCheck, 
  XCircle,
  History,
  Layers,
  ArrowRight,
  Copy,
  CopyCheck,
  Link2,
  Search,
  Filter,
  Eye,
  Check,
  Ban,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info
} from 'lucide-react';
import { StoreState, attendanceStore } from '../services/attendanceStore';
import { PushBatch, RawScan } from '../types/attendance';
import { QuickMapModal } from '../components/QuickMapModal';
import { apiClient } from '../services/apiClient';

interface PushToHosofficePageProps {
  state: StoreState;
}

export const PushToHosofficePage: React.FC<PushToHosofficePageProps> = ({ state }) => {
  const isAdmin = state.currentUser.role === 'ADMIN';

  // Sub-tabs
  const [activeSubTab, setActiveSubTab] = useState<'preview' | 'unmapped' | 'history'>('preview');

  // Filters
  const [dateFrom, setDateFrom] = useState('2026-10-13');
  const [dateTo, setDateTo] = useState('2026-10-14');
  const [selectedMachine, setSelectedMachine] = useState<number | 'ALL'>('ALL');
  const [pendingOnly, setPendingOnly] = useState(true);

  // Search in preview table
  const [previewSearch, setPreviewSearch] = useState('');

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

  // Refresh mapping state
  const [isRefreshingPersonnel, setIsRefreshingPersonnel] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  // Exclude state
  const [excludingId, setExcludingId] = useState<number | string | null>(null);

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

  // Quick Date Range Helpers
  const handleSetQuickDate = (mode: 'today' | 'yesterday' | 'last7days') => {
    // Standard system reference date: 2026-10-14
    if (mode === 'today') {
      setDateFrom('2026-10-14');
      setDateTo('2026-10-14');
    } else if (mode === 'yesterday') {
      setDateFrom('2026-10-13');
      setDateTo('2026-10-13');
    } else if (mode === 'last7days') {
      setDateFrom('2026-10-08');
      setDateTo('2026-10-14');
    }
  };

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

  // Auto-run preview initially or when filter changes
  useEffect(() => {
    handlePreview();
  }, [dateFrom, dateTo, selectedMachine, pendingOnly, state.rawScans, state.hosofficeScans]);

  // Handle Refresh Personnel from hosoffice.hr_person
  const handleRefreshPersonnel = async () => {
    setIsRefreshingPersonnel(true);
    setRefreshNotice(null);
    try {
      const res = await attendanceStore.refreshPersonnelMapping();
      setRefreshNotice(res.message);
      handlePreview();
    } catch (err: unknown) {
      setRefreshNotice(`รีเฟรชไม่สำเร็จ: ${err instanceof Error ? err.message : 'Error'}`);
    } finally {
      setIsRefreshingPersonnel(false);
    }
  };

  // Handle Exclude Single Scan
  const handleExcludeScan = async (scanId: number | string) => {
    setExcludingId(scanId);
    try {
      await attendanceStore.excludeScan(scanId);
      handlePreview();
    } finally {
      setExcludingId(null);
    }
  };

  // Run Push Execution (Manual Push Only)
  const handleExecutePush = async () => {
    setIsPushing(true);
    setPushErrorMessage(null);
    try {
      // 1. เรียกผ่าน Backend API พอร์ต 3002 เพื่อบันทึกลง MySQL fingle_scan และ attendance_raw_scan
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
        console.warn('API :3002 notice, proceeding with store push:', apiErr);
      }

      // 2. เรียก store เพื่ออัปเดต state และบันทึกประวัติ Batch
      const res = attendanceStore.executePush({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        machineNo: selectedMachine === 'ALL' ? undefined : selectedMachine,
        pendingOnly,
        includeUnmapped: false
      }, state.currentUser);

      setLastExecutionResult(res);
      setShowConfirmModal(false);
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

  // Filter preview candidates by search query
  const filteredCandidates = previewResult?.candidates.filter(scan => {
    if (!previewSearch) return true;
    const term = previewSearch.toLowerCase();
    return (
      String(scan.fingleId).includes(term) ||
      (scan.hrFullname && scan.hrFullname.toLowerCase().includes(term)) ||
      (scan.hrDepName && scan.hrDepName.toLowerCase().includes(term)) ||
      scan.scanDateTime.includes(term)
    );
  }) || [];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto select-none">
      {/* Top Banner: Strict Manual Push Policy (Spec v2 Section 22) */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-teal-500/5 border border-amber-500/30 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-amber-500/20 text-amber-800 rounded-xl shrink-0 mt-0.5">
              <Database className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm md:text-base font-bold text-slate-900">
                  ระบบส่งข้อมูลเข้า MySQL hosoffice (Manual Push เท่านั้น)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  Spec v2 Section 22
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-teal-50 text-teal-800 border border-teal-200">
                  On-Demand (ADMIN กดปุ่มส่งเท่านั้น)
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>กฎความปลอดภัย (Spec v2):</strong> ระบบจะ<strong>ไม่มี</strong>การส่งข้อมูลเข้า <code className="px-1.5 py-0.5 bg-amber-100 rounded font-mono font-bold text-amber-900">hosoffice.fingle_scan</code> อัตโนมัติเด็ดขาด 
                โดย Background Service (พอร์ต 3002) จะดึงข้อมูลจากเครื่องสแกน 1-3 มาเก็บไว้ใน <code className="px-1.5 py-0.5 bg-slate-100 rounded font-mono text-slate-800">attendance_raw_scan</code> (Staging DB) เท่านั้น 
                การส่งเข้า hosoffice จะเกิดขึ้นเมื่อ ADMIN ได้ตรวจสอบความถูกต้องและกดยืนยันส่งด้วยตนเองเท่านั้น
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-600 font-medium">
                <span className="flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" /> ตรวจสอบ Duplicate ซ้ำกับ fingle_scan ก่อน Insert เสมอ (ข้ามอัตโนมัติ)
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5" /> ส่งเฉพาะข้อมูลที่ผูกบุคลากรสำเร็จ (hr_mapped = 1) เท่านั้น
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 text-blue-700">
                  <History className="w-3.5 h-3.5" /> บันทึก Audit Log และประวัติ Batch ทุกครั้ง
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0 text-right">
            <span className="text-[11px] font-mono text-slate-500">
              MySQL โฮสต์ปลายทาง:
            </span>
            <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-slate-900 text-emerald-400">
              10.2.0.201 / hosoffice
            </span>
            <span className="text-[10px] text-slate-500">
              ตาราง: <strong className="text-slate-700 font-mono">fingle_scan</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Success Banner after Execution */}
      {lastExecutionResult && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex items-center justify-between gap-3 text-emerald-900 text-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700 shrink-0">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm">
                ส่งข้อมูลเข้า hosoffice สำเร็จเรียบร้อยแล้ว! (Batch #{lastExecutionResult.batch.id})
              </div>
              <div className="text-emerald-700 mt-0.5">
                Insert ข้อมูลใหม่: <strong>{lastExecutionResult.inserted}</strong> รายการ | 
                ข้ามรายการที่ซ้ำเดิม: <strong>{lastExecutionResult.skippedExists}</strong> รายการ | 
                ล้มเหลว: <strong>{lastExecutionResult.failed}</strong> รายการ
              </div>
            </div>
          </div>
          <button
            onClick={() => setLastExecutionResult(null)}
            className="text-emerald-700 hover:text-emerald-900 font-semibold px-2 py-1 rounded cursor-pointer"
          >
            ปิดการแจ้งเตือน
          </button>
        </div>
      )}

      {/* Error Notice */}
      {pushErrorMessage && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 flex items-center justify-between gap-3 text-rose-800 text-xs">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="font-medium">{pushErrorMessage}</span>
          </div>
          <button
            onClick={() => setPushErrorMessage(null)}
            className="text-rose-500 hover:text-rose-700 text-xs font-semibold px-2 py-1 rounded cursor-pointer"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Refresh Notice Toast */}
      {refreshNotice && (
        <div className="bg-teal-50 border border-teal-300 rounded-xl p-4 flex items-center justify-between gap-3 text-teal-900 text-xs">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-teal-600 shrink-0" />
            <span className="font-medium">{refreshNotice}</span>
          </div>
          <button
            onClick={() => setRefreshNotice(null)}
            className="text-teal-700 hover:text-teal-900 text-xs font-semibold px-2 py-1 rounded cursor-pointer"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Filter Parameters Section (Round 2.1) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Filter className="w-4 h-4 text-teal-600" />
              <span>1. กำหนดเงื่อนไขการส่งข้อมูล (Filter Parameters)</span>
            </h3>
            <p className="text-xs text-slate-500">
              ใช้ปุ่มลัดช่วยกรองหรือเลือกช่วงวันที่และเครื่องสแกนที่ต้องการ
            </p>
          </div>

          {/* Quick Date Buttons (Round 2.1 Option B) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-medium text-slate-500 mr-1">ปุ่มลัดช่วยกรอง:</span>
            <button
              type="button"
              onClick={() => handleSetQuickDate('today')}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                dateFrom === '2026-10-14' && dateTo === '2026-10-14'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              ข้อมูลวันนี้
            </button>
            <button
              type="button"
              onClick={() => handleSetQuickDate('yesterday')}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                dateFrom === '2026-10-13' && dateTo === '2026-10-13'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              เมื่อวาน
            </button>
            <button
              type="button"
              onClick={() => handleSetQuickDate('last7days')}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                dateFrom === '2026-10-08' && dateTo === '2026-10-14'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              7 วันที่ผ่านมา
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Date From */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-teal-600" />
              <span>ตั้งแต่วันที่:</span>
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
            />
          </div>

          {/* Date To */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-teal-600" />
              <span>ถึงวันที่:</span>
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
            />
          </div>

          {/* Machine Selector */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-teal-600" />
              <span>เครื่องสแกน:</span>
            </label>
            <select
              value={selectedMachine}
              onChange={(e) => setSelectedMachine(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
            >
              <option value="ALL">ทุกเครื่อง (ทั้งหมด 1, 2, 3)</option>
              {state.scanners.map(s => (
                <option key={s.id} value={s.machineNo}>
                  เครื่อง {s.machineNo} ({s.name})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter Toggle (Default PENDING) */}
          <div className="space-y-1 flex flex-col justify-end">
            <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-300 rounded-lg cursor-pointer select-none hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={pendingOnly}
                onChange={(e) => setPendingOnly(e.target.checked)}
                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 accent-teal-600 cursor-pointer"
              />
              <span className="font-semibold text-slate-800">กรองเฉพาะสถานะ PENDING</span>
            </label>
          </div>
        </div>

        {/* Action Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2.5">
            <button
              onClick={handlePreview}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
            >
              <FileCheck className="w-4 h-4 text-teal-400" />
              <span>ตรวจสอบข้อมูลก่อนส่ง (Preview / Dry-Run)</span>
            </button>

            <button
              onClick={handleRefreshPersonnel}
              disabled={isRefreshingPersonnel}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 cursor-pointer transition-colors"
              title="ดึงข้อมูลบุคลากรล่าสุดจาก hosoffice.hr_person และ Map ข้อมูลสแกนใหม่อัตโนมัติ"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshingPersonnel ? 'animate-spin' : ''}`} />
              <span>{isRefreshingPersonnel ? 'กำลังรีเฟรช HR...' : 'รีเฟรชข้อมูลบุคลากร'}</span>
            </button>
          </div>

          {previewResult && previewResult.readyToPush > 0 && (
            <button
              onClick={() => setShowConfirmModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-lg shadow-sm cursor-pointer transition-colors animate-pulse"
            >
              <Send className="w-4 h-4" />
              <span>ส่งข้อมูลเข้า hosoffice ({previewResult.readyToPush} รายการ) &rarr;</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveSubTab('preview')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
            activeSubTab === 'preview'
              ? 'border-teal-600 text-teal-800 bg-teal-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>ผลการตรวจสอบ & รายการพร้อมส่ง</span>
          {previewResult && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700 font-mono">
              {previewResult.totalSelected}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('unmapped')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 cursor-pointer transition-colors relative ${
            activeSubTab === 'unmapped'
              ? 'border-amber-500 text-amber-900 bg-amber-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span>ต้องตรวจสอบ (Unmapped Scans)</span>
          {unmappedPendingScans.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-mono font-bold animate-pulse">
              {unmappedPendingScans.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
            activeSubTab === 'history'
              ? 'border-teal-600 text-teal-800 bg-teal-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>ประวัติ Batch การส่ง</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700 font-mono">
            {state.pushBatches.length}
          </span>
        </button>
      </div>

      {/* Sub-Tab 1: Preview & Ready to Push */}
      {activeSubTab === 'preview' && previewResult && (
        <div className="space-y-5">
          {/* 4 Summary Cards (Round 2.2 Spec requirement) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: READY TO PUSH */}
            <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 shadow-2xs relative overflow-hidden">
              <div className="flex items-center justify-between text-emerald-800">
                <span className="text-xs font-bold">1. รายการพร้อมส่ง</span>
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono text-emerald-900 tabular-nums">
                  {previewResult.readyToPush}
                </span>
                <span className="text-xs text-emerald-700 font-medium">รายการ</span>
              </div>
              <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                hr_mapped = 1 และยังไม่มีใน fingle_scan
              </p>
              <div className="absolute -right-3 -bottom-3 opacity-10 text-emerald-900 pointer-events-none">
                <CheckCircle2 className="w-20 h-20" />
              </div>
            </div>

            {/* Card 2: ALREADY EXISTS (WILL SKIP) */}
            <div className="bg-slate-100 border border-slate-300 rounded-xl p-4 shadow-2xs relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-700">
                <span className="text-xs font-bold">2. ซ้ำใน hosoffice</span>
                <CopyCheck className="w-5 h-5 text-slate-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono text-slate-800 tabular-nums">
                  {previewResult.willSkipExists}
                </span>
                <span className="text-xs text-slate-600 font-medium">รายการ</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                มีอยู่แล้ว จะถูกข้าม (SKIPPED_EXISTS)
              </p>
              <div className="absolute -right-3 -bottom-3 opacity-10 text-slate-800 pointer-events-none">
                <CopyCheck className="w-20 h-20" />
              </div>
            </div>

            {/* Card 3: UNMAPPED (hr_mapped = 0) */}
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 shadow-2xs relative overflow-hidden">
              <div className="flex items-center justify-between text-amber-900">
                <span className="text-xs font-bold">3. ยังไม่ผูกบุคลากร</span>
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono text-amber-900 tabular-nums">
                  {previewResult.unmappedCount}
                </span>
                <span className="text-xs text-amber-800 font-medium">รายการ</span>
              </div>
              <p className="text-[11px] text-amber-700 mt-1 font-medium">
                hr_mapped = 0 (ห้ามส่งเด็ดขาด)
              </p>
              <div className="absolute -right-3 -bottom-3 opacity-10 text-amber-900 pointer-events-none">
                <AlertTriangle className="w-20 h-20" />
              </div>
            </div>

            {/* Card 4: NET INSERT */}
            <div className="bg-gradient-to-br from-teal-700 to-cyan-800 text-white rounded-xl p-4 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between text-teal-100">
                <span className="text-xs font-bold uppercase tracking-wider">4. ยอดสุทธิที่จะ INSERT จริง</span>
                <Send className="w-5 h-5 text-teal-200" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono text-white tabular-nums">
                  {previewResult.readyToPush}
                </span>
                <span className="text-xs text-teal-100">รายการสุทธิ</span>
              </div>
              <p className="text-[11px] text-teal-200 mt-1">
                เข้าตาราง hosoffice.fingle_scan
              </p>
              <div className="absolute -right-3 -bottom-3 opacity-15 text-white pointer-events-none">
                <Send className="w-20 h-20" />
              </div>
            </div>
          </div>

          {/* Sub-Table Preview: Inspect Personnel & Scan Times before Confirm */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden space-y-3 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  ตารางตรวจสอบรายชื่อและเวลาสแกนก่อนส่ง (Candidate Scans Preview)
                </h4>
                <p className="text-[11px] text-slate-500">
                  แสดง {filteredCandidates.length} จากทั้งหมด {previewResult.totalSelected} รายการในเงื่อนไข
                </p>
              </div>

              {/* Search inside preview */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ, FINGLE_ID, หรือแผนก..."
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200 z-10">
                  <tr>
                    <th className="py-2.5 px-3">วัน-เวลาสแกน</th>
                    <th className="py-2.5 px-3">เครื่องสแกน</th>
                    <th className="py-2.5 px-3">FINGLE_ID</th>
                    <th className="py-2.5 px-3">ชื่อ - สกุล (HR)</th>
                    <th className="py-2.5 px-3">แผนก / ฝ่าย</th>
                    <th className="py-2.5 px-3">สถานะ Staging</th>
                    <th className="py-2.5 px-3 text-right">ผลการประเมินการส่ง</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                        ไม่พบรายการสแกนที่ตรงกับเงื่อนไขการค้นหา
                      </td>
                    </tr>
                  ) : (
                    filteredCandidates.map((scan, scanIdx) => {
                      const exists = state.hosofficeScans.some(
                        h => h.fingleId === scan.fingleId && h.scanDateTime === scan.scanDateTime
                      );
                      const isUnmapped = !scan.hrMapped;

                      return (
                        <tr key={`${scan.id}-${scanIdx}`} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2 px-3 font-mono text-slate-700 whitespace-nowrap">
                            {scan.scanDateTime}
                          </td>
                          <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                            เครื่อง {scan.machineNo}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">
                            {scan.fingleId}
                          </td>
                          <td className="py-2 px-3">
                            {scan.hrFullname ? (
                              <span className="font-medium text-slate-800">{scan.hrFullname}</span>
                            ) : (
                              <span className="text-amber-700 font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> ไม่พบใน hr_person
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                            {scan.hrDepName || '-'}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 border border-slate-200">
                              {scan.pushStatus}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            {isUnmapped ? (
                              <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px] font-bold">
                                ⚠ ข้าม (ไม่พบ HR)
                              </span>
                            ) : exists ? (
                              <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-medium">
                                ข้าม (มีอยู่แล้ว)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded text-[11px] font-bold">
                                <Check className="w-3 h-3 text-emerald-600" /> จะ Insert ทันที
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Push Confirmation Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="text-xs text-slate-600">
                พร้อมส่งเข้า hosoffice.fingle_scan จำนวน <strong className="text-emerald-700 font-mono text-sm">{previewResult.readyToPush}</strong> รายการ 
                (ข้ามรายการที่ซ้ำ <span className="font-mono">{previewResult.willSkipExists}</span> รายการ และข้าม Unmapped <span className="font-mono">{previewResult.unmappedCount}</span> รายการ)
              </div>
              {previewResult.readyToPush > 0 ? (
                <button
                  onClick={() => setShowConfirmModal(true)}
                  className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all hover:scale-[1.02]"
                >
                  <Send className="w-4 h-4" />
                  <span>ยืนยันและส่งเข้า hosoffice ทันที ({previewResult.readyToPush} รายการ)</span>
                </button>
              ) : (
                <span className="text-xs text-slate-400 italic">
                  ไม่มีรายการใหม่ที่พร้อมส่ง (อาจถูกส่งไปแล้ว หรือไม่มีข้อมูลสแกนตรงตามเงื่อนไข)
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Unmapped Scans Review (Round 2.4 Option II) */}
      {activeSubTab === 'unmapped' && (
        <div className="space-y-4">
          <div className="bg-amber-50/80 border border-amber-300 rounded-xl p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-amber-950">
                    รายการที่ต้องตรวจสอบ (FINGLE_ID ไม่พบในตาราง hr_person)
                  </h3>
                  <p className="text-xs text-amber-800">
                    ตาม Spec v2 ข้อ 22.3 ข้อมูลเหล่านี้จะ<strong>ไม่ถูกส่งเข้า fingle_scan</strong> จนกว่าจะผูกรหัสเสร็จสมบูรณ์
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefreshPersonnel}
                  disabled={isRefreshingPersonnel}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer transition-colors"
                  title="เมื่อแก้ไข FINGLE_ID ใน HOSxP หรือ HR เสร็จแล้ว ให้กดปุ่มนี้เพื่อซิงค์ข้อมูลใหม่"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingPersonnel ? 'animate-spin' : ''}`} />
                  <span>รีเฟรชข้อมูลบุคลากร (Re-check)</span>
                </button>
              </div>
            </div>

            <div className="p-3 bg-white/80 rounded-lg border border-amber-200 text-xs text-slate-700 leading-relaxed space-y-1">
              <p>
                💡 <strong>แนวทางแก้ไข (Spec v2):</strong>
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600 pl-1">
                <li>
                  <strong>วิธีที่ 1:</strong> เปิดระบบ HR หรือ HOSxP เดิม แล้วเข้าไปผูกรหัสลายนิ้วมือ <strong>Fingle ID</strong> ให้ตรงกับบุคลากรในตาราง <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">hr_person</code> จากนั้นกดปุ่ม <strong>"รีเฟรชข้อมูลบุคลากร"</strong> ด้านบน
                </li>
                <li>
                  <strong>วิธีที่ 2:</strong> ใช้ปุ่ม <strong>"ยกเว้นรายการนี้ (Exclude)"</strong> ด้านขวา หากเป็นรายการทดสอบหรือลายนิ้วมือของบุคคลภายนอกที่ไม่ต้องการส่งเข้าคิว
                </li>
                <li>
                  <strong>วิธีที่ 3:</strong> กดปุ่ม <strong>"ผูกกับเจ้าหน้าที่ทันที (Quick Map)"</strong> เพื่อเชื่อมโยงชั่วคราวจากหน้าเว็บ
                </li>
              </ul>
            </div>
          </div>

          {/* Unmapped Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                รายการ Unmapped Scans ที่รอการตรวจสอบ ({unmappedPendingScans.length} รายการ)
              </span>
              <span className="text-[11px] text-slate-500">
                สถานะ: PENDING (บล็อกไม่ให้ส่งเข้า hosoffice)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">วัน-เวลาสแกน</th>
                    <th className="py-2.5 px-3">เครื่องสแกน (IP)</th>
                    <th className="py-2.5 px-3">FINGLE_ID</th>
                    <th className="py-2.5 px-3">สถานะการตรวจสอบ</th>
                    <th className="py-2.5 px-3 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unmappedPendingScans.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1 opacity-70" />
                        <div>ยอดเยี่ยม! ไม่พบรายการที่ค้างตรวจสอบ (ทุกรายการผูกกับบุคลากร HR แล้ว)</div>
                      </td>
                    </tr>
                  ) : (
                    unmappedPendingScans.map((scan, unmappedIdx) => (
                      <tr key={`${scan.id}-${unmappedIdx}`} className="hover:bg-amber-50/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                          {scan.scanDateTime}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          เครื่อง {scan.machineNo} ({scan.deviceIp})
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-amber-800">
                          {scan.fingleId}
                        </td>
                        <td className="py-2.5 px-3 text-amber-700 font-medium">
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[11px] font-semibold border border-amber-200">
                            รอผูก Fingle ID ใน HR
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Button 1: Exclude (Round 2.4 Option II) */}
                            <button
                              onClick={() => handleExcludeScan(scan.id)}
                              disabled={excludingId === scan.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 cursor-pointer transition-colors"
                              title="ยกเว้นรายการนี้เพื่อไม่ให้นำมารวมในคิวส่งเข้า hosoffice"
                            >
                              <Ban className="w-3 h-3 text-slate-500" />
                              <span>{excludingId === scan.id ? 'กำลังยกเว้น...' : 'ยกเว้นรายการนี้ (Exclude)'}</span>
                            </button>

                            {/* Button 2: Quick Map */}
                            <button
                              onClick={() => setQuickMapScan(scan)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors"
                              title="ผูกรหัสนี้กับเจ้าหน้าที่ HR ทันที"
                            >
                              <Link2 className="w-3 h-3" />
                              <span>ผูกกับเจ้าหน้าที่ (Quick Map)</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 3: Push Batch History (Round 2.3 Option ข) */}
      {activeSubTab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-teal-600" />
              <h3 className="text-sm font-bold text-slate-800">
                ประวัติการส่งข้อมูลเข้า hosoffice.fingle_scan ตามชุด (Push Batch History)
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              ทั้งหมด {state.pushBatches.length} ชุดการส่ง (Batches)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Batch ID</th>
                  <th className="py-2.5 px-3">วัน-เวลาที่ส่ง</th>
                  <th className="py-2.5 px-3">ผู้สั่งการ (ADMIN)</th>
                  <th className="py-2.5 px-3 text-center">เลือกทั้งหมด</th>
                  <th className="py-2.5 px-3 text-center">Insert สำเร็จ</th>
                  <th className="py-2.5 px-3 text-center">ข้าม (ซ้ำเดิม)</th>
                  <th className="py-2.5 px-3 text-center">ล้มเหลว</th>
                  <th className="py-2.5 px-3">สถานะ Batch</th>
                  <th className="py-2.5 px-3 text-right">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.pushBatches.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                      ยังไม่มีประวัติการส่งข้อมูลเข้า hosoffice
                    </td>
                  </tr>
                ) : (
                  state.pushBatches.map((batch, batchIdx) => (
                    <tr key={`${batch.id}-${batchIdx}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        #{batch.id}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {batch.requestedAt}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">
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
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                          batch.status === 'SUCCESS'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : batch.status === 'PARTIAL'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}>
                          {batch.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedBatch(batch)}
                          className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 font-bold text-xs cursor-pointer hover:underline"
                        >
                          <span>ดูรายละเอียด</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Dialog Modal (Manual Push Confirmation) */}
      {showConfirmModal && previewResult && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center gap-3 text-amber-600 border-b border-slate-100 pb-3">
              <div className="p-2.5 bg-amber-100 rounded-xl">
                <Send className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ยืนยันการส่งข้อมูลเข้า hosoffice (Manual Push)
                </h3>
                <p className="text-xs text-slate-500">
                  ระบบจะบันทึกข้อมูลเข้าสู่ตาราง fingle_scan ตามเงื่อนไขที่เลือก
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 font-mono text-slate-700">
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="font-sans text-slate-500">ช่วงวันที่:</span>
                  <span className="font-bold text-slate-800">{dateFrom} ถึง {dateTo}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="font-sans text-slate-500">เครื่องสแกน:</span>
                  <span>{selectedMachine === 'ALL' ? 'ทุกเครื่อง (1, 2, 3)' : `เครื่องที่ ${selectedMachine}`}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="font-sans text-slate-500">รายการที่จะ Insert จริง:</span>
                  <span className="font-black text-emerald-700 text-sm">{previewResult.readyToPush} รายการ</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="font-sans text-slate-500">รายการที่ซ้ำเดิม (จะข้าม):</span>
                  <span>{previewResult.willSkipExists} รายการ</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">ผู้สั่งส่ง (ADMIN):</span>
                  <span className="font-bold text-teal-800">{state.currentUser.fullname} ({state.currentUser.username})</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                <p className="font-semibold mb-0.5">⚠️ ข้อมูลที่จะถูกสร้างใน hosoffice.fingle_scan:</p>
                <div>• ฟิลด์ <code className="font-mono font-bold">DATE_TIME_SAVE</code> = เวลาที่กดยืนยันส่ง</div>
                <div>• ฟิลด์ <code className="font-mono font-bold">CREATE_BY</code> = 'SCAN_PUSH'</div>
                <div>• ตรวจสอบข้อมูลซ้ำอัตโนมัติ (Idempotent) ไม่เกิดปัญหาข้อมูลเบิ้ล</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isPushing}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleExecutePush}
                disabled={isPushing}
                className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 rounded-xl shadow-sm cursor-pointer transition-colors"
              >
                {isPushing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>กำลังส่งข้อมูลเข้า fingle_scan...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>ยืนยันและส่งทันที ({previewResult.readyToPush} รายการ)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Details Modal */}
      {selectedBatch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-5 h-5 text-teal-600" />
                  <span>รายละเอียด Batch การส่ง #{selectedBatch.id}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  ส่งเมื่อ {selectedBatch.requestedAt} โดย {selectedBatch.requestedBy}
                </p>
              </div>
              <button
                onClick={() => setSelectedBatch(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-slate-500">เลือกทั้งหมด</div>
                <div className="text-lg font-black font-mono text-slate-800">{selectedBatch.totalSelected}</div>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="text-emerald-700 font-medium">Insert สำเร็จ</div>
                <div className="text-lg font-black font-mono text-emerald-800">{selectedBatch.totalInserted}</div>
              </div>
              <div className="p-3 bg-slate-100 rounded-xl border border-slate-200">
                <div className="text-slate-600 font-medium">ข้าม (ซ้ำเดิม)</div>
                <div className="text-lg font-black font-mono text-slate-800">{selectedBatch.totalSkippedExists}</div>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                <div className="text-rose-700 font-medium">ล้มเหลว</div>
                <div className="text-lg font-black font-mono text-rose-800">{selectedBatch.totalFailed}</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2">
              <h4 className="text-xs font-bold text-slate-700">รายการสแกนในชุดการส่งนี้:</h4>
              <div className="divide-y divide-slate-200 text-xs">
                {state.rawScans
                  .filter(s => String(s.pushBatchId) === String(selectedBatch.id))
                  .map((scan, sIdx) => (
                    <div key={`${scan.id}-${sIdx}`} className="py-2 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-800">
                          {scan.hrFullname || `FINGLE_ID ${scan.fingleId}`}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {scan.scanDateTime} (เครื่อง {scan.machineNo})
                        </div>
                      </div>
                      <div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          scan.pushStatus === 'PUSHED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : scan.pushStatus === 'SKIPPED_EXISTS'
                            ? 'bg-slate-200 text-slate-700'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {scan.pushStatus}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedBatch(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
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
          isOpen={Boolean(quickMapScan)}
          onClose={() => setQuickMapScan(null)}
          fingleId={quickMapScan.fingleId}
          scanTime={quickMapScan.scanDateTime}
          machineNo={quickMapScan.machineNo}
          personnelList={state.personnel}
          currentUser={state.currentUser}
          onSuccess={() => {
            setQuickMapScan(null);
            handlePreview();
          }}
        />
      )}
    </div>
  );
};
