import React, { useState } from 'react';
import { 
  Clock, 
  Users, 
  Calendar, 
  Plus, 
  Edit2, 
  Trash2, 
  Check, 
  Copy, 
  AlertCircle, 
  UserCheck, 
  Save, 
  X,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CalendarCheck,
  Database,
  RefreshCw
} from 'lucide-react';
import { StoreState, attendanceStore } from '../services/attendanceStore';
import { Shift, PersonnelGroup, HrPerson } from '../types/attendance';
import { apiClient } from '../services/apiClient';

interface ShiftsAndRosterPageProps {
  state: StoreState;
}

export const ShiftsAndRosterPage: React.FC<ShiftsAndRosterPageProps> = ({ state }) => {
  const isAdmin = state.currentUser.role === 'ADMIN';

  // DB Sync State
  const [isSyncingDb, setIsSyncingDb] = useState(false);
  const [dbSyncMsg, setDbSyncMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [dbStats, setDbStats] = useState<any>(null);

  // Sub-tabs
  const [activeTab, setActiveTab] = useState<'shifts' | 'groups' | 'overrides' | 'roster'>('shifts');

  // Edit Shift Modal
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [isNewShift, setIsNewShift] = useState(false);

  // Edit Group Modal
  const [editingGroup, setEditingGroup] = useState<PersonnelGroup | null>(null);
  const [isNewGroup, setIsNewGroup] = useState(false);

  // Edit Person Override Modal
  const [editingOverride, setEditingOverride] = useState<any | null>(null);
  const [isNewOverride, setIsNewOverride] = useState(false);

  // Month selector for Roster
  const [selectedMonth, setSelectedMonth] = useState('2026-10');

  // Days in month
  const daysInMonth = 31; // For 2026-10
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1;
    const pad = dayNum.toString().padStart(2, '0');
    return {
      dayNum,
      dateStr: `${selectedMonth}-${pad}`,
      isWeekend: [3, 4, 10, 11, 17, 18, 24, 25, 31].includes(dayNum) // Saturday/Sunday simulation
    };
  });

  // Sync Shifts to MySQL 10.2.0.201
  const handleSyncAllShiftsToDb = async () => {
    setIsSyncingDb(true);
    setDbSyncMsg({ type: 'info', text: 'กำลังเชื่อมต่อ MySQL 10.2.0.201 และบันทึกข้อมูลกะ...' });
    try {
      const res = await apiClient.syncShiftsToDb(state.shifts);
      if (res.success) {
        setDbSyncMsg({ type: 'success', text: res.message || 'บันทึกกะลง MySQL samchuk_attendance @ 10.2.0.201 สำเร็จ 100%' });
        const testRes = await apiClient.testDatabaseConnection();
        if (testRes.success) setDbStats(testRes);
      } else {
        setDbSyncMsg({ type: 'error', text: res.message || 'ไม่สามารถบันทึกลง MySQL ได้ (กรุณาเปิด start-backend.bat)' });
      }
    } catch (err: any) {
      setDbSyncMsg({ type: 'error', text: `เกิดข้อผิดพลาด: ${err.message}` });
    } finally {
      setIsSyncingDb(false);
    }
  };

  const handleTestDb = async () => {
    setIsSyncingDb(true);
    setDbSyncMsg({ type: 'info', text: 'กำลังตรวจสอบสถานะ MySQL บน 10.2.0.201...' });
    try {
      const res = await apiClient.testDatabaseConnection();
      if (res.success) {
        setDbStats(res);
        setDbSyncMsg({ type: 'success', text: `เชื่อมต่อ MySQL บน 10.2.0.201 สำเร็จ! พบข้อมูลกะในตาราง: ${res.tables?.shifts ?? 0} กะ` });
      } else {
        setDbSyncMsg({ type: 'error', text: res.message || 'ติดต่อ MySQL 10.2.0.201 ไม่สำเร็จ (กรุณาตรวจสอบว่า Backend 3002 ทำงานอยู่)' });
      }
    } catch (err: any) {
      setDbSyncMsg({ type: 'error', text: `ข้อผิดพลาด: ${err.message}` });
    } finally {
      setIsSyncingDb(false);
    }
  };

  // Handle Save Shift
  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift) return;

    if (isNewShift) {
      attendanceStore.addShift({
        shiftCode: editingShift.shiftCode,
        shiftName: editingShift.shiftName,
        startTime: editingShift.startTime,
        endTime: editingShift.endTime,
        crossesMidnight: editingShift.crossesMidnight,
        workDateBasis: editingShift.workDateBasis,
        lateGraceMinutes: Number(editingShift.lateGraceMinutes),
        inWindowBeforeMin: Number(editingShift.inWindowBeforeMin),
        outWindowAfterMin: Number(editingShift.outWindowAfterMin),
        earlyLeaveMin: Number(editingShift.earlyLeaveMin),
        duplicateScanMin: Number(editingShift.duplicateScanMin),
        color: editingShift.color || '#0284c7',
        isActive: true
      }, state.currentUser);
    } else {
      attendanceStore.updateShift(editingShift.id, editingShift, state.currentUser);
    }

    setEditingShift(null);

    // ซิงค์เข้า MySQL 10.2.0.201 ทันที
    try {
      await apiClient.syncShiftsToDb(state.shifts);
    } catch {
      // ignore
    }
  };

  // Handle Save Group
  const handleSaveGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;

    attendanceStore.saveGroup(editingGroup, state.currentUser);
    setEditingGroup(null);
  };

  // Copy Group Settings helper - Section 17.4
  const handleCopyGroupSettings = (sourceGroupId: number) => {
    const source = state.groups.find(g => g.id === sourceGroupId);
    if (!source || !editingGroup) return;

    setEditingGroup({
      ...editingGroup,
      shiftOverrides: { ...source.shiftOverrides }
    });
  };

  // Handle Save Person Override
  const handleSaveOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOverride) return;

    if (!isNewOverride && editingOverride.id) {
      attendanceStore.removePersonShiftOverride(editingOverride.id, state.currentUser);
    }

    attendanceStore.setPersonShiftOverride({
      personId: Number(editingOverride.personId),
      shiftId: Number(editingOverride.shiftId),
      startTime: editingOverride.startTime,
      endTime: editingOverride.endTime,
      effectiveFrom: editingOverride.effectiveFrom,
      effectiveTo: editingOverride.effectiveTo || undefined,
      isActive: true,
      note: editingOverride.note || ''
    }, state.currentUser);

    setEditingOverride(null);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">
            ระบบกะการทำงานและตารางเวร (Shift & Roster Management v2)
          </h2>
          <p className="text-xs text-slate-500">
            กำหนดเวลากะเช้า/บ่าย/ดึก/เช้าควบบ่าย, จัดกลุ่มบุคลากร, Override รายบุคคล และจัดตารางเวรรายเดือน
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('shifts')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'shifts' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1. จัดการกะ (Shifts)
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'groups' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. กลุ่มบุคลากร (Groups)
          </button>
          <button
            onClick={() => setActiveTab('overrides')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'overrides' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            3. กะรายบุคคล (Overrides)
          </button>
          <button
            onClick={() => setActiveTab('roster')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'roster' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            4. ตารางเวร (Monthly Roster)
          </button>
        </div>
      </div>

      {/* TAB 1: SHIFTS MANAGEMENT - Section 16 */}
      {activeTab === 'shifts' && (
        <div className="space-y-4">
          {/* MySQL Database Sync Banner */}
          <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm border border-slate-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">ฐานข้อมูลบันทึกกะจริง:</span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-teal-300 font-semibold border border-slate-700">
                      10.2.0.201 / samchuk_attendance.attendance_shift
                    </span>
                    {dbStats?.tables?.shifts !== undefined && (
                      <span className="text-[11px] text-emerald-400 font-mono">
                        (มีใน DB: {dbStats.tables.shifts} กะ)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    เมื่อคุณเพิ่ม/แก้ไขกะ ข้อมูลจะถูกบันทึกใน LocalStorage ทันที และสามารถกดปุ่มซิงค์เพื่อเขียนลงตาราง MySQL 10.2.0.201 ได้ตลอดเวลา
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleTestDb}
                  disabled={isSyncingDb}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 cursor-pointer disabled:opacity-50"
                  title="ทดสอบว่า MySQL บน 10.2.0.201 เชื่อมต่อได้หรือไม่"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDb ? 'animate-spin' : ''}`} />
                  <span>เช็ค MySQL</span>
                </button>

                <button
                  type="button"
                  onClick={handleSyncAllShiftsToDb}
                  disabled={isSyncingDb}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSyncingDb ? 'กำลังบันทึกลง DB...' : '💾 บันทึกกะลง MySQL 10.2.0.201'}</span>
                </button>
              </div>
            </div>

            {dbSyncMsg && (
              <div className={`mt-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
                dbSyncMsg.type === 'success' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60' :
                dbSyncMsg.type === 'error' ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60' :
                'bg-blue-950/80 text-blue-300 border border-blue-800/60'
              }`}>
                {dbSyncMsg.type === 'success' ? <Check className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{dbSyncMsg.text}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-slate-800">
                รายการกะการทำงานมาตรฐาน (Shift Master Data)
              </h3>
              <p className="text-xs text-slate-500">
                ADMIN สามารถแก้ไขเวลาเริ่มและเวลาสิ้นสุดได้เองผ่านหน้าเว็บ โดยไม่ต้องแก้โค้ด
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => {
                  setIsNewShift(true);
                  setEditingShift({
                    id: 0,
                    shiftCode: 'NEW',
                    shiftName: 'กะใหม่',
                    startTime: '08:00',
                    endTime: '16:00',
                    crossesMidnight: false,
                    workDateBasis: 'START_DATE',
                    lateGraceMinutes: 0,
                    inWindowBeforeMin: 120,
                    outWindowAfterMin: 120,
                    earlyLeaveMin: 0,
                    duplicateScanMin: 5,
                    color: '#0d9488',
                    isActive: true,
                    createdAt: '',
                    updatedAt: ''
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มกะใหม่</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {state.shifts.map((shift) => (
              <div
                key={shift.id}
                className={`bg-white border rounded-xl p-4 shadow-xs flex flex-col justify-between transition-all ${
                  shift.isActive ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-3.5 h-3.5 rounded-full shrink-0" 
                        style={{ backgroundColor: shift.color }}
                      ></span>
                      <span className="font-mono font-bold text-sm text-slate-800">
                        [{shift.shiftCode}]
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {shift.shiftName}
                      </span>
                    </div>
                    {shift.isSystemDefault && (
                      <span className="text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded font-semibold">
                        ค่าเริ่มต้น
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 font-mono pt-2 border-t border-slate-100">
                    <div className="flex justify-between items-center">
                      <span className="font-sans text-slate-400">เวลาทำงาน:</span>
                      <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-sm">
                        {shift.startTime} – {shift.endTime}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans text-slate-400">ผ่อนผันสาย:</span>
                      <span>{shift.lateGraceMinutes} นาที</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans text-slate-400">หน้าต่างรับสแกนเข้า:</span>
                      <span>ก่อน {shift.inWindowBeforeMin} นาที</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans text-slate-400">หน้าต่างรับสแกนออก:</span>
                      <span>หลัง {shift.outWindowAfterMin} นาที</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans text-slate-400">สแกนซ้ำ (ไม่นับ):</span>
                      <span>&le; {shift.duplicateScanMin} นาที</span>
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <button
                      onClick={() => {
                        setIsNewShift(false);
                        setEditingShift({ ...shift });
                      }}
                      className="text-teal-700 hover:text-teal-900 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>แก้ไขเวลา</span>
                    </button>
                    {shift.isActive && !shift.isSystemDefault && (
                      <button
                        onClick={() => {
                          if (confirm(`ต้องการปิดการใช้งานกะ [${shift.shiftCode}] ใช่หรือไม่? (Soft delete)`)) {
                            attendanceStore.deactivateShift(shift.id, state.currentUser);
                          }
                        }}
                        className="text-rose-600 hover:text-rose-800 text-[11px] cursor-pointer"
                      >
                        ปิดใช้งาน
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: GROUPS MANAGEMENT - Section 17 */}
      {activeTab === 'groups' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-slate-800">
                กลุ่มบุคลากรและการตั้งเวลากะต่อกลุ่ม (Personnel Groups)
              </h3>
              <p className="text-xs text-slate-500">
                แต่ละกลุ่มสามารถกำหนดเวลากะ เช้า/บ่าย/ดึก/ควบบ่าย ต่างกันได้ (เช่น ข้าราชการเข้า 08:15 vs ลูกจ้างเข้า 07:30)
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => {
                  setIsNewGroup(true);
                  setEditingGroup({
                    id: 0,
                    groupName: 'กลุ่มใหม่',
                    groupKind: 'CUSTOM',
                    priority: 50,
                    isActive: true,
                    note: '',
                    createdAt: '',
                    updatedAt: '',
                    personTypeIds: [],
                    memberPersonIds: [],
                    shiftOverrides: {}
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มกลุ่มใหม่</span>
              </button>
            )}
          </div>

          <div className="space-y-4">
            {state.groups.map((group) => {
              // count members
              let memberCount = 0;
              if (group.groupKind === 'PERSON_TYPE') {
                memberCount = state.personnel.filter(p => group.personTypeIds.includes(p.hrPersonTypeId)).length;
              } else {
                memberCount = group.memberPersonIds.length;
              }

              return (
                <div key={group.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-mono">
                          Priority {group.priority}
                        </span>
                        <h4 className="text-sm font-bold text-slate-800">{group.groupName}</h4>
                        <span className="text-xs text-slate-500">
                          ({group.groupKind === 'PERSON_TYPE' ? 'ผูกตามประเภทบุคลากร HR' : 'กลุ่มกำหนดเอง'})
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{group.note || 'ไม่มีหมายเหตุ'}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                        สมาชิก: <strong>{memberCount}</strong> คน
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            setIsNewGroup(false);
                            setEditingGroup({ ...group });
                          }}
                          className="px-3 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50 border border-teal-200 rounded-md cursor-pointer"
                        >
                          แก้ไขเวลา & สมาชิก
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Shifts Table for this group */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold border-y border-slate-200">
                        <tr>
                          <th className="py-2 px-3">รหัสกะ</th>
                          <th className="py-2 px-3">ชื่อกะ</th>
                          <th className="py-2 px-3">เวลากลุ่มนี้ (Group Time)</th>
                          <th className="py-2 px-3">เวลามาตรฐาน (Default)</th>
                          <th className="py-2 px-3">ผ่อนผันสาย</th>
                          <th className="py-2 px-3 text-right">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {state.shifts.map((shift) => {
                          const override = group.shiftOverrides[shift.id];
                          const isOverridden = !!override;
                          const startTime = override ? override.startTime : shift.startTime;
                          const endTime = override ? override.endTime : shift.endTime;
                          const grace = override?.lateGraceMinutes ?? shift.lateGraceMinutes;

                          return (
                            <tr key={shift.id}>
                              <td className="py-2 px-3 font-mono font-bold text-slate-800">
                                [{shift.shiftCode}]
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-800">
                                {shift.shiftName}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold">
                                {isOverridden ? (
                                  <span className="text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                                    {startTime} – {endTime}
                                  </span>
                                ) : (
                                  <span className="text-slate-600">
                                    {startTime} – {endTime}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-400">
                                {shift.startTime} – {shift.endTime}
                              </td>
                              <td className="py-2 px-3 text-slate-600 font-mono">
                                {grace} นาที
                              </td>
                              <td className="py-2 px-3 text-right">
                                {isOverridden ? (
                                  <span className="text-[11px] text-teal-700 font-semibold">
                                    ✓ กำหนดเฉพาะกลุ่ม
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-400">
                                    ใช้เวลามาตรฐาน
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: PER-PERSON OVERRIDES - Section 19 */}
      {activeTab === 'overrides' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-slate-800">
                การกำหนดกะแยกรายบุคคล (Per-Person Shift Overrides)
              </h3>
              <p className="text-xs text-slate-500">
                Override เวลากะสำหรับเจ้าหน้าที่รายบุคคล (ลำดับความสำคัญระดับ 2 รองจาก Roster แต่สูงกว่ากลุ่ม)
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => {
                  setIsNewOverride(true);
                  const firstShift = state.shifts[0];
                  setEditingOverride({
                    id: 0,
                    personId: state.personnel[0]?.personId || 1,
                    shiftId: firstShift?.id || 1,
                    startTime: firstShift?.startTime || '08:15',
                    endTime: firstShift?.endTime || '16:00',
                    effectiveFrom: '2026-10-01',
                    effectiveTo: '',
                    isActive: true,
                    note: ''
                  });
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>+ กำหนดกะรายบุคคลใหม่</span>
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">FINGLE_ID</th>
                  <th className="py-2.5 px-3">ชื่อ - สกุล</th>
                  <th className="py-2.5 px-3">หน่วยงาน</th>
                  <th className="py-2.5 px-3">กะที่ Override</th>
                  <th className="py-2.5 px-3">เวลาที่กำหนด</th>
                  <th className="py-2.5 px-3">ช่วงวันที่มีผล</th>
                  <th className="py-2.5 px-3">หมายเหตุ</th>
                  <th className="py-2.5 px-3 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.personOverrides.map((override, overrideIdx) => {
                  const person = state.personnel.find(p => p.personId === override.personId);
                  const shift = state.shifts.find(s => s.id === override.shiftId);

                  return (
                    <tr key={`${override.id}-${overrideIdx}`} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {person?.fingleId}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {person?.hrFullname}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {person?.hrDepName}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-teal-800">
                        [{shift?.shiftCode}] {shift?.shiftName}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {override.startTime} – {override.endTime}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {override.effectiveFrom} {override.effectiveTo ? `ถึง ${override.effectiveTo}` : '(ไม่มีกำหนด)'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 italic">
                        {override.note || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {isAdmin && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setIsNewOverride(false);
                                setEditingOverride({ ...override });
                              }}
                              className="text-teal-700 hover:text-teal-900 font-semibold cursor-pointer"
                            >
                              แก้ไข
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('ต้องการลบ Override กะของบุคคลนี้ใช่หรือไม่?')) {
                                  attendanceStore.removePersonShiftOverride(override.id, state.currentUser);
                                }
                              }}
                              className="text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                            >
                              ลบ
                            </button>
                          </div>
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

      {/* TAB 4: MONTHLY ROSTER MATRIX - Section 16.3 & 19 */}
      {activeTab === 'roster' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-slate-800">
                ตารางเวรรายเดือน (Monthly Personnel Roster Matrix)
              </h3>
              <p className="text-xs text-slate-500">
                คลิกที่ช่องวันที่เพื่อกำหนดกะประจำวัน (ลำดับความสำคัญสูงสุดระดับ 1)
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg">
                <CalendarCheck className="w-4 h-4 text-teal-600" />
                <span>เดือน:</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="font-mono text-slate-900 focus:outline-none cursor-pointer"
                />
              </div>

              {/* Shift Badges Legend */}
              <div className="hidden lg:flex items-center gap-2 text-xs text-slate-600">
                {state.shifts.map(s => (
                  <span key={s.id} className="flex items-center gap-1 font-mono text-[11px]">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }}></span>
                    <span>{s.shiftCode}: {s.startTime}-{s.endTime}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Roster Grid Matrix */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-xs">
            <table className="text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                <tr>
                  <th className="py-2.5 px-3 border-r border-b border-slate-200 sticky left-0 bg-slate-100 z-10 min-w-44">
                    บุคลากร (HR Person)
                  </th>
                  {days.map(d => (
                    <th 
                      key={d.dayNum} 
                      className={`py-2 px-1 text-center border-r border-b border-slate-200 min-w-10 ${
                        d.isWeekend ? 'bg-amber-50 text-amber-900 font-bold' : ''
                      }`}
                    >
                      <div className="text-[10px]">{d.dayNum}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {state.personnel.map((person, pIdx) => {
                  return (
                    <tr key={`${person.personId}-${pIdx}`} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 border-r border-slate-200 sticky left-0 bg-white z-10">
                        <div className="font-semibold text-slate-800 text-xs truncate max-w-44">
                          {person.hrFullname}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate max-w-44">
                          Fingle #{person.fingleId} · {person.hrDepSubName || person.hrDepName}
                        </div>
                      </td>

                      {days.map(d => {
                        const personDayRosters = state.roster.filter(
                          r => r.personId === person.personId && r.workDate === d.dateStr
                        );
                        const assignedShifts = personDayRosters
                          .map(r => state.shifts.find(s => s.id === r.shiftId))
                          .filter((s): s is NonNullable<typeof s> => s !== undefined);

                        return (
                          <td 
                            key={`${person.personId}-${d.dateStr}`}
                            className={`p-0.5 text-center border-r border-slate-100 ${d.isWeekend ? 'bg-amber-50/30' : ''}`}
                          >
                            <button
                              disabled={!isAdmin}
                              onClick={() => {
                                if (!isAdmin) return;
                                // Cycle through shifts: None -> M -> A -> N -> MA -> None
                                const currentId = personDayRosters[0]?.shiftId || 0;
                                const nextId = currentId === 4 ? 1 : currentId === 0 ? 1 : currentId + 1;
                                attendanceStore.setRosterShift(person.personId, d.dateStr, nextId, 'เวรประจำวัน', state.currentUser);
                              }}
                              className={`min-w-8 h-8 px-1 rounded text-[10px] font-mono font-bold transition-all flex items-center justify-center mx-auto cursor-pointer ${
                                assignedShifts.length > 0
                                  ? 'text-white shadow-xs' 
                                  : 'text-slate-300 hover:bg-slate-100 hover:text-slate-600'
                              }`}
                              style={{
                                backgroundColor: assignedShifts.length === 1 
                                  ? assignedShifts[0].color 
                                  : assignedShifts.length > 1 
                                  ? '#7c3aed' 
                                  : 'transparent'
                              }}
                              title={
                                assignedShifts.length > 0 
                                  ? assignedShifts.map(s => `${s.shiftName} (${s.startTime}-${s.endTime})`).join(', ') 
                                  : 'คลิกเพื่อกำหนดกะ'
                              }
                            >
                              {assignedShifts.length > 1 
                                ? assignedShifts.map(s => s.shiftCode).join('+')
                                : assignedShifts.length === 1 
                                ? assignedShifts[0].shiftCode 
                                : '-'}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500 italic">
            * สิทธิ์ ADMIN: คลิกที่ช่องวันที่เพื่อเปลี่ยนกะเวร [M = เช้า, A = บ่าย, N = ดึก, MA = เช้าควบบ่าย] ระบบจะบันทึกลง attendance_person_roster ทันที
          </p>
        </div>
      )}

      {/* MODAL: Edit Shift Form */}
      {editingShift && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSaveShift} className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {isNewShift ? 'เพิ่มกะการทำงานใหม่' : `แก้ไขกะ [${editingShift.shiftCode}] ${editingShift.shiftName}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditingShift(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">รหัสกะ (shift_code):</label>
                <input
                  type="text"
                  required
                  value={editingShift.shiftCode}
                  onChange={(e) => setEditingShift({ ...editingShift, shiftCode: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono uppercase"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">ชื่อกะ (shift_name):</label>
                <input
                  type="text"
                  required
                  value={editingShift.shiftName}
                  onChange={(e) => setEditingShift({ ...editingShift, shiftName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">เวลาเริ่ม (start_time):</label>
                <input
                  type="time"
                  required
                  value={editingShift.startTime}
                  onChange={(e) => setEditingShift({ ...editingShift, startTime: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">เวลาสิ้นสุด (end_time):</label>
                <input
                  type="time"
                  required
                  value={editingShift.endTime}
                  onChange={(e) => setEditingShift({ ...editingShift, endTime: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">ผ่อนผันสาย (นาที):</label>
                <input
                  type="number"
                  min="0"
                  value={editingShift.lateGraceMinutes}
                  onChange={(e) => setEditingShift({ ...editingShift, lateGraceMinutes: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">สแกนซ้ำไม่นับ (นาที):</label>
                <input
                  type="number"
                  min="1"
                  value={editingShift.duplicateScanMin}
                  onChange={(e) => setEditingShift({ ...editingShift, duplicateScanMin: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">หน้าต่างเข้าก่อน (นาที):</label>
                <input
                  type="number"
                  value={editingShift.inWindowBeforeMin}
                  onChange={(e) => setEditingShift({ ...editingShift, inWindowBeforeMin: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">หน้าต่างออกหลัง (นาที):</label>
                <input
                  type="number"
                  value={editingShift.outWindowAfterMin}
                  onChange={(e) => setEditingShift({ ...editingShift, outWindowAfterMin: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingShift(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm cursor-pointer"
              >
                บันทึกการเปลี่ยนแปลง
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Edit Group Form - Section 17.4 */}
      {editingGroup && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSaveGroup} className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {isNewGroup ? 'สร้างกลุ่มบุคลากรใหม่' : `แก้ไขกลุ่ม: ${editingGroup.groupName}`}
                </h3>
                <p className="text-xs text-slate-500">กำหนดเวลากะ เช้า/บ่าย/ดึก เฉพาะกลุ่มนี้</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingGroup(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">ชื่อกลุ่มบุคลากร:</label>
                  <input
                    type="text"
                    required
                    value={editingGroup.groupName}
                    onChange={(e) => setEditingGroup({ ...editingGroup, groupName: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">ประเภทกลุ่ม:</label>
                  <select
                    value={editingGroup.groupKind}
                    onChange={(e) => setEditingGroup({ ...editingGroup, groupKind: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 cursor-pointer"
                  >
                    <option value="PERSON_TYPE">ตามประเภทบุคลากร HR</option>
                    <option value="CUSTOM">กลุ่มกำหนดเอง (เลือกสมาชิกรายคน)</option>
                  </select>
                </div>
              </div>

              {/* Copy Settings Button - Section 17.4 */}
              <div className="flex items-center justify-between p-2.5 bg-slate-100 rounded-lg">
                <span className="text-slate-600 font-medium">คัดลอกการตั้งค่าเวลาจากกลุ่มอื่น:</span>
                <div className="flex items-center gap-2">
                  <select
                    id="sourceGroupSelect"
                    className="bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                    defaultValue=""
                  >
                    <option value="" disabled>-- เลือกกลุ่มต้นทาง --</option>
                    {state.groups.filter(g => g.id !== editingGroup.id).map(g => (
                      <option key={g.id} value={g.id}>{g.groupName}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const sel = document.getElementById('sourceGroupSelect') as HTMLSelectElement;
                      if (sel && sel.value) handleCopyGroupSettings(Number(sel.value));
                    }}
                    className="px-2.5 py-1 bg-slate-700 hover:bg-slate-800 text-white rounded font-medium cursor-pointer"
                  >
                    คัดลอก
                  </button>
                </div>
              </div>

              {/* Shift Times Editor for this Group */}
              <div className="space-y-2 pt-2">
                <h4 className="font-bold text-slate-800">เวลากะของกลุ่มนี้ (Override):</h4>
                <div className="space-y-2">
                  {state.shifts.map(shift => {
                    const currentOverride = editingGroup.shiftOverrides[shift.id] || {
                      startTime: shift.startTime,
                      endTime: shift.endTime,
                      lateGraceMinutes: shift.lateGraceMinutes
                    };

                    return (
                      <div key={shift.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-4 gap-2 items-center">
                        <div className="font-semibold text-slate-800 font-mono">
                          [{shift.shiftCode}] {shift.shiftName}
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block">เวลาเริ่ม:</label>
                          <input
                            type="time"
                            value={currentOverride.startTime}
                            onChange={(e) => {
                              setEditingGroup({
                                ...editingGroup,
                                shiftOverrides: {
                                  ...editingGroup.shiftOverrides,
                                  [shift.id]: {
                                    ...currentOverride,
                                    startTime: e.target.value
                                  }
                                }
                              });
                            }}
                            className="bg-white border border-slate-300 rounded px-2 py-1 w-full font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block">เวลาออก:</label>
                          <input
                            type="time"
                            value={currentOverride.endTime}
                            onChange={(e) => {
                              setEditingGroup({
                                ...editingGroup,
                                shiftOverrides: {
                                  ...editingGroup.shiftOverrides,
                                  [shift.id]: {
                                    ...currentOverride,
                                    endTime: e.target.value
                                  }
                                }
                              });
                            }}
                            className="bg-white border border-slate-300 rounded px-2 py-1 w-full font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block">ผ่อนผัน (นาที):</label>
                          <input
                            type="number"
                            min="0"
                            value={currentOverride.lateGraceMinutes ?? shift.lateGraceMinutes}
                            onChange={(e) => {
                              setEditingGroup({
                                ...editingGroup,
                                shiftOverrides: {
                                  ...editingGroup.shiftOverrides,
                                  [shift.id]: {
                                    ...currentOverride,
                                    lateGraceMinutes: Number(e.target.value)
                                  }
                                }
                              });
                            }}
                            className="bg-white border border-slate-300 rounded px-2 py-1 w-full font-mono"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingGroup(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm cursor-pointer"
              >
                บันทึกกลุ่ม
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Edit Person Override Form (สเปกข้อ 19) */}
      {editingOverride && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSaveOverride} className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {isNewOverride ? 'กำหนดกะพิเศษรายบุคคลใหม่ (Add Override)' : 'แก้ไขกะพิเศษรายบุคคล'}
                </h3>
                <p className="text-xs text-slate-500">
                  กำหนดเวลากะเฉพาะบุคคล มีลำดับความสำคัญระดับ 2 (เหนือกว่าเวลากลุ่ม)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingOverride(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Personnel Selector */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">เลือกบุคลากร (HR Person):</label>
                <select
                  disabled={!isNewOverride}
                  value={editingOverride.personId}
                  onChange={(e) => setEditingOverride({ ...editingOverride, personId: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 cursor-pointer disabled:opacity-70"
                >
                  {state.personnel.map(p => (
                    <option key={p.personId} value={p.personId}>
                      Fingle #{p.fingleId} - {p.hrFullname} ({p.hrDepSubName || p.hrDepName})
                    </option>
                  ))}
                </select>
              </div>

              {/* Shift Selector */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">กะที่ต้องการ Override:</label>
                <select
                  value={editingOverride.shiftId}
                  onChange={(e) => {
                    const selectedShift = state.shifts.find(s => s.id === Number(e.target.value));
                    setEditingOverride({ 
                      ...editingOverride, 
                      shiftId: Number(e.target.value),
                      startTime: selectedShift?.startTime || editingOverride.startTime,
                      endTime: selectedShift?.endTime || editingOverride.endTime
                    });
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 cursor-pointer"
                >
                  {state.shifts.map(s => (
                    <option key={s.id} value={s.id}>
                      [{s.shiftCode}] {s.shiftName} (เวลามาตรฐาน: {s.startTime} - {s.endTime})
                    </option>
                  ))}
                </select>
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">เวลาเริ่มเฉพาะบุคคล:</label>
                  <input
                    type="time"
                    required
                    value={editingOverride.startTime}
                    onChange={(e) => setEditingOverride({ ...editingOverride, startTime: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">เวลาออกเฉพาะบุคคล:</label>
                  <input
                    type="time"
                    required
                    value={editingOverride.endTime}
                    onChange={(e) => setEditingOverride({ ...editingOverride, endTime: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
              </div>

              {/* Effective Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">วันที่มีผลเริ่ม:</label>
                  <input
                    type="date"
                    required
                    value={editingOverride.effectiveFrom}
                    onChange={(e) => setEditingOverride({ ...editingOverride, effectiveFrom: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">วันสิ้นสุด (เว้นว่าง = ไม่มีกำหนด):</label>
                  <input
                    type="date"
                    value={editingOverride.effectiveTo || ''}
                    onChange={(e) => setEditingOverride({ ...editingOverride, effectiveTo: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
              </div>

              {/* Note */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">หมายเหตุ / เหตุผล:</label>
                <input
                  type="text"
                  placeholder="เช่น กะพิเศษตรวจคลินิกเฉพาะกิจ, ผู้บริหาร, ฯลฯ"
                  value={editingOverride.note || ''}
                  onChange={(e) => setEditingOverride({ ...editingOverride, note: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingOverride(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm cursor-pointer"
              >
                บันทึกกะรายบุคคล
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
