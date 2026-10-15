import React, { useState } from 'react';
import { 
  Fingerprint, 
  UserCheck, 
  Search, 
  X, 
  Check, 
  AlertTriangle, 
  Hospital,
  Building,
  Briefcase,
  IdCard,
  Sparkles
} from 'lucide-react';
import { HrPerson, User } from '../types/attendance';
import { attendanceStore } from '../services/attendanceStore';

interface QuickMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  fingleId: number;
  scanTime?: string;
  machineNo?: number;
  personnelList: HrPerson[];
  currentUser: User;
  onSuccess: (mappedPerson: HrPerson, updatedCount: number) => void;
}

export const QuickMapModal: React.FC<QuickMapModalProps> = ({
  isOpen,
  onClose,
  fingleId,
  scanTime,
  machineNo,
  personnelList,
  currentUser,
  onSuccess
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter personnel list
  const filteredPersonnel = personnelList.filter(p => {
    if (!searchTerm) return true;
    const matchName = p.hrFullname.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCid = p.hrCid?.includes(searchTerm);
    const matchDep = p.hrDepName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchPos = p.hrPositionName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchFingle = p.fingleId.toString().includes(searchTerm);
    return matchName || matchCid || matchDep || matchPos || matchFingle;
  });

  const selectedPerson = personnelList.find(p => p.personId === selectedPersonId);

  const handleConfirmMap = () => {
    if (!selectedPersonId) {
      setError('กรุณาเลือกบุคลากรที่ต้องการผูกรหัส');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const res = attendanceStore.quickMapFingleId(fingleId, selectedPersonId, currentUser);
      setIsSubmitting(false);
      onSuccess(res.person, res.updatedScans);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message || 'เกิดข้อผิดพลาดในการผูกรหัส');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-400/30 flex items-center justify-center">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  จับคู่รหัสสแกนนิ้วด่วน (Quick Map FINGLE_ID)
                </h3>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-400 text-slate-950">
                  FINGLE #{fingleId}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                ผูกรหัสลายนิ้วมือจากเครื่องสแกนเข้ากับประวัติบุคลากรในฐานข้อมูล HOSOffice
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold">พบข้อมูลสแกนที่ยังไม่มีเจ้าของ:</span> รหัสสแกนนิ้ว{' '}
            <strong className="font-mono text-amber-950 font-bold">#{fingleId}</strong>{' '}
            {scanTime && <span>(สแกนล่าสุด: {scanTime} {machineNo ? `เครื่อง ${machineNo}` : ''})</span>}
            <br />
            เมื่อกดจับคู่ ระบบจะอัปเดต <code className="px-1 bg-amber-100 rounded font-mono">FINGLE_ID</code> ให้กับบุคลากรในตาราง{' '}
            <code className="px-1 bg-amber-100 rounded font-mono">hr_person</code> และอัปเดตบันทึกสแกนดิบย้อนหลังทั้งหมดให้เป็น <span className="font-bold text-emerald-800">hr_mapped = 1</span> ทันที
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Search box */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>ค้นหาบุคลากรที่ต้องการจับคู่:</span>
              <span className="text-[11px] font-normal text-slate-500">
                พบ {filteredPersonnel.length} ท่าน
              </span>
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="พิมพ์ชื่อ-นามสกุล, เลขบัตรประชาชน, กลุ่มงาน หรือตำแหน่ง..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                autoFocus
              />
            </div>
          </div>

          {/* Personnel Selection List */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">
              เลือกรายชื่อเจ้าหน้าที่:
            </span>
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-56 overflow-y-auto bg-slate-50/50">
              {filteredPersonnel.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  ไม่พบบุคลากรที่ตรงกับคำค้นหา
                </div>
              ) : (
                filteredPersonnel.map((person, personIdx) => {
                  const isSelected = selectedPersonId === person.personId;
                  const hasOtherFingle = person.fingleId > 0 && person.fingleId !== fingleId;

                  return (
                    <div
                      key={`${person.personId}-${personIdx}`}
                      onClick={() => setSelectedPersonId(person.personId)}
                      className={`p-3 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-teal-50 border-l-4 border-l-teal-600' 
                          : 'hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          isSelected ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {person.hrFullname.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 flex items-center gap-2">
                            <span>{person.hrFullname}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">
                              {person.hrPersonTypeName}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate flex items-center gap-2 mt-0.5">
                            <span>{person.hrPositionName}</span>
                            <span>•</span>
                            <span className="text-slate-600">{person.hrDepName}</span>
                            {person.hrDepSubName && <span>({person.hrDepSubName})</span>}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 pl-3">
                        {hasOtherFingle ? (
                          <div className="text-[11px] text-amber-700 font-mono">
                            เดิม: #{person.fingleId}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 font-mono">
                            ยังไม่มีรหัส
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 font-mono">
                          ID: {person.personId}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Selected Personnel Preview */}
          {selectedPerson && (
            <div className="p-3.5 bg-teal-50/70 border border-teal-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-teal-900">
                <Sparkles className="w-4 h-4 text-teal-600" />
                <span>ตรวจสอบข้อมูลที่จะผูกรหัส:</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                <div>
                  <span className="text-slate-500">ชื่อ-นามสกุล:</span>{' '}
                  <span className="font-semibold">{selectedPerson.hrFullname}</span>
                </div>
                <div>
                  <span className="text-slate-500">เลขประจำตัวประชาชน:</span>{' '}
                  <span className="font-mono">{selectedPerson.hrCid || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500">ตำแหน่ง:</span>{' '}
                  <span>{selectedPerson.hrPositionName}</span>
                </div>
                <div>
                  <span className="text-slate-500">กลุ่มงาน:</span>{' '}
                  <span>{selectedPerson.hrDepName}</span>
                </div>
                <div className="col-span-2 pt-1 border-t border-teal-200/60 flex items-center gap-2 text-teal-950 font-medium">
                  <span>รหัสสแกนนิ้วใหม่ที่จะได้รับ:</span>
                  <span className="px-2 py-0.5 rounded bg-teal-600 text-white font-mono font-bold text-xs">
                    FINGLE_ID #{fingleId}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
          >
            ยกเลิก
          </button>

          <button
            onClick={handleConfirmMap}
            disabled={!selectedPersonId || isSubmitting}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold shadow-sm cursor-pointer transition-all ${
              selectedPersonId && !isSubmitting
                ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-600/20'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>ยืนยันผูกรหัสทันที</span>
          </button>
        </div>
      </div>
    </div>
  );
};
