import React, { useState } from 'react';
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
  Filter
} from 'lucide-react';
import { attendanceStore } from '../services/attendanceStore';

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
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const toggleMachine = (machineNo: number) => {
    setSelectedMachines(prev => 
      prev.includes(machineNo) 
        ? prev.filter(m => m !== machineNo) 
        : [...prev, machineNo].sort()
    );
  };

  const selectAllMachines = () => setSelectedMachines([1, 2, 3]);

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
          year: timeMode === 'YEAR' ? year : undefined
        });

        if (res.success) {
          setResultMsg({ type: 'success', text: res.message });
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
          recalculate: true
        });

        if (res.success) {
          setResultMsg({ type: 'success', text: res.message });
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
                เลือกเครื่องสแกน, วันที่, ช่วงเวลา, รายเดือน หรือรายปี เพื่อดึง Log เข้าสู่ระบบ
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
          {/* Source Selection */}
          <div className="space-y-2">
            <label className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
              <Database className="w-3.5 h-3.5 text-teal-600" />
              <span>1. เลือกแหล่งข้อมูลที่ต้องการดึง:</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSyncSource('SCANNERS')}
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
                onClick={() => setSyncSource('HOSOFFICE')}
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
                  onClick={() => setTimeMode(t.id as any)}
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
                    onChange={(e) => setSingleDate(e.target.value)}
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
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">ถึงวันที่ (Date To):</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
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
                    onChange={(e) => setMonth(e.target.value)}
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
                    onChange={(e) => setYear(e.target.value)}
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

          {/* Result Alert Message */}
          {resultMsg && (
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
              <div className="flex-1 leading-relaxed">
                {resultMsg.text}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="text-slate-500 text-[11px]">
            * ตรวจจับและข้ามสแกนซ้ำ (Duplicate Protection) ป้องกันข้อมูลซ้ำซ้อน 100%
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
              <span>{isProcessing ? 'กำลังดึงข้อมูล...' : '⚡ เริ่มดึงข้อมูลตามเงื่อนไข'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
