import React, { useState, useMemo } from 'react';
import { 
  Clock, 
  Users, 
  Plus, 
  Trash2, 
  Save, 
  X,
  Database, 
  Search, 
  Sun,
  Sunset,
  Moon,
  AlertCircle,
  RotateCcw,
  Check,
  Sliders,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { StoreState, attendanceStore } from '../services/attendanceStore';
import { PersonnelTypeConfig, ShiftTimeConfig } from '../types/attendance';

interface ShiftsAndRosterPageProps {
  state: StoreState;
}

// Convert "HH:MM" to minute offset from 00:00 (0 - 1440)
function timeToMinutes(t: string = '00:00'): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Visual 24-Hour Timeline Bar Component
const VisualShiftTimeline: React.FC<{ type: PersonnelTypeConfig }> = ({ type }) => {
  const morningStart = timeToMinutes(type.morningShift?.startTime || '08:15');
  const morningEnd = timeToMinutes(type.morningShift?.endTime || '16:00');

  const afternoonStart = timeToMinutes(type.afternoonShift?.startTime || '16:00');
  let afternoonEnd = timeToMinutes(type.afternoonShift?.endTime || '24:00');
  if (afternoonEnd === 0 || afternoonEnd === 1440) afternoonEnd = 1440;

  const nightStart = timeToMinutes(type.nightShift?.startTime || '00:00');
  const nightEnd = timeToMinutes(type.nightShift?.endTime || '08:00');

  // Convert minutes to percentage of 24h (1440 minutes)
  const toPct = (mins: number) => Math.min(100, Math.max(0, (mins / 1440) * 100));

  const morningLeft = toPct(morningStart);
  const morningWidth = toPct(morningEnd) - morningLeft;

  const afternoonLeft = toPct(afternoonStart);
  const afternoonWidth = toPct(afternoonEnd) - afternoonLeft;

  const nightLeft = toPct(nightStart);
  const nightWidth = toPct(nightEnd) - nightLeft;

  return (
    <div className="space-y-1.5 w-full">
      {/* Timeline track */}
      <div className="relative h-6 bg-slate-100 rounded-md overflow-hidden border border-slate-200/90 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
        {/* Night Shift Block (00:00 - 08:00) */}
        <div 
          className="absolute top-0 bottom-0 bg-indigo-500/15 border-r border-indigo-300 flex items-center justify-center text-[10px] font-mono font-bold text-indigo-950 transition-all"
          style={{ left: `${nightLeft}%`, width: `${nightWidth}%` }}
          title={`กะดึก: ${type.nightShift?.startTime} - ${type.nightShift?.endTime}`}
        >
          <span className="truncate px-1">ดึก {type.nightShift?.startTime}-{type.nightShift?.endTime}</span>
        </div>

        {/* Morning Shift Block (07:30 or 08:15 - 16:00) */}
        <div 
          className="absolute top-0 bottom-0 bg-amber-500/20 border-r border-amber-400 flex items-center justify-center text-[10px] font-mono font-bold text-amber-950 transition-all"
          style={{ left: `${morningLeft}%`, width: `${morningWidth}%` }}
          title={`กะเช้า: ${type.morningShift?.startTime} - ${type.morningShift?.endTime} (สายทันทีหลัง ${type.morningShift?.startTime})`}
        >
          <span className="truncate px-1">เช้า {type.morningShift?.startTime}-{type.morningShift?.endTime}</span>
        </div>

        {/* Afternoon Shift Block (16:00 - 24:00) */}
        <div 
          className="absolute top-0 bottom-0 bg-teal-500/20 flex items-center justify-center text-[10px] font-mono font-bold text-teal-950 transition-all"
          style={{ left: `${afternoonLeft}%`, width: `${afternoonWidth}%` }}
          title={`กะบ่าย: ${type.afternoonShift?.startTime} - ${type.afternoonShift?.endTime}`}
        >
          <span className="truncate px-1">บ่าย {type.afternoonShift?.startTime}-{type.afternoonShift?.endTime}</span>
        </div>

        {/* Start Marker for Morning (Late threshold) */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10"
          style={{ left: `${morningLeft}%` }}
          title={`จุดตัดสายกะเช้า: ${type.morningShift?.startTime}`}
        ></div>
      </div>

      {/* Ticks and Key Timestamps */}
      <div className="flex justify-between text-[10px] text-slate-400 font-mono select-none px-0.5">
        <span>00:00</span>
        <span className="text-amber-800 font-semibold">{type.morningShift?.startTime}</span>
        <span className="text-teal-800 font-semibold">{type.afternoonShift?.startTime}</span>
        <span>24:00</span>
      </div>
    </div>
  );
};

export const ShiftsAndRosterPage: React.FC<ShiftsAndRosterPageProps> = ({ state }) => {
  const isAdmin = state.currentUser.role === 'ADMIN';

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActiveOnly, setFilterActiveOnly] = useState(false);

  // Modal / Form state for Add or Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'ADD' | 'EDIT'>('ADD');
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  // 3 Shifts Time Configuration
  const [formMorning, setFormMorning] = useState<ShiftTimeConfig>({
    startTime: '08:15',
    endTime: '16:00',
    lateGraceMinutes: 0
  });
  const [formAfternoon, setFormAfternoon] = useState<ShiftTimeConfig>({
    startTime: '16:00',
    endTime: '24:00',
    lateGraceMinutes: 0
  });
  const [formNight, setFormNight] = useState<ShiftTimeConfig>({
    startTime: '00:00',
    endTime: '08:00',
    lateGraceMinutes: 0
  });

  // Action status notification
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Calculate live member counts
  const personnelTypesWithCounts = useMemo(() => {
    return (state.personnelTypes || []).map(type => {
      const tName = type.name.trim().toLowerCase();
      const count = state.personnel.filter(p => {
        const pName = (p.hrPersonTypeName || '').trim().toLowerCase();
        return pName === tName || pName.includes(tName) || tName.includes(pName);
      }).length;
      return { ...type, memberCount: count };
    });
  }, [state.personnelTypes, state.personnel]);

  // Filtered list
  const filteredTypes = useMemo(() => {
    return personnelTypesWithCounts.filter(type => {
      if (filterActiveOnly && !type.isActive) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = type.name.toLowerCase().includes(q);
        const matchCode = (type.code || '').toLowerCase().includes(q);
        const matchDesc = (type.description || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchDesc) return false;
      }
      return true;
    });
  }, [personnelTypesWithCounts, filterActiveOnly, searchQuery]);

  // Open Modal for Add
  const handleOpenAdd = () => {
    setModalMode('ADD');
    setEditingId(null);
    setFormName('');
    setFormCode('');
    setFormDescription('');
    setFormIsActive(true);
    setFormMorning({ startTime: '08:15', endTime: '16:00', lateGraceMinutes: 0 });
    setFormAfternoon({ startTime: '16:00', endTime: '24:00', lateGraceMinutes: 0 });
    setFormNight({ startTime: '00:00', endTime: '08:00', lateGraceMinutes: 0 });
    setIsModalOpen(true);
  };

  // Open Modal for Edit
  const handleOpenEdit = (type: PersonnelTypeConfig) => {
    setModalMode('EDIT');
    setEditingId(type.id);
    setFormName(type.name);
    setFormCode(type.code || '');
    setFormDescription(type.description || '');
    setFormIsActive(type.isActive);
    setFormMorning({
      startTime: type.morningShift?.startTime || '08:15',
      endTime: type.morningShift?.endTime || '16:00',
      lateGraceMinutes: type.morningShift?.lateGraceMinutes ?? 0
    });
    setFormAfternoon({
      startTime: type.afternoonShift?.startTime || '16:00',
      endTime: type.afternoonShift?.endTime || '24:00',
      lateGraceMinutes: type.afternoonShift?.lateGraceMinutes ?? 0
    });
    setFormNight({
      startTime: type.nightShift?.startTime || '00:00',
      endTime: type.nightShift?.endTime || '08:00',
      lateGraceMinutes: type.nightShift?.lateGraceMinutes ?? 0
    });
    setIsModalOpen(true);
  };

  // Save Add/Edit
  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert('กรุณาระบุชื่อประเภทบุคลากร');
      return;
    }

    setIsProcessing(true);
    try {
      const typeData = {
        name: formName.trim(),
        code: formCode.trim() || undefined,
        description: formDescription.trim() || undefined,
        morningShift: formMorning,
        afternoonShift: formAfternoon,
        nightShift: formNight,
        isActive: formIsActive
      };

      if (modalMode === 'ADD') {
        await attendanceStore.addPersonnelType(typeData, state.currentUser);
        setActionMsg({ type: 'success', text: `เพิ่มประเภทบุคลากร "${formName}" สำเร็จ!` });
      } else if (editingId) {
        await attendanceStore.updatePersonnelType(editingId, typeData, state.currentUser);
        setActionMsg({ type: 'success', text: `ปรับปรุงเวลาประเภท "${formName}" สำเร็จ!` });
      }

      setIsModalOpen(false);
      await attendanceStore.recalculateDailyAttendance('2026-10-14');
    } catch (err: any) {
      setActionMsg({ type: 'error', text: `เกิดข้อผิดพลาด: ${err.message}` });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setActionMsg(null), 3500);
    }
  };

  // Delete Type
  const handleDeleteType = async (type: PersonnelTypeConfig) => {
    if (!confirm(`คุณต้องการลบประเภทบุคลากร "${type.name}" ใช่หรือไม่?`)) return;

    setIsProcessing(true);
    try {
      await attendanceStore.deletePersonnelType(type.id, state.currentUser);
      await attendanceStore.recalculateDailyAttendance('2026-10-14');
      setActionMsg({ type: 'success', text: `ลบประเภท "${type.name}" เรียบร้อยแล้ว` });
    } catch (err: any) {
      setActionMsg({ type: 'error', text: `ไม่สามารถลบได้: ${err.message}` });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setActionMsg(null), 3500);
    }
  };

  // Reset to Hospital Presets
  const handleResetPresets = async () => {
    if (!confirm('ต้องการคืนค่าเริ่มต้น 5 ประเภทบุคลากรหลักของ รพ.สามชุก (ข้าราชการ, พกส., พนักงานราชการ, ลูกจ้างรายวัน, ลูกจ้างรายเดือน) ใช่หรือไม่?')) return;

    setIsProcessing(true);
    try {
      await attendanceStore.resetPersonnelTypes(state.currentUser);
      await attendanceStore.recalculateDailyAttendance('2026-10-14');
      setActionMsg({ type: 'success', text: 'คืนค่าเริ่มต้น 5 ประเภทบุคลากรของ รพ.สามชุก สำเร็จ!' });
    } catch (err: any) {
      setActionMsg({ type: 'error', text: `คืนค่าไม่สำเร็จ: ${err.message}` });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setActionMsg(null), 3500);
    }
  };

  // Sync to MySQL
  const handleSyncToDb = async () => {
    setIsProcessing(true);
    try {
      const res = await attendanceStore.syncAllPersonnelTypesToDb(state.currentUser);
      if (res.success) {
        setActionMsg({ type: 'success', text: `บันทึกลง MySQL attendance_personnel_type_shift สำเร็จ (${res.data?.count || state.personnelTypes.length} รายการ)` });
      } else {
        setActionMsg({ type: 'error', text: `บันทึกไม่สำเร็จ: ${res.message}` });
      }
    } catch (err: any) {
      setActionMsg({ type: 'error', text: `บันทึกไม่สำเร็จ: ${err.message}` });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setActionMsg(null), 3500);
    }
  };

  const totalMappedStaff = personnelTypesWithCounts.reduce((acc, t) => acc + (t.memberCount || 0), 0);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* Header & Command Bar */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-500">
            <span className="font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/70">
              SCHEDULE MATRIX
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-500">รพ.สามชุก จ.สุพรรณบุรี</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-400">3 กะมาตรฐาน (เช้า / บ่าย / ดึก)</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Clock className="w-5 h-5 text-teal-700" />
            ตั้งค่าประเภทบุคลากรและช่วงเวลากะ (Personnel Schedule Matrix)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            กำหนดเวลาเริ่ม-เลิกงาน พร้อมเส้นไทม์ไลน์ 24 ชั่วโมง และเกณฑ์การมาสายของแต่ละประเภทบุคลากร
          </p>
        </div>

        {/* Action Controls (Matte Finish) */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isAdmin && (
            <>
              <button
                onClick={handleResetPresets}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 active:bg-slate-100 rounded-lg border border-slate-300 shadow-2xs transition-all duration-150 cursor-pointer"
                title="คืนค่า 5 ประเภทบุคลากรเริ่มต้น (ข้าราชการ 08:15, ลูกจ้าง 07:30)"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>คืนค่าเริ่มต้น</span>
              </button>

              <button
                onClick={handleSyncToDb}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 active:bg-slate-100 rounded-lg border border-slate-300 shadow-2xs transition-all duration-150 cursor-pointer"
                title="บันทึกข้อมูลประเภทบุคลากรและเวลากะทั้งหมดลง MySQL"
              >
                <Database className="w-3.5 h-3.5 text-teal-700" />
                <span>บันทึก MySQL</span>
              </button>

              <button
                onClick={handleOpenAdd}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 active:bg-teal-950 rounded-lg shadow-2xs transition-all duration-150 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่มประเภทบุคลากร</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Action Toast */}
      {actionMsg && (
        <div className={`p-3 rounded-lg flex items-center justify-between text-xs border transition-all ${
          actionMsg.type === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' :
          actionMsg.type === 'error' ? 'bg-rose-50 text-rose-900 border-rose-200' :
          'bg-slate-50 text-slate-900 border-slate-200'
        }`}>
          <div className="flex items-center gap-2">
            {actionMsg.type === 'success' && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
            {actionMsg.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span className="font-medium">{actionMsg.text}</span>
          </div>
          <button onClick={() => setActionMsg(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
        </div>
      )}

      {/* High Data Density Overview Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs">
          <span className="text-slate-500 font-medium">ประเภทบุคลากรทั้งหมด</span>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums tracking-tight mt-1">
            {personnelTypesWithCounts.length} <span className="text-xs font-normal text-slate-400">ประเภท</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            เปิดใช้งาน {personnelTypesWithCounts.filter(t => t.isActive).length} รายการ
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs">
          <span className="text-slate-500 font-medium">บุคลากรที่ผูกเวลากะ</span>
          <div className="text-2xl font-bold text-teal-800 font-mono tabular-nums tracking-tight mt-1">
            {totalMappedStaff} <span className="text-xs font-normal text-slate-400">คน</span>
          </div>
          <div className="text-[11px] text-teal-700 mt-1">
            จาก hr_person ทั้งหมด {state.personnel.length} คน
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs">
          <span className="text-slate-500 font-medium">กะเช้า ข้าราชการ / พกส.</span>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums tracking-tight mt-1">
            08:15 <span className="text-xs font-normal text-slate-400">- 16:00 น.</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            สแกนเข้าเกิน 08:15 คิดสายทันที
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs">
          <span className="text-slate-500 font-medium">กะเช้า ลูกจ้างรายวัน / รายเดือน</span>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums tracking-tight mt-1">
            07:30 <span className="text-xs font-normal text-slate-400">- 16:00 น.</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            สแกนเข้าเกิน 07:30 คิดสายทันที
          </div>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อประเภทบุคลากร..."
            className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={filterActiveOnly}
              onChange={(e) => setFilterActiveOnly(e.target.checked)}
              className="rounded border-slate-300 text-teal-700 focus:ring-teal-600 cursor-pointer"
            />
            <span>แสดงเฉพาะที่เปิดใช้งาน</span>
          </label>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span className="text-slate-500 font-mono">{filteredTypes.length} ประเภท</span>
        </div>
      </div>

      {/* Interactive Schedule Matrix Cards with Visual Time Bars */}
      <div className="space-y-3">
        {filteredTypes.length === 0 ? (
          <div className="bg-white border border-slate-200/90 rounded-xl p-12 text-center text-slate-400 text-xs">
            ไม่พบประเภทบุคลากรตามคำค้นหา
          </div>
        ) : (
          filteredTypes.map((type) => {
            return (
              <div 
                key={type.id} 
                className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs hover:border-teal-400/60 transition-all duration-150 space-y-3.5"
              >
                {/* Header: Name, Personnel Count, Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200/80 flex items-center justify-center text-teal-800 font-bold text-xs shrink-0">
                      {type.code || type.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <span>{type.name}</span>
                        {type.code && (
                          <span className="font-mono text-[10px] text-slate-500 px-1.5 py-0.2 rounded bg-slate-100 font-medium">
                            {type.code}
                          </span>
                        )}
                        {type.isActive ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.2 rounded-full border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            เปิดใช้งาน
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.2 rounded-full">
                            ปิดใช้งาน
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span>{type.description || 'บุคลากรโรงพยาบาลสามชุก'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-teal-800 font-semibold">
                          {type.memberCount || 0} คนในระบบ HR
                        </span>
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                      <button
                        onClick={() => handleOpenEdit(type)}
                        className="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 active:bg-teal-200 border border-teal-200/80 rounded-lg cursor-pointer transition-colors shadow-2xs"
                        title="แก้ไขเวลาเริ่ม-เลิก ของทั้ง 3 กะ"
                      >
                        แก้ไขเวลากะ
                      </button>
                      <button
                        onClick={() => handleDeleteType(type)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                        title="ลบประเภทบุคลากรนี้"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* 24-Hour Visual Schedule Timeline Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-700">แถบเวลาปฏิบัติงาน 24 ชั่วโมง (Visual Timeline):</span>
                    <span className="text-[10px] text-slate-400">เส้นสีแดง = จุดตัดคิดสาย</span>
                  </div>
                  <VisualShiftTimeline type={type} />
                </div>

                {/* 3 Shift Details Pills */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                  {/* Morning Shift */}
                  <div className="p-2.5 rounded-lg border border-amber-200/80 bg-amber-500/[0.04] space-y-1">
                    <div className="flex items-center justify-between text-amber-900 font-semibold text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Sun className="w-3.5 h-3.5 text-amber-600" />
                        กะเช้า (Morning)
                      </span>
                      <span className="text-[10px] text-amber-800 font-mono">สายหลัง {type.morningShift?.startTime}</span>
                    </div>
                    <div className="text-sm font-bold font-mono text-slate-800 tabular-nums">
                      {type.morningShift?.startTime} - {type.morningShift?.endTime} น.
                    </div>
                  </div>

                  {/* Afternoon Shift */}
                  <div className="p-2.5 rounded-lg border border-teal-200/80 bg-teal-500/[0.04] space-y-1">
                    <div className="flex items-center justify-between text-teal-900 font-semibold text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Sunset className="w-3.5 h-3.5 text-teal-600" />
                        กะบ่าย (Afternoon)
                      </span>
                      <span className="text-[10px] text-teal-800 font-mono">สายหลัง {type.afternoonShift?.startTime}</span>
                    </div>
                    <div className="text-sm font-bold font-mono text-slate-800 tabular-nums">
                      {type.afternoonShift?.startTime} - {type.afternoonShift?.endTime} น.
                    </div>
                  </div>

                  {/* Night Shift */}
                  <div className="p-2.5 rounded-lg border border-indigo-200/80 bg-indigo-500/[0.04] space-y-1">
                    <div className="flex items-center justify-between text-indigo-900 font-semibold text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Moon className="w-3.5 h-3.5 text-indigo-600" />
                        กะดึก (Night)
                      </span>
                      <span className="text-[10px] text-indigo-700">เวรข้ามคืน</span>
                    </div>
                    <div className="text-sm font-bold font-mono text-slate-800 tabular-nums">
                      {type.nightShift?.startTime} - {type.nightShift?.endTime} น.
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit Personnel Type Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-700" />
                {modalMode === 'ADD' ? 'เพิ่มประเภทบุคลากรและเวลากะใหม่' : `แก้ไขเวลากะ: ${formName}`}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveType} className="space-y-4">
              {/* Basic Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    ชื่อประเภทบุคลากร <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="เช่น ข้าราชการ, ลูกจ้างรายวัน"
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    รหัสย่อ (Code)
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="เช่น GOV, DAILY"
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-600 uppercase font-mono"
                  />
                </div>
              </div>

              {/* 3 Shifts Matrix Form */}
              <div className="space-y-3 pt-1">
                <div className="text-xs font-bold text-slate-800">
                  กำหนดเวลาปฏิบัติงาน 3 กะ (เช้า / บ่าย / ดึก):
                </div>

                {/* กะเช้า */}
                <div className="p-3 rounded-lg border border-amber-200/90 bg-amber-500/[0.04] text-xs space-y-2">
                  <div className="font-semibold text-amber-900 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sun className="w-3.5 h-3.5 text-amber-600" />
                      1. กะเช้า (Morning Shift)
                    </span>
                    <span className="text-[10px] text-amber-700 font-mono">สายทันทีหลังเวลาเข้า</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1 font-medium">เวลาเข้างาน</label>
                      <input
                        type="time"
                        required
                        value={formMorning.startTime}
                        onChange={(e) => setFormMorning({ ...formMorning, startTime: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1 font-medium">เวลาออกงาน</label>
                      <input
                        type="time"
                        required
                        value={formMorning.endTime}
                        onChange={(e) => setFormMorning({ ...formMorning, endTime: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                    </div>
                  </div>
                </div>

                {/* กะบ่าย */}
                <div className="p-3 rounded-lg border border-teal-200/90 bg-teal-500/[0.04] text-xs space-y-2">
                  <div className="font-semibold text-teal-900 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sunset className="w-3.5 h-3.5 text-teal-600" />
                      2. กะบ่าย (Afternoon Shift)
                    </span>
                    <span className="text-[10px] text-teal-700 font-mono">สแกนช่วง 13:00 - 19:59</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1 font-medium">เวลาเข้างาน</label>
                      <input
                        type="time"
                        required
                        value={formAfternoon.startTime}
                        onChange={(e) => setFormAfternoon({ ...formAfternoon, startTime: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1 font-medium">เวลาออกงาน</label>
                      <input
                        type="time"
                        required
                        value={formAfternoon.endTime}
                        onChange={(e) => setFormAfternoon({ ...formAfternoon, endTime: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                    </div>
                  </div>
                </div>

                {/* กะดึก */}
                <div className="p-3 rounded-lg border border-indigo-200/90 bg-indigo-500/[0.04] text-xs space-y-2">
                  <div className="font-semibold text-indigo-900 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Moon className="w-3.5 h-3.5 text-indigo-600" />
                      3. กะดึก (Night Shift)
                    </span>
                    <span className="text-[10px] text-indigo-700 font-mono">เวรข้ามคืน</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1 font-medium">เวลาเข้างาน</label>
                      <input
                        type="time"
                        required
                        value={formNight.startTime}
                        onChange={(e) => setFormNight({ ...formNight, startTime: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1 font-medium">เวลาออกงาน</label>
                      <input
                        type="time"
                        required
                        value={formNight.endTime}
                        onChange={(e) => setFormNight({ ...formNight, endTime: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="formActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-300 text-teal-700 focus:ring-teal-600 cursor-pointer"
                />
                <label htmlFor="formActive" className="text-xs text-slate-700 cursor-pointer font-medium">
                  เปิดใช้งานประเภทบุคลากรนี้ในระบบ
                </label>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium rounded-lg cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 active:bg-teal-950 rounded-lg shadow-2xs transition-all duration-150 cursor-pointer"
                >
                  {isProcessing ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
