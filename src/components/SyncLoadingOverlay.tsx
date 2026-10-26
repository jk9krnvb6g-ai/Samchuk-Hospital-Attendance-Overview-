import React, { useState, useEffect } from 'react';
import { 
  Fingerprint, 
  Cpu, 
  Database, 
  RefreshCw, 
  Lock, 
  CheckCircle2, 
  Wifi, 
  Server,
  ShieldAlert
} from 'lucide-react';

interface SyncLoadingOverlayProps {
  isLoading: boolean;
  title?: string;
  subtitle?: string;
  machines?: number[];
  modeText?: string;
}

export const SyncLoadingOverlay: React.FC<SyncLoadingOverlayProps> = ({
  isLoading,
  title = 'กำลังดึงข้อมูลดิบจากเครื่องสแกนนิ้วมือ...',
  subtitle = 'ระบบกำลังติดต่อเครื่องสแกน HIP CMiF68S ผ่าน TCP Port: 5005 และบันทึกลง MySQL attendance_raw_scan',
  machines = [1, 2, 3],
  modeText
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  // Cycle through realistic connection steps to give clear visual feedback
  useEffect(() => {
    if (!isLoading) {
      setCurrentStep(1);
      setElapsedSec(0);
      return;
    }

    const timer = setInterval(() => {
      setElapsedSec(prev => prev + 1);
    }, 1000);

    const stepTimer1 = setTimeout(() => setCurrentStep(2), 1200);
    const stepTimer2 = setTimeout(() => setCurrentStep(3), 2800);
    const stepTimer3 = setTimeout(() => setCurrentStep(4), 4500);
    const stepTimer4 = setTimeout(() => setCurrentStep(5), 6200);

    return () => {
      clearInterval(timer);
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);
      clearTimeout(stepTimer4);
    };
  }, [isLoading]);

  // Prevent keyboard shortcuts (Esc, Enter, Space) and right clicks while loading
  useEffect(() => {
    if (!isLoading) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isLoading]);

  if (!isLoading) return null;

  const steps = [
    {
      step: 1,
      title: 'เชื่อมต่อเครื่องสแกน HIP CMiF68S (TCP Port 5005)',
      desc: 'ส่งสัญญาณผ่านเครือข่ายแลน 192.168.111.163-165'
    },
    {
      step: 2,
      title: 'อ่านบันทึกเวลาสแกนดิบ (Raw Log Scans)',
      desc: 'ดึงรหัสลายนิ้วมือ, วันที่, เวลา, Verify Mode และ In/Out Status'
    },
    {
      step: 3,
      title: 'บันทึกข้อมูลเข้า MySQL Staging DB (attendance_raw_scan)',
      desc: 'ตรวจสอบและคัดกรองข้อมูลซ้ำตามเงื่อนไขอย่างปลอดภัย'
    },
    {
      step: 4,
      title: 'ตรวจสอบรหัส FINGLE_ID และจับคู่ทำเนียบบุคลากร HR',
      desc: 'Snapshot ชื่อ-สกุล, ตำแหน่ง, และฝ่าย/กลุ่มงาน'
    },
    {
      step: 5,
      title: 'ประมวลผลเวลาเข้า-ออกงานและอัปเดตรายงานสรุป',
      desc: 'คำนวณการมาสาย, ออกก่อน, OT และอัปเดตตารางผลลัพธ์'
    }
  ];

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md cursor-wait select-none transition-all duration-300 animate-fade-in"
      onClick={(e) => {
        // Prevent all clicks outside from closing or doing anything
        e.preventDefault();
        e.stopPropagation();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Strip with Animated Gradient */}
        <div className="h-2 w-full bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-500 animate-pulse" />

        {/* Modal Header */}
        <div className="p-6 pb-4 bg-slate-900 text-white relative overflow-hidden">
          {/* Background Decorative Rings */}
          <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none text-teal-400">
            <Fingerprint className="w-48 h-48" />
          </div>

          <div className="flex items-center justify-between gap-3 relative z-10 mb-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-semibold border border-teal-400/30">
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
              <span>โรงพยาบาลสามชุก · ระบบดึงเวลาสแกนดิบ</span>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-mono text-amber-300 bg-amber-500/10 border border-amber-400/20 px-2.5 py-1 rounded-full">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>ระบบล็อกหน้าจอ ({elapsedSec} วินาที)</span>
            </div>
          </div>

          <div className="flex items-start gap-4 relative z-10">
            {/* Animated Radar Icon */}
            <div className="relative p-3.5 bg-gradient-to-br from-teal-500/20 to-teal-700/40 rounded-2xl border border-teal-400/30 shrink-0">
              <Fingerprint className="w-9 h-9 text-teal-300 animate-pulse" />
              <div className="absolute inset-0 rounded-2xl border border-teal-400/40 animate-ping pointer-events-none" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white tracking-tight">
                {title}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                {subtitle}
              </p>
              {modeText && (
                <div className="text-[11px] font-mono text-teal-300 pt-0.5">
                  เงื่อนไข: {modeText}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Machine Status Radar Strip */}
        <div className="bg-slate-800/95 px-6 py-2.5 border-y border-slate-700/60 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="font-semibold text-slate-200">เครื่องสแกนที่กำลังเชื่อมต่อ:</span>
          </div>

          <div className="flex items-center gap-2">
            {[
              { no: 1, name: 'เครื่อง 1 (อำนวยการ)', ip: '192.168.111.163' },
              { no: 2, name: 'เครื่อง 2 (ER ฉุกเฉิน)', ip: '192.168.111.164' },
              { no: 3, name: 'เครื่อง 3 (IPD ผู้ป่วยใน)', ip: '192.168.111.165' },
            ].map(m => {
              const isSelected = machines.includes(m.no);
              return (
                <div 
                  key={m.no}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-colors ${
                    isSelected 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                      : 'bg-slate-700/50 text-slate-400 opacity-60'
                  }`}
                  title={`${m.name} (${m.ip}:5005)`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
                  <span>#{m.no}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Body: Steps Checklist & Status */}
        <div className="p-6 space-y-4 bg-slate-50">
          {/* Steps Progress */}
          <div className="space-y-2.5 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span>ขั้นตอนการประมวลผล (Processing Pipeline):</span>
              <span className="font-mono text-teal-700 text-[11px]">
                {Math.min(currentStep, 5)} / 5
              </span>
            </div>

            {steps.map((st) => {
              const isDone = currentStep > st.step;
              const isCurrent = currentStep === st.step;
              const isWaiting = currentStep < st.step;

              return (
                <div 
                  key={st.step}
                  className={`flex items-start gap-3 p-2.5 rounded-xl border transition-all ${
                    isCurrent 
                      ? 'bg-teal-50/70 border-teal-300 ring-1 ring-teal-500/20' 
                      : isDone
                      ? 'bg-emerald-50/40 border-emerald-200/70'
                      : 'bg-slate-50/60 border-slate-100 opacity-60'
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : isCurrent ? (
                      <RefreshCw className="w-4 h-4 text-teal-600 animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[10px] text-slate-400 font-mono">
                        {st.step}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-semibold ${
                      isCurrent ? 'text-teal-950 font-bold' : isDone ? 'text-emerald-900' : 'text-slate-500'
                    }`}>
                      {st.title}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {st.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Warning Banner: Locking UI */}
          <div className="p-3.5 bg-amber-50 border border-amber-300/80 rounded-xl flex items-start gap-2.5 text-amber-950 text-xs leading-relaxed shadow-2xs">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-amber-900 flex items-center gap-1">
                <span>กรุณารอสักครู่ · ไม่สามารถกดปุ่มหรือสลับหน้าได้</span>
              </div>
              <p className="text-[11px] text-amber-800/90 mt-0.5">
                เพื่อความปลอดภัยของฐานข้อมูล MySQL และความถูกต้องของข้อมูลสแกนนิ้ว ระบบได้ล็อกการคลิกทั้งหมดไว้ ห้ามปิดแท็บหรือรีเฟรชหน้าจอจนกว่าหน้าต่างนี้จะปิดเองอัตโนมัติ
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer Progress Indicator */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <RefreshCw className="w-3.5 h-3.5 text-teal-600 animate-spin" />
            <span className="font-medium text-slate-700">กำลังทำงาน กรุณารอสักครู่...</span>
          </div>

          <div className="font-mono font-bold text-teal-800 text-xs">
            สถานะ: PROCESSING...
          </div>
        </div>
      </div>
    </div>
  );
};
