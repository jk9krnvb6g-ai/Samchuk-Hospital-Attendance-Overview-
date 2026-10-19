import React, { useState } from 'react';
import { 
  Users, 
  Search, 
  Database, 
  Code2, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock, 
  Layers, 
  Sparkles, 
  X,
  Info
} from 'lucide-react';
import { StoreState, attendanceStore } from '../services/attendanceStore';
import { PersonnelSyncResult, HrPerson } from '../types/attendance';
import { apiClient } from '../services/apiClient';

interface PersonnelPageProps {
  state: StoreState;
}

export const PersonnelPage: React.FC<PersonnelPageProps> = ({ state }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [showSqlQuery, setShowSqlQuery] = useState(false);
  const [copiedQuery, setCopiedQuery] = useState(false);

  // Sync Modal & State
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<PersonnelSyncResult | null>(null);
  const [syncActiveTab, setSyncActiveTab] = useState<'UPDATED' | 'INSERTED' | 'SKIPPED'>('UPDATED');

  // Viewing Personnel Type & Shift Schedule Modal for a Person
  const [viewingPersonShifts, setViewingPersonShifts] = useState<HrPerson | null>(null);

  // Today for shift resolution preview
  const today = '2026-10-14';
  const isAdmin = state.currentUser?.role === 'ADMIN';

  const departments = Array.from(new Set(state.personnel.map(p => p.hrDepName)));
  const personTypes = Array.from(new Set(state.personnel.map(p => p.hrPersonTypeName)));

  const filteredPersonnel = state.personnel.filter((p) => {
    if (selectedDept !== 'ALL' && p.hrDepName !== selectedDept) return false;
    if (selectedType !== 'ALL' && p.hrPersonTypeName !== selectedType) return false;
    if (searchTerm) {
      const matchName = p.hrFullname.toLowerCase().includes(searchTerm.toLowerCase());
      const matchFingle = p.fingleId.toString().includes(searchTerm);
      const matchPos = p.hrPositionName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCid = p.hrCid?.includes(searchTerm);
      if (!matchName && !matchFingle && !matchPos && !matchCid) return false;
    }
    return true;
  });

  const hosofficeSqlQuery = `SELECT 
    HP.HR_CID,
    CONCAT(HF.HR_PREFIX_NAME, HP.HR_FNAME, ' ', HP.HR_LNAME) AS FULLNAME,
    HT.HR_POSITION_NAME,
    HD.HR_DEPARTMENT_NAME,
    HDS.HR_DEPARTMENT_SUB_NAME AS HR_DEPARTMENT_SUB,
    HPT.HR_PERSON_TYPE_NAME,
    HL.HR_LEVEL_NAME,
    HP.FINGLE_ID,
    HP.ID
FROM hr_person HP
LEFT OUTER JOIN hr_prefix HF ON HP.HR_PREFIX_ID = HF.HR_PREFIX_ID
LEFT OUTER JOIN hr_position HT ON HP.HR_POSITION_ID = HT.HR_POSITION_ID
LEFT OUTER JOIN hr_department HD ON HP.HR_DEPARTMENT_ID = HD.HR_DEPARTMENT_ID
LEFT OUTER JOIN hr_department_sub HDS ON HP.HR_DEPARTMENT_SUB_ID = HDS.HR_DEPARTMENT_SUB_ID
LEFT OUTER JOIN hr_person_type HPT ON HP.HR_PERSON_TYPE_ID = HPT.HR_PERSON_TYPE_ID
LEFT OUTER JOIN hr_level HL ON HP.HR_LEVEL_ID = HL.HR_LEVEL_ID;`;

  const handleCopyQuery = () => {
    navigator.clipboard.writeText(hosofficeSqlQuery);
    setCopiedQuery(true);
    setTimeout(() => setCopiedQuery(false), 2000);
  };

  // Perform Sync from HOSOffice
  const handleExecuteSync = async (simulateChanges = false) => {
    setIsSyncing(true);
    let customData: any = undefined;

    if (!simulateChanges) {
      // พยายามดึงข้อมูลบุคลากรจริงจาก MySQL hosoffice.hr_person
      try {
        const liveRes = await apiClient.getPersonnelFromHosoffice(1000);
        if (liveRes.success && Array.isArray(liveRes.data) && liveRes.data.length > 0) {
          customData = liveRes.data.map((r: any) => ({
            ID: r.personId || r.id,
            HR_CID: r.hrCid || r.hr_cid || '',
            FULLNAME: (r.hrFullname || r.hr_fullname || '').trim() || `เจ้าหน้าที่ รหัส ${r.personId || r.id}`,
            HR_POSITION_NAME: r.hrPositionName || r.hr_position_name || 'เจ้าหน้าที่',
            HR_LEVEL_NAME: r.hrLevelName || r.hr_level_name || '',
            HR_DEPARTMENT_NAME: r.hrDepName || r.hr_dep_name || 'โรงพยาบาลสามชุก',
            HR_DEPARTMENT_SUB: r.hrDepSubName || r.hr_dep_sub_name || '',
            HR_PERSON_TYPE_NAME: r.hrPersonTypeName || r.hr_person_type_name || 'ข้าราชการ',
            FINGLE_ID: r.fingleId || r.fingle_id || r.id
          }));
        }
      } catch {
        // fallback
      }
    } else {
      // Create an on-the-fly change to test dynamic update
      customData = [
        ...attendanceStore.getState().personnel.map(p => ({
          ID: p.personId,
          HR_CID: p.hrCid,
          FULLNAME: p.hrFullname,
          HR_POSITION_NAME: p.personId === 1 ? 'นายแพทย์ทรงคุณวุฒิ' : p.hrPositionName,
          HR_LEVEL_NAME: p.personId === 1 ? 'ทรงคุณวุฒิ' : p.hrLevelName,
          HR_DEPARTMENT_NAME: p.hrDepName,
          HR_DEPARTMENT_SUB: p.personId === 2 ? 'งานห้องคลอดและทารกแรกเกิด' : p.hrDepSubName,
          HR_PERSON_TYPE_NAME: p.personId === 7 ? 'พนักงานกระทรวงสาธารณสุข' : p.hrPersonTypeName,
          FINGLE_ID: p.fingleId
        })),
        {
          ID: 99,
          HR_CID: '3-7204-99999-99-9',
          FULLNAME: 'นพ. วรปรัชญ์ ศรีสวัสดิ์',
          HR_POSITION_NAME: 'นายแพทย์ปฏิบัติการ',
          HR_LEVEL_NAME: 'ปฏิบัติการ',
          HR_DEPARTMENT_NAME: 'กลุ่มงานการแพทย์',
          HR_DEPARTMENT_SUB: 'งานศัลยกรรม',
          HR_PERSON_TYPE_NAME: 'ข้าราชการ',
          FINGLE_ID: 155
        }
      ];
    }

    const result = attendanceStore.syncPersonnelFromHosoffice(state.currentUser, customData);
    setSyncResult(result);
    setIsSyncing(false);
    setIsSyncModalOpen(true);
    if (result.updatedCount > 0) setSyncActiveTab('UPDATED');
    else if (result.insertedCount > 0) setSyncActiveTab('INSERTED');
    else setSyncActiveTab('SKIPPED');
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Title & Main Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-mono font-medium mb-1">
            <span>ฐานข้อมูล: 10.2.0.201 / hosoffice (Read-Only via MySQL)</span>
          </div>
          <h2 className="text-base font-bold text-slate-800">
            ข้อมูลบุคลากรและรหัสสแกนนิ้ว (Personnel Directory)
          </h2>
          <p className="text-xs text-slate-500">
            ดึงข้อมูลบุคลากรจากตาราง hr_person ผูกกับ FINGLE_ID พร้อมตรวจสอบข้อมูลที่ดึงแล้วและปรับปรุงข้อมูลที่เปลี่ยนให้ตรงกับ HOSOffice
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Button: Pull / Sync from HOSOffice */}
          <button
            onClick={() => handleExecuteSync(false)}
            disabled={isSyncing || !isAdmin}
            className={`flex items-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer ${
              !isAdmin ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            title="ดึงข้อมูลจากตาราง hr_person ใน hosoffice ตามคำสั่ง SQL"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'กำลังดึงข้อมูล...' : 'ดึงข้อมูลจาก HOSOffice'}</span>
          </button>

          {/* Button: Show SQL Query */}
          <button
            onClick={() => setShowSqlQuery(!showSqlQuery)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 cursor-pointer transition-colors"
          >
            <Code2 className="w-4 h-4 text-teal-700" />
            <span>คำสั่ง SQL</span>
            {showSqlQuery ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <div className="text-xs text-slate-600 bg-white border border-slate-200 px-3 py-2 rounded-lg font-medium">
            ทั้งหมด <strong className="text-teal-700 font-bold">{state.personnel.length}</strong> ท่าน
          </div>
        </div>
      </div>

      {/* SQL Query Panel (ตรงตามคำสั่ง SQL ที่กำหนด) */}
      {showSqlQuery && (
        <div className="bg-slate-900 rounded-xl p-4 text-slate-200 border border-slate-800 space-y-2 animate-fade-in text-xs font-mono shadow-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-teal-400 font-sans font-bold text-xs">
              <Database className="w-4 h-4" />
              <span>SQL Query สำหรับดึงข้อมูลบุคลากรจาก hosoffice @ 10.2.0.201:</span>
            </div>
            <button
              onClick={handleCopyQuery}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] cursor-pointer"
            >
              {copiedQuery ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedQuery ? 'คัดลอกแล้ว!' : 'คัดลอก SQL'}</span>
            </button>
          </div>
          <pre className="text-teal-300 overflow-x-auto text-[11px] leading-relaxed p-3 bg-slate-950 rounded border border-slate-800">
            {hosofficeSqlQuery}
          </pre>
          <div className="text-[11px] font-sans text-slate-400 flex flex-wrap gap-x-2 gap-y-1">
            <span>* คิวรี่นี้ใช้ดึง 5 ฟิลด์หลักในการตรวจสอบและอัปเดต:</span>
            <span className="text-amber-300 font-mono">1. FULLNAME</span>
            <span className="text-amber-300 font-mono">2. HR_POSITION_NAME</span>
            <span className="text-amber-300 font-mono">3. HR_LEVEL_NAME</span>
            <span className="text-amber-300 font-mono">4. HR_DEPARTMENT_SUB</span>
            <span className="text-amber-300 font-mono">5. HR_PERSON_TYPE_NAME</span>
            <span>ร่วมกับ <code className="text-teal-300">HP.FINGLE_ID</code>, <code className="text-teal-300">HP.HR_CID</code>, และ <code className="text-teal-300">HP.ID</code></span>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ, FINGLE_ID, เลขบัตรประชาชน, ตำแหน่ง..."
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
            <option value="ALL">ทุกประเภทบุคลากร (HR_PERSON_TYPE)</option>
            {personTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Personnel Table matching the exact HOSOffice Query */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-semibold">
            <Users className="w-4 h-4 text-teal-600" />
            <span>รายชื่อบุคลากร ({filteredPersonnel.length} ท่าน)</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 font-normal">วันนี้: {today}</span>
          </div>
          <div className="text-[11px] text-slate-500 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            <span>กะปฏิบัติงานวันนี้ รองรับการมี <strong>หลายกะในวันเดียวกัน</strong> (เวรเช้า/เวรบ่าย/ควบกะ)</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">FINGLE_ID</th>
                <th className="py-2.5 px-3">HP.ID</th>
                <th className="py-2.5 px-3">เลขประจำตัวประชาชน (HR_CID)</th>
                <th className="py-2.5 px-3">ชื่อ - สกุล (FULLNAME)</th>
                <th className="py-2.5 px-3">ตำแหน่ง (HR_POSITION_NAME)</th>
                <th className="py-2.5 px-3">ระดับ (HR_LEVEL_NAME)</th>
                <th className="py-2.5 px-3">กลุ่มงานหลัก / หน่วยงานย่อย (HR_DEPARTMENT_SUB)</th>
                <th className="py-2.5 px-3">ประเภทบุคลากร (HR_PERSON_TYPE_NAME)</th>
                <th className="py-2.5 px-3 text-right">กะปฏิบัติงานวันนี้ (คนมีได้หลายกะ)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredPersonnel.map((person, personIdx) => {
                // Resolve all shifts for this person today (คนมีได้หลายกะ)
                const personShifts = attendanceStore.resolveShiftsForPerson(person.personId, today);
                const hasMultipleShifts = personShifts.length > 1;

                return (
                  <tr key={`${person.personId}-${personIdx}`} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-mono font-bold text-teal-800 text-sm">
                      {person.fingleId}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">
                      #{person.personId}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                      {person.hrCid || '-'}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                      {person.hrFullname}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                      {person.hrPositionName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                        {person.hrLevelName || '-'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <div className="font-medium text-slate-800">{person.hrDepName}</div>
                      <div className="text-[11px] text-teal-700 font-medium">{person.hrDepSubName}</div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded font-medium">
                        {person.hrPersonTypeName}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        {/* If multiple shifts, show a highlight banner */}
                        {hasMultipleShifts && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700 font-bold border border-purple-200">
                            <Layers className="w-3 h-3" />
                            <span>มี {personShifts.length} กะวันนี้</span>
                          </span>
                        )}

                        {/* List all active shifts for this person today */}
                        <div className="space-y-1">
                          {personShifts.map((shiftRes, sIdx) => {
                            const shiftCode = shiftRes.shift?.shiftCode || 'M';
                            const shiftColor = shiftRes.shift?.color || '#0284c7';

                            return (
                              <div
                                key={`${shiftRes.shift?.id || sIdx}-${sIdx}`}
                                className="flex items-center justify-end gap-1.5 text-[11px] whitespace-nowrap font-mono"
                              >
                                {hasMultipleShifts && (
                                  <span className="text-[10px] font-sans text-slate-400">
                                    กะ {sIdx + 1}:
                                  </span>
                                )}
                                <span 
                                  className="px-1.5 py-0.2 rounded text-[10px] font-bold text-white shadow-2xs"
                                  style={{ backgroundColor: shiftColor }}
                                >
                                  [{shiftCode}]
                                </span>
                                <span className="font-semibold text-slate-800">
                                  {shiftRes.startTime}–{shiftRes.endTime}
                                </span>
                                <span className="text-[10px] text-slate-500 font-sans">
                                  ({shiftRes.shift?.shiftName || 'เช้า'})
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <button
                          onClick={() => setViewingPersonShifts(person)}
                          className="text-[10px] text-teal-700 hover:text-teal-900 font-medium hover:underline inline-flex items-center gap-0.5 cursor-pointer mt-0.5"
                        >
                          <Info className="w-3 h-3" />
                          <span>ดูเวลากะ ({person.hrPersonTypeName || 'ข้าราชการ'})</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: HOSOffice Sync Report & Execution */}
      {isSyncModalOpen && syncResult && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-teal-800 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-500/20 rounded-xl border border-teal-400/30">
                  <RefreshCw className="w-5 h-5 text-teal-300" />
                </div>
                <div>
                  <h3 className="text-base font-bold">
                    ผลการดึงข้อมูลบุคลากรจาก HOSOffice (hr_person @ 10.2.0.201)
                  </h3>
                  <p className="text-xs text-teal-200">
                    เวลาที่ดึงข้อมูล: {syncResult.syncedAt} · แหล่งข้อมูล: MySQL hosoffice
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSyncModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary Cards */}
            <div className="p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <div className="text-slate-500 font-medium">ดึงตามคิวรี่ทั้งหมด</div>
                <div className="text-xl font-bold text-slate-800 mt-1 font-mono">
                  {syncResult.totalFromHosoffice}
                </div>
                <div className="text-[10px] text-slate-400">รายการใน hosoffice</div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-amber-200 bg-amber-50/30 shadow-2xs">
                <div className="text-amber-800 font-semibold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>อัปเดตข้อมูลให้ตรง</span>
                </div>
                <div className="text-xl font-bold text-amber-700 mt-1 font-mono">
                  {syncResult.updatedCount}
                </div>
                <div className="text-[10px] text-amber-600">5 ฟิลด์หลักมีการเปลี่ยนแปลง</div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-2xs">
                <div className="text-emerald-800 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>ดึงข้อมูลใหม่</span>
                </div>
                <div className="text-xl font-bold text-emerald-700 mt-1 font-mono">
                  {syncResult.insertedCount}
                </div>
                <div className="text-[10px] text-emerald-600">เพิ่มเข้าสู่ระบบสำเร็จ</div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <div className="text-slate-500 font-medium">ตรงกันแล้ว (ข้าม)</div>
                <div className="text-xl font-bold text-slate-600 mt-1 font-mono">
                  {syncResult.skippedCount}
                </div>
                <div className="text-[10px] text-slate-400">ดึงแล้ว ไม่ต้องดึงซ้ำ</div>
              </div>
            </div>

            {/* Sync Tab Navigation */}
            <div className="flex border-b border-slate-200 px-5 pt-3 gap-2 bg-white text-xs font-semibold">
              <button
                onClick={() => setSyncActiveTab('UPDATED')}
                className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 cursor-pointer transition-colors ${
                  syncActiveTab === 'UPDATED'
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>รายการที่มีการอัปเดตข้อมูล</span>
                <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[10px]">
                  {syncResult.updatedCount}
                </span>
              </button>

              <button
                onClick={() => setSyncActiveTab('INSERTED')}
                className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 cursor-pointer transition-colors ${
                  syncActiveTab === 'INSERTED'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>รายการที่ดึงใหม่</span>
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px]">
                  {syncResult.insertedCount}
                </span>
              </button>

              <button
                onClick={() => setSyncActiveTab('SKIPPED')}
                className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 cursor-pointer transition-colors ${
                  syncActiveTab === 'SKIPPED'
                    ? 'border-slate-600 text-slate-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>ดึงแล้ว / ข้อมูลตรงกัน (ข้าม)</span>
                <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 text-[10px]">
                  {syncResult.skippedCount}
                </span>
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              {/* TAB 1: UPDATED (Highlighting changes in the 5 fields) */}
              {syncActiveTab === 'UPDATED' && (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>ตรวจพบข้อมูลใน HOSOffice มีการเปลี่ยนแปลง:</strong> ระบบได้ทำการปรับปรุงฐานข้อมูลเวลาปฏิบัติงานของเราให้ตรงกับ HOSOffice อัตโนมัติในทั้ง 5 ฟิลด์หลัก (ชื่อ-สกุล, ตำแหน่ง, ระดับ, กลุ่มงาน/หน่วยงานย่อย, ประเภทบุคลากร)
                    </div>
                  </div>

                  {syncResult.updated.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      ไม่มีบุคลากรที่มีการเปลี่ยนแปลงข้อมูลในรอบนี้ (ข้อมูลในฐานเราตรงกับ HOSOffice ทุกประการ)
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {syncResult.updated.map((item, idx) => (
                        <div key={`${item.personId}-${idx}`} className="bg-white border border-amber-200/80 rounded-xl p-3.5 space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-xs">
                                {item.fullname}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 text-[10px] font-mono font-semibold">
                                Fingle #{item.fingleId}
                              </span>
                              <span className="text-slate-400 text-[10px]">
                                (HP.ID #{item.personId})
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              <span>อัปเดตตรงกับ HOSOffice แล้ว</span>
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            {item.changes.map((ch, chIdx) => (
                              <div key={`${ch.field}-${chIdx}`} className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs items-center bg-slate-50 p-2 rounded-lg">
                                <div className="sm:col-span-3 font-medium text-slate-600">
                                  {ch.label}
                                </div>
                                <div className="sm:col-span-4 text-rose-700 bg-rose-50 px-2 py-1 rounded line-through text-[11px] truncate">
                                  {ch.oldValue || '-'}
                                </div>
                                <div className="sm:col-span-1 text-center text-slate-400">
                                  <ArrowRight className="w-3.5 h-3.5 mx-auto" />
                                </div>
                                <div className="sm:col-span-4 text-emerald-700 bg-emerald-50 px-2 py-1 rounded font-semibold text-[11px] truncate">
                                  {ch.newValue}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: INSERTED */}
              {syncActiveTab === 'INSERTED' && (
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>บุคลากรใหม่ที่ดึงเข้ามาในฐานข้อมูล:</strong> บันทึกข้อมูลเจ้าหน้าที่พร้อมรหัสลายนิ้วมือ FINGLE_ID เพื่อเตรียมรองรับการลงเวลาของเครื่องสแกน
                    </div>
                  </div>

                  {syncResult.inserted.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      ไม่มีบุคลากรใหม่ที่ต้องดึง (มีข้อมูลครบถ้วนแล้ว)
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="p-2.5">FINGLE_ID</th>
                            <th className="p-2.5">ชื่อ - สกุล</th>
                            <th className="p-2.5">ตำแหน่ง / ระดับ</th>
                            <th className="p-2.5">กลุ่มงาน / หน่วยงานย่อย</th>
                            <th className="p-2.5">ประเภท</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans">
                          {syncResult.inserted.map((person, pIdx) => (
                            <tr key={`${person.personId}-${pIdx}`} className="hover:bg-slate-50">
                              <td className="p-2.5 font-mono font-bold text-teal-800">{person.fingleId}</td>
                              <td className="p-2.5 font-semibold text-slate-800">{person.hrFullname}</td>
                              <td className="p-2.5 text-slate-600">{person.hrPositionName} ({person.hrLevelName || '-'})</td>
                              <td className="p-2.5 text-slate-600">{person.hrDepName} / {person.hrDepSubName}</td>
                              <td className="p-2.5">
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] text-slate-700">
                                  {person.hrPersonTypeName}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: SKIPPED */}
              {syncActiveTab === 'SKIPPED' && (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-700 flex items-start gap-2">
                    <Database className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <div>
                      <strong>เช็คแล้ว ข้อมูลดึงแล้ว ไม่ต้องดึงซ้ำ:</strong> บุคลากรเหล่านี้มีอยู่ในฐานข้อมูลอยู่แล้ว และข้อมูลทั้ง 5 ฟิลด์ตรงกับ HOSOffice 100% จึงข้ามการเพิ่มซ้ำเพื่อความปลอดภัยของข้อมูล
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="p-2.5">HP.ID</th>
                          <th className="p-2.5">FINGLE_ID</th>
                          <th className="p-2.5">ชื่อ - สกุล</th>
                          <th className="p-2.5">สถานะการตรวจสอบ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        {syncResult.skipped.map((item, sIdx) => (
                          <tr key={`${item.personId}-${sIdx}`} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono text-slate-400">#{item.personId}</td>
                            <td className="p-2.5 font-mono font-semibold text-teal-800">{item.fingleId}</td>
                            <td className="p-2.5 font-medium text-slate-800">{item.fullname}</td>
                            <td className="p-2.5 text-slate-500 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                              <span>{item.reason}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExecuteSync(true)}
                  disabled={isSyncing}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg cursor-pointer transition-colors"
                  title="จำลองกรณีที่ HOSOffice มีการเลื่อนตำแหน่ง/ย้ายแผนก/เพิ่มคนใหม่ เพื่อทดสอบระบบตรวจจับการเปลี่ยนแปลง"
                >
                  ⚡ จำลองการเปลี่ยนแปลงใน HOSOffice (ทดสอบระบบ)
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsSyncModalOpen(false)}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
                >
                  เสร็จสิ้น / ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: View Shift Schedule by Personnel Type */}
      {viewingPersonShifts && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-teal-600" />
                  <span>เวลากะทำงานตามประเภทบุคลากร</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {viewingPersonShifts.hrFullname} · FINGLE #{viewingPersonShifts.fingleId} · {viewingPersonShifts.hrPositionName}
                </p>
              </div>
              <button
                onClick={() => setViewingPersonShifts(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs flex items-center justify-between">
              <div>
                <span className="text-teal-900 font-bold">ประเภทบุคลากร:</span>{' '}
                <span className="font-semibold text-teal-800">{viewingPersonShifts.hrPersonTypeName || 'ข้าราชการ'}</span>
              </div>
              <span className="text-[11px] text-teal-700 bg-white px-2 py-0.5 rounded border border-teal-200 font-mono">
                {viewingPersonShifts.hrDepName}
              </span>
            </div>

            {/* Shift Details */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700">
                กะมาตรฐานที่ใช้คำนวณเวลา (3 กะหลัก):
              </div>

              <div className="space-y-2">
                {attendanceStore.resolveShiftsForPerson(viewingPersonShifts.personId, today).map((s, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="px-2 py-0.5 rounded text-white font-bold text-[11px] font-mono bg-teal-700 shadow-2xs">
                        {idx === 0 ? 'กะเช้า' : idx === 1 ? 'กะบ่าย' : 'กะดึก'}
                      </span>
                      <div>
                        <div className="font-bold text-slate-800">
                          {s.startTime} - {s.endTime} น.
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {s.lateGraceMinutes > 0 ? `ยืดหยุ่นสายได้ ${s.lateGraceMinutes} นาที` : 'ไม่มีเวลายืดหยุ่น (เริ่มสายทันที)'}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {s.source}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600">
              💡 สามารถปรับแก้เวลาเริ่ม-เลิก และเวลายืดหยุ่นของประเภทนี้ได้ที่เมนู <strong>"ประเภทบุคลากร &amp; เวลากะ"</strong>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewingPersonShifts(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg text-xs cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
