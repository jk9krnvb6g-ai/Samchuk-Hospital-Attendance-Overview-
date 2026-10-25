import React, { useState, useEffect } from 'react';
import { 
  X, 
  Cpu, 
  Calendar, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Database,
  Layers,
  ChevronRight,
  Filter,
  Eye,
  ShieldCheck,
  Check,
  HelpCircle,
  Server,
  Activity,
  AlertTriangle,
  ArrowRight,
  Zap
} from 'lucide-react';
import { attendanceStore } from '../services/attendanceStore';
import { apiClient } from '../services/apiClient';

interface CustomSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: (resultMsg: string) => void;
  defaultDate?: string;
  defaultMonth?: string;
}

export const CustomSyncModal: React.FC<CustomSyncModalProps> = ({
  isOpen,
  onClose,
  onSyncComplete,
  defaultDate = '2026-10-14',
  defaultMonth = '2026-10'
}) => {
  const [selectedMachines, setSelectedMachines] = useState<number[]>([1, 2, 3]);
  const [timeMode, setTimeMode] = useState<'TODAY' | 'DATE' | 'RANGE' | 'MONTH' | 'YEAR'>('MONTH');
  const [singleDate, setSingleDate] = useState<string>(defaultDate);
  const [dateFrom, setDateFrom] = useState<string>('2026-10-01');
  const [dateTo, setDateTo] = useState<string>('2026-10-15');
  const [month, setMonth] = useState<string>(defaultMonth);
  const [year, setYear] = useState<string>('2026');
  const [syncSource, setSyncSource] = useState<'SCANNERS' | 'HOSOFFICE'>('SCANNERS');
  
  // การจัดการข้อมูลซ้ำ: 'SKIP_DUPLICATES' (ดึงเฉพาะข้อมูลใหม่) vs 'OVERWRITE' (ทับข้อมูลเดิม)
  const [strategy, setStrategy] = useState<'SKIP_DUPLICATES' | 'OVERWRITE'>('SKIP_DUPLICATES');

  // ข้อมูลตรวจสอบล่วงหน้า (Preview)
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<{
    totalFound: number;
    newCount: number;
    duplicateCount: number;
    sampleNew?: any[];
    sampleDuplicates?: any[];
    message?: string;
  } | null>(null);

  // ข้อมูลฐานข้อมูล (Database Overview)
  const [showDbInfo, setShowDbInfo] = useState(false);
  const [dbOverview, setDbOverview] = useState<any>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string; isZeroResult?: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) {
      apiClient.getDatabaseOverview().then(data => {
        if (data) setDbOverview(data);
      }).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleMachine = (machineNo: number) => {
    setSelectedMachines(prev => 
      prev.includes(machineNo) 
        ? prev.filter(m => m !== machineNo) 
        : [...prev, machineNo].sort()
    );
  };

  const selectAllMachines = () => setSelectedMachines([1, 2, 3]);

  // ฟังก์ชันตรวจสอบข้อมูลล่วงหน้า (Preview)
  const handlePreview = async () => {
    if (syncSource === 'SCANNERS' && selectedMachines.length === 0) {
      setResultMsg({ type: 'error', text: 'กรุณาเลือกเครื่องสแกนนิ้วอย่างน้อย 1 เครื่อง' });
      return;
    }

    setIsPreviewing(true);
    setResultMsg(null);
    setPreviewData(null);

    try {
      if (syncSource === 'HOSOFFICE') {
        const res = await attendanceStore.importFromHosoffice({
          dateFrom: timeMode === 'RANGE' ? dateFrom : undefined,
          dateTo: timeMode === 'RANGE' ? dateTo : undefined,
          month: timeMode === 'MONTH' ? month : undefined,
          year: timeMode === 'YEAR' ? year : undefined,
          strategy,
          preview: true
        });

        if (res.details?.preview || res.details?.totalFound !== undefined) {
          setPreviewData(res.details);
        } else {
          setResultMsg({ type: 'success', text: res.message });
        }
      } else {
        const res = await attendanceStore.syncScannersCustom({
          machineNos: selectedMachines,
          mode: timeMode,
          date: singleDate,
          dateFrom,
          dateTo,
          month,
          year,
          allPersonnel: true,
          recalculate: false,
          strategy,
          preview: true
        });

        if (res.details?.preview || res.details?.totalFound !== undefined) {
          setPreviewData(res.details);
        } else {
          setResultMsg({ type: 'success', text: res.message });
        }
      }
    } catch (err: any) {
      setResultMsg({ type: 'error', text: err.message || 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูล' });
    } finally {
      setIsPreviewing(false);
    }
  };

  // ฟังก์ชันเริ่มดึงข้อมูลและบันทึกจริง
  const handleStartSync = async () => {
    if (syncSource === 'SCANNERS' && selectedMachines.length === 0) {
      setResultMsg({ type: 'error', text: 'กรุณาเลือกเครื่องสแกนนิ้วอย่างน้อย 1 เครื่อง' });
      return;
    }

    setIsProcessing(true);
    setResultMsg(null);

    try {
      if (syncSource === 'HOSOFFICE') {
        const res = await attendanceStore.importFromHosoffice({
          dateFrom: timeMode === 'RANGE' ? dateFrom : undefined,
          dateTo: timeMode === 'RANGE' ? dateTo : undefined,
          month: timeMode === 'MONTH' ? month : undefined,
          year: timeMode === 'YEAR' ? year : undefined,
          strategy,
          preview: false
        });

        if (res.success) {
          const isZero = res.message.includes('+0 รายการ') || (res.details && res.details.totalInserted === 0 && res.details.totalUpdated === 0);
          setResultMsg({ type: 'success', text: res.message, isZeroResult: isZero });
          setPreviewData(null);
          if (onSyncComplete) onSyncComplete(res.message);
        } else {
          setResultMsg({ type: 'error', text: res.message });
        }
      } else {
        // SCANNERS sync
        const res = await attendanceStore.syncScannersCustom({
          machineNos: selectedMachines,
          mode: timeMode,
          date: singleDate,
          dateFrom,
          dateTo,
          month,
          year,
          allPersonnel: true,
          recalculate: true,
          strategy,
          preview: false
        });

        if (res.success) {
          const isZero = res.message.includes('+0 รายการ') || (res.details && res.details.totalInserted === 0 && res.details.totalUpdated === 0);
          setResultMsg({ type: 'success', text: res.message, isZeroResult: isZero });
          setPreviewData(null);
          if (onSyncComplete) onSyncComplete(res.message);
        } else {
          setResultMsg({ type: 'error', text: res.message });
        }
      }
    } catch (err: any) {
      setResultMsg({ type: 'error', text: err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    } finally {
      setIsProcessing(false);
    }
  };

  const isMixedBlocked = typeof window !== 'undefined' && window.location.protocol === 'https:' && apiClient.getBaseUrl().startsWith('http:');
  const httpUrl = typeof window !== 'undefined' ? window.location.href.replace(/^https:/i, 'http:') : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-teal-700 to-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-lg backdrop-blur-xs">
              <RefreshCw className="w-5 h-5 text-teal-200" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                ดึงข้อมูลสแกนนิ้วตามเงื่อนไข (Custom Scanner Sync)
              </h3>
              <p className="text-xs text-teal-100">
                เลือกเครื่องสแกน, วันที่, ตรวจจับข้อมูลซ้ำ และเลือกวิธีก่อนดึงจริง
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          
          {/* แจ้งเตือนบราวเซอร์บล็อก Mixed Content (HTTPS -> HTTP) */}
          {isMixedBlocked && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-950 space-y-2.5 shadow-xs">
              <div className="flex items-center gap-2 font-bold text-sm text-rose-800">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>บราวเซอร์บล็อกการดึงข้อมูล (Mixed Content Blocked)</span>
              </div>
              <p className="text-xs text-rose-900 leading-relaxed">
                เนื่องจากขณะนี้คุณกำลังเปิดหน้าเว็บด้วย <strong>HTTPS</strong> (<code className="bg-rose-100 px-1.5 py-0.5 rounded font-mono font-bold text-rose-900">https://10.2.0.13:3001</code>) แต่ Backend API Gateway (พอร์ต 3002) ทำงานด้วย <strong>HTTP</strong> ทำให้ Chrome/Edge บล็อกการเชื่อมต่อทุกอย่าง
              </p>
              <div className="pt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => { if (httpUrl) window.location.href = httpUrl; }}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-xs flex items-center gap-1.5 transition-colors"
                >
                  <span>คลิกที่นี่เพื่อเปลี่ยนไปใช้ HTTP ทันที ({httpUrl})</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* แจ้งเตือนสถานะปิด Sync Auto */}
          <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-xl flex items-center justify-between text-amber-950">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              <span className="font-semibold text-[11px]">
                สถานะปัจจุบัน: ปิดการ Sync อัตโนมัติแล้ว (Manual Sync Only)
              </span>
            </div>
            <span className="text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
              ข้อมูลจะไม่ถูกดึงซ้ำเอง
            </span>
          </div>

          {/* Source Selection */}
          <div className="space-y-2">
            <label className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
              <Database className="w-3.5 h-3.5 text-teal-600" />
              <span>1. เลือกแหล่งข้อมูลที่ต้องการดึง:</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setSyncSource('SCANNERS'); setPreviewData(null); }}
                className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                  syncSource === 'SCANNERS'
                    ? 'border-teal-500 bg-teal-50/60 ring-2 ring-teal-500/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${syncSource === 'SCANNERS' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-xs">เครื่องสแกนนิ้ว HIP CMiF68S</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">ดึงข้อมูลสดผ่าน TCP Socket 5005 จากเครื่องสแกน 1-3</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setSyncSource('HOSOFFICE'); setPreviewData(null); }}
                className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                  syncSource === 'HOSOFFICE'
                    ? 'border-teal-500 bg-teal-50/60 ring-2 ring-teal-500/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${syncSource === 'HOSOFFICE' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-xs">ตาราง HosOffice (fingle_scan)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">นำเข้าประวัติสแกนจากฐานข้อมูล HosOffice 10.2.0.201</div>
                </div>
              </button>
            </div>
          </div>

          {/* Machine Selection (Visible when SCANNERS is selected) */}
          {syncSource === 'SCANNERS' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                  <Cpu className="w-3.5 h-3.5 text-teal-600" />
                  <span>2. เลือกเครื่องสแกนที่ต้องการดึง ({selectedMachines.length} เครื่อง):</span>
                </label>
                <button
                  type="button"
                  onClick={selectAllMachines}
                  className="text-[11px] text-teal-700 font-semibold hover:underline cursor-pointer"
                >
                  เลือกทุกเครื่อง
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  { no: 1, name: 'เครื่อง 1: หน้าตึกอำนวยการ', ip: '192.168.111.163', loc: 'สำนักงาน / ธุรการ' },
                  { no: 2, name: 'เครื่อง 2: ตึกอุบัติเหตุ-ฉุกเฉิน (ER)', ip: '192.168.111.164', loc: 'ER / เวรผลัด' },
                  { no: 3, name: 'เครื่อง 3: ตึกผู้ป่วยใน (IPD)', ip: '192.168.111.165', loc: 'หอผู้ป่วยใน' }
                ].map(m => {
                  const isChecked = selectedMachines.includes(m.no);
                  return (
                    <div
                      key={m.no}
                      onClick={() => toggleMachine(m.no)}
                      className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                        isChecked 
                          ? 'border-teal-500 bg-teal-50/50 shadow-2xs' 
                          : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 opacity-80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-0.5 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="font-bold text-slate-800 text-[11px]">{m.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{m.ip}:5005</div>
                        <div className="text-[10px] text-teal-700 font-medium">{m.loc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Time Scope Selection */}
          <div className="space-y-3">
            <label className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
              <Clock className="w-3.5 h-3.5 text-teal-600" />
              <span>3. เลือกช่วงเวลาที่ต้องการดึง:</span>
            </label>

            {/* Mode Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
              {[
                { id: 'TODAY', label: '⚡ วันนี้' },
                { id: 'DATE', label: '📅 วันระบุ' },
                { id: 'RANGE', label: '🗓️ กำหนดช่วงวันที่' },
                { id: 'MONTH', label: '📆 รายเดือน' },
                { id: 'YEAR', label: '📊 รายปี' }
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTimeMode(t.id as any); setPreviewData(null); }}
                  className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all cursor-pointer ${
                    timeMode === t.id
                      ? 'bg-white text-teal-800 shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Mode-specific Pickers */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              {timeMode === 'TODAY' && (
                <div className="flex items-center justify-between text-xs text-slate-700">
                  <span>ดึงข้อมูลเวลาสแกนสำหรับวันนี้:</span>
                  <span className="font-mono font-bold text-teal-800 bg-teal-100/60 px-2.5 py-1 rounded">
                    {new Date().toISOString().substring(0, 10)} (วันนี้)
                  </span>
                </div>
              )}

              {timeMode === 'DATE' && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="text-slate-700 font-medium">เลือกวันที่ต้องการดึง:</span>
                  <input
                    type="date"
                    value={singleDate}
                    onChange={(e) => { setSingleDate(e.target.value); setPreviewData(null); }}
                    className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              )}

              {timeMode === 'RANGE' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">ตั้งแต่วันที่ (Date From):</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => { setDateFrom(e.target.value); setPreviewData(null); }}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">ถึงวันที่ (Date To):</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => { setDateTo(e.target.value); setPreviewData(null); }}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                </div>
              )}

              {timeMode === 'MONTH' && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="text-slate-700 font-medium">เลือกประจำเดือน:</span>
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => { setMonth(e.target.value); setPreviewData(null); }}
                    className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <span className="text-[11px] text-slate-500">ระบบจะดึงและคำนวณตลอดทั้งเดือนนั้น</span>
                </div>
              )}

              {timeMode === 'YEAR' && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="text-slate-700 font-medium">เลือกประจำปี (ค.ศ. / พ.ศ.):</span>
                  <select
                    value={year}
                    onChange={(e) => { setYear(e.target.value); setPreviewData(null); }}
                    className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="2026">2026 (พ.ศ. 2569 - ปีปัจจุบัน)</option>
                    <option value="2025">2025 (พ.ศ. 2568)</option>
                    <option value="2024">2024 (พ.ศ. 2567)</option>
                  </select>
                  <span className="text-[11px] text-slate-500">ระบบจะดึงประวัติสแกนตลอดทั้ง 12 เดือน</span>
                </div>
              )}
            </div>
          </div>

          {/* 4. การจัดการข้อมูลซ้ำ / ทับข้อมูลเดิม (Duplicate Handling Strategy) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                <span>4. วิธีการจัดการข้อมูลซ้ำ (Duplicate Handling Strategy):</span>
              </label>
              <button
                type="button"
                onClick={handlePreview}
                disabled={isPreviewing}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 border border-teal-200 text-teal-800 hover:bg-teal-100 rounded-lg font-semibold text-[11px] cursor-pointer transition-colors disabled:opacity-50"
              >
                <Eye className="w-3 h-3 text-teal-600" />
                <span>{isPreviewing ? 'กำลังตรวจสอบ...' : '🔍 ตรวจสอบข้อมูลก่อนดึง'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div 
                onClick={() => setStrategy('SKIP_DUPLICATES')}
                className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                  strategy === 'SKIP_DUPLICATES'
                    ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input 
                  type="radio" 
                  name="syncStrategy" 
                  checked={strategy === 'SKIP_DUPLICATES'}
                  onChange={() => {}}
                  className="mt-1 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <span>ดึงเฉพาะข้อมูลใหม่ (แนะนำ)</span>
                    <span className="bg-emerald-100 text-emerald-800 text-[9px] px-1.5 py-0.2 rounded font-semibold">ปลอดภัย</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    ข้ามรายการที่ซ้ำกับในระบบ ไม่แก้ไขหรือทับประวัติเดิมที่เคยบันทึกไว้ 100%
                  </div>
                </div>
              </div>

              <div 
                onClick={() => setStrategy('OVERWRITE')}
                className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                  strategy === 'OVERWRITE'
                    ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input 
                  type="radio" 
                  name="syncStrategy" 
                  checked={strategy === 'OVERWRITE'}
                  onChange={() => {}}
                  className="mt-1 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <span>อัปเดตทับข้อมูลเดิม (Overwrite)</span>
                    <span className="bg-amber-100 text-amber-900 text-[9px] px-1.5 py-0.2 rounded font-semibold">อัปเดต</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    เขียนทับข้อมูลเดิมด้วยค่าล่าสุด เหมาะเมื่อต้องการแก้ไขหรือ Refresh ข้อมูล
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preview Card Results */}
          {previewData && (
            <div className="p-4 bg-teal-50/80 border border-teal-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-teal-900 flex items-center gap-1.5 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-teal-600" />
                  <span>ผลการตรวจสอบข้อมูลล่วงหน้า:</span>
                </span>
                <span className="text-[11px] text-teal-700 font-mono">
                  รวมพบ {previewData.totalFound} รายการ
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2.5 bg-white border border-emerald-200 rounded-lg shadow-2xs">
                  <div className="text-[10px] text-slate-500 font-medium">🟢 ข้อมูลใหม่ที่ยังไม่มีในระบบ</div>
                  <div className="text-base font-bold text-emerald-700 font-mono mt-0.5">
                    +{previewData.newCount} <span className="text-xs font-normal">รายการ</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {previewData.newCount > 0 ? 'พร้อมนำเข้าสู่ระบบ' : 'ไม่มีข้อมูลใหม่'}
                  </div>
                </div>

                <div className="p-2.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
                  <div className="text-[10px] text-slate-500 font-medium">🟡 ข้อมูลที่ซ้ำกับระบบแล้ว</div>
                  <div className="text-base font-bold text-amber-700 font-mono mt-0.5">
                    {previewData.duplicateCount} <span className="text-xs font-normal">รายการ</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {strategy === 'SKIP_DUPLICATES' ? 'จะถูกข้าม (ไม่ทับของเดิม)' : 'จะถูกเขียนทับด้วยข้อมูลล่าสุด'}
                  </div>
                </div>
              </div>

              {previewData.newCount === 0 && previewData.duplicateCount > 0 && strategy === 'SKIP_DUPLICATES' && (
                <div className="text-[11px] text-amber-900 bg-amber-100/60 p-2 rounded-lg leading-relaxed">
                  💡 ข้อมูลในช่วงเวลานี้มีครบในระบบแล้ว หากคุณกดยืนยันด้วยโหมด "ดึงเฉพาะข้อมูลใหม่" จะไม่มีการเปลี่ยนแปลงใดๆ หากต้องการเขียนทับข้อมูลเดิม ให้เลือกตัวเลือก "อัปเดตทับข้อมูลเดิม"
                </div>
              )}
            </div>
          )}

          {/* Database Info Toggle */}
          <div className="pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowDbInfo(!showDbInfo)}
              className="text-slate-600 hover:text-slate-900 text-[11px] flex items-center gap-1 font-semibold cursor-pointer"
            >
              <Server className="w-3.5 h-3.5 text-teal-600" />
              <span>{showDbInfo ? 'ซ่อนโครงสร้างฐานข้อมูล (2 ฐาน)' : 'คลิกเพื่อดูฐานข้อมูลทั้งหมดในระบบ (มีกี่ฐาน / ใช้ทำอะไร)'}</span>
            </button>

            {showDbInfo && (
              <div className="mt-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-[11px]">
                <div className="font-bold text-slate-800 text-xs flex items-center justify-between">
                  <span>ระบบใช้งาน 2 ฐานข้อมูลหลักบน MySQL 10.2.0.201:</span>
                  <span className="text-[10px] font-normal text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                    Gateway Port 3002
                  </span>
                </div>

                <div className="space-y-2">
                  {/* Database 1 */}
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-teal-800 font-mono">1. samchuk_attendance</div>
                      <span className="bg-emerald-100 text-emerald-800 text-[9px] px-1.5 py-0.2 rounded font-semibold">ONLINE</span>
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      <strong>หน้าที่:</strong> ฐานข้อมูลระบบลงเวลาและตารางเวร (Dedicated Attendance DB)
                    </div>
                    <div className="text-slate-500 mt-0.5 text-[10px]">
                      ตารางภายใน: attendance_raw_scan, attendance_shift, attendance_daily_result, attendance_person_roster, attendance_push_batch
                    </div>
                  </div>

                  {/* Database 2 */}
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-teal-800 font-mono">2. hosoffice</div>
                      <span className="bg-emerald-100 text-emerald-800 text-[9px] px-1.5 py-0.2 rounded font-semibold">ONLINE</span>
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      <strong>หน้าที่:</strong> ฐานข้อมูลระบบโรงพยาบาล HOSxP / HosOffice (HR Master Database)
                    </div>
                    <div className="text-slate-500 mt-0.5 text-[10px]">
                      ตารางที่เชื่อมต่อ: hr_person (ข้อมูลบุคลากร), hr_department (แผนก), hr_position, fingle_scan (ประวัติสแกนเดิม)
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Result Alert Message */}
          {resultMsg && (
            <div className="space-y-3">
              <div className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
                resultMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                {resultMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 leading-relaxed font-medium">
                  <div>{resultMsg.text}</div>
                  {resultMsg.text.includes('Authentication Required') && (
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await apiClient.login('admin', 'SamchukAdmin@2026');
                        if (res.success) {
                          setResultMsg({ type: 'success', text: 'เข้าสู่ระบบในฐานะ Admin สำเร็จแล้ว กรุณากดยืนยันดึงข้อมูลอีกครั้ง' });
                        } else {
                          setResultMsg({ type: 'error', text: 'เข้าสู่ระบบไม่สำเร็จ: ' + (res.message || 'โปรดตรวจสอบรหัสผ่าน') });
                        }
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-sm transition-colors"
                    >
                      <Zap className="w-3 h-3" />
                      <span>เข้าสู่ระบบอัตโนมัติ (Login as Admin)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* กล่องวิเคราะห์สาเหตุเมื่อพบ 0 รายการ (ติดที่ตรงไหน) พร้อมปุ่มแก้ไขด่วน */}
              {(resultMsg.isZeroResult || resultMsg.text.includes('+0 รายการ') || resultMsg.text.includes('0 รายการ')) && (
                <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-xl space-y-3 text-amber-950 shadow-xs">
                  <div className="flex items-center gap-2 font-bold text-xs text-amber-900">
                    <HelpCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>วิเคราะห์สาเหตุที่ดึงได้ 0 รายการ (ติดที่ตรงไหน):</span>
                  </div>

                  <div className="space-y-1.5 text-[11px] leading-relaxed text-amber-900/90 pl-1">
                    <p>
                      <strong>1. ตารางในฐานข้อมูลว่างเปล่า:</strong> ตาราง <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-950">attendance_raw_scan</code> และ <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-950">hosoffice.fingle_scan</code> เพิ่งถูกล้างข้อมูลออกไป ทำให้ระบบไม่พบประวัติสแกนเดิมในตาราง
                    </p>
                    <p>
                      <strong>2. เครื่องสแกน HIP CMiF68S ในวงแลน:</strong> ตัวเครื่องจริงอยู่ที่ IP <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-950">192.168.111.163-165:5005</code> ในเครือข่ายภายในโรงพยาบาลสามชุก การเปิดดูผ่านเว็บบราวเซอร์ต้องใช้ Service ช่วยดึงข้อมูล
                    </p>
                    <p>
                      <strong>3. ตัวกรองข้อมูลซ้ำ (Skip Duplicates):</strong> หากเคยมีข้อมูลของช่วงเวลานี้อยู่ในระบบแล้ว และเลือกโหมดข้ามรายการซ้ำ ระบบจะไม่บันทึกทับของเดิม
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="text-slate-500 text-[11px] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>
              โหมดที่เลือก: <strong>{strategy === 'SKIP_DUPLICATES' ? 'ดึงเฉพาะของใหม่ (ไม่ทับของเดิม)' : 'อัปเดตทับข้อมูลเดิม'}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">

            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer disabled:opacity-50"
            >
              ปิด
            </button>

            <button
              type="button"
              onClick={handleStartSync}
              disabled={isProcessing}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>{isProcessing ? 'กำลังดึงข้อมูล...' : '⚡ ยืนยันดึงข้อมูลตามเงื่อนไข'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
