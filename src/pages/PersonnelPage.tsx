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
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
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
    if (selectedStatus !== 'ALL') {
      const pStatus = p.hrStatusName || (p.status === 'ACTIVE' ? 'ปฏิบัติราชการ' : 'ไม่ได้ปฏิบัติราชการ');
      if (selectedStatus === 'ACTIVE' && !pStatus.includes('ปฏิบัติราชการ') && p.status !== 'ACTIVE') return false;
      if (selectedStatus === 'INACTIVE' && (pStatus.includes('ปฏิบัติราชการ') || p.status === 'ACTIVE')) return false;
    }
    if (searchTerm) {
      const matchName = p.hrFullname.toLowerCase().includes(searchTerm.toLowerCase());
      const matchFingle = p.fingleId.toString().includes(searchTerm);
      const matchPos = p.hrPositionName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCid = p.hrCid?.includes(searchTerm);
      if (!matchName && !matchFingle && !matchPos && !matchCid) return false;
    }
    return true;
  });

  const hosofficeSqlQuery = `WITH active_person AS (
  SELECT * 
  FROM hr_person 
  WHERE HR_STATUS_ID IN ('01')
)
SELECT 
  hp.ID AS id,
  hp.FINGLE_ID AS fingle_id,
  hp.HR_CID AS hr_cid,
  TRIM(CONCAT(
    COALESCE(hf.HR_PREFIX_NAME, ''),
    COALESCE(hp.HR_FNAME, ''),
    CASE 
      WHEN hp.HR_LNAME IS NOT NULL AND TRIM(hp.HR_LNAME) != '' 
      THEN CONCAT(' ', TRIM(hp.HR_LNAME)) 
      ELSE '' 
    END
  )) AS hr_fullname,
  hp.HR_FNAME AS hr_fname,
  hp.HR_LNAME AS hr_lname,
  COALESCE(ht.HR_POSITION_NAME, '') AS hr_position_name,
  COALESCE(hd.HR_DEPARTMENT_NAME, '') AS hr_dep_name,
  COALESCE(hds.HR_DEPARTMENT_SUB_NAME, '') AS hr_dep_sub_name,
  COALESCE(hpt.HR_PERSON_TYPE_NAME, 'ข้าราชการ') AS hr_person_type_name,
  COALESCE(hl.HR_LEVEL_NAME, '') AS hr_level_name,
  hp.HR_STATUS_ID AS hr_status_id,
  COALESCE(hs.HR_STATUS_NAME, 'ปฏิบัติราชการ') AS hr_status_name
FROM active_person hp
LEFT JOIN hr_prefix hf 
  ON hp.HR_PREFIX_ID = hf.HR_PREFIX_ID
LEFT JOIN hr_position ht 
  ON hp.HR_POSITION_ID = ht.HR_POSITION_ID
LEFT JOIN hr_department hd 
  ON hp.HR_DEPARTMENT_ID = hd.HR_DEPARTMENT_ID
LEFT JOIN hr_department_sub hds 
  ON hp.HR_DEPARTMENT_SUB_ID = hds.HR_DEPARTMENT_SUB_ID
LEFT JOIN hr_person_type hpt 
  ON hp.HR_PERSON_TYPE_ID = hpt.HR_PERSON_TYPE_ID
LEFT JOIN hr_level hl 
  ON hp.HR_LEVEL_ID = hl.HR_LEVEL_ID
LEFT JOIN hr_status hs 
  ON hp.HR_STATUS_ID = hs.HR_STATUS_ID
ORDER BY hp.ID ASC;`;

  const handleCopyQuery = () => {
    navigator.clipboard.writeText(hosofficeSqlQuery);
    setCopiedQuery(true);
    setTimeout(() => setCopiedQuery(false), 2000);
  };

  // Perform Sync from HOSOffice เข้าสู่ samchuk_attendance.attendance_personnel
  // วัตถุประสงค์: ดึงข้อมูลมาเก็บไว้ในทำเนียบบุคลากร เพื่อไม่ต้องบันทึกข้อมูลเองทีละคน (ไม่เช็คสถานะสแกน)
  const handleExecuteSync = async (simulateChanges = false) => {
    setIsSyncing(true);
    let customData: any = undefined;

    if (!simulateChanges) {
      try {
        const syncRes = await apiClient.syncPersonnelFromHosoffice();
        if (syncRes && syncRes.success && Array.isArray(syncRes.data) && syncRes.data.length > 0) {
          customData = syncRes.data.map((r: any) => ({
            ID: r.personId || r.id,
            HR_CID: r.hrCid || r.hr_cid || '',
            FULLNAME: (r.hrFullname || r.hr_fullname || '').trim() || `เจ้าหน้าที่ รหัส ${r.personId || r.id}`,
            HR_POSITION_NAME: r.hrPositionName || r.hr_position_name || 'เจ้าหน้าที่',
            HR_LEVEL_NAME: r.hrLevelName || r.hr_level_name || '',
            HR_DEPARTMENT_NAME: r.hrDepName || r.hr_dep_name || 'โรงพยาบาลสามชุก',
            HR_DEPARTMENT_SUB: r.hrDepSubName || r.hr_dep_sub_name || '',
            HR_PERSON_TYPE_NAME: r.hrPersonTypeName || r.hr_person_type_name || 'ข้าราชการ',
            FINGLE_ID: r.fingleId || r.fingle_id || r.id,
            HR_STATUS_ID: r.hrStatusId || r.hr_status_id || '01',
            HR_STATUS_NAME: r.hrStatusName || r.hr_status_name || 'ปฏิบัติราชการ'
          }));
        } else {
          // หากผลลัพธ์จาก API ว่างเปล่า ให้ลองโหลดจาก DB อีกครั้ง
          await attendanceStore.loadFromMySqlDb();
          const liveData = attendanceStore.getState().personnel;
          if (liveData && liveData.length > 0) {
            customData = liveData.map((r: any) => ({
              ID: r.personId || r.id,
              HR_CID: r.hrCid || r.hr_cid || '',
              FULLNAME: (r.hrFullname || r.hr_fullname || '').trim() || `เจ้าหน้าที่ รหัส ${r.personId || r.id}`,
              HR_POSITION_NAME: r.hrPositionName || r.hr_position_name || 'เจ้าหน้าที่',
              HR_LEVEL_NAME: r.hrLevelName || r.hr_level_name || '',
              HR_DEPARTMENT_NAME: r.hrDepName || r.hr_dep_name || 'โรงพยาบาลสามชุก',
              HR_DEPARTMENT_SUB: r.hrDepSubName || r.hr_dep_sub_name || '',
              HR_PERSON_TYPE_NAME: r.hrPersonTypeName || r.hr_person_type_name || 'ข้าราชการ',
              FINGLE_ID: r.fingleId || r.fingle_id || r.id,
              HR_STATUS_ID: r.hrStatusId || r.hr_status_id || '01',
              HR_STATUS_NAME: r.hrStatusName || r.hr_status_name || 'ปฏิบัติราชการ'
            }));
          }
        }
      } catch (err: any) {
        console.warn('Sync personnel failed, falling back to hospital master data:', err);
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
          FINGLE_ID: p.fingleId,
          HR_STATUS_ID: p.hrStatusId || '01',
          HR_STATUS_NAME: p.hrStatusName || 'ปฏิบัติราชการ'
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
          FINGLE_ID: 155,
          HR_STATUS_ID: '01',
          HR_STATUS_NAME: 'ปฏิบัติราชการ'
        }
      ];
    }

    // ซิงค์เข้า Store และแสดงผลทันที
    const result = attendanceStore.syncPersonnelFromHosoffice(state.currentUser, customData);
    setSyncResult(result);
    setIsSyncing(false);
    setIsSyncModalOpen(true);
    if (result.insertedCount > 0) setSyncActiveTab('INSERTED');
    else if (result.updatedCount > 0) setSyncActiveTab('UPDATED');
    else setSyncActiveTab('SKIPPED');
  };

  // ล้างข้อมูลบุคลากรในฐาน samchuk_attendance
  const handleClearPersonnelInDb = async () => {
    setIsSyncing(true);
    try {
      await apiClient.clearPersonnelInDb();
      await attendanceStore.loadFromMySqlDb();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Title & Main Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-mono font-medium mb-1">
            <span>ฐานข้อมูลที่ 1: samchuk_attendance.attendance_personnel (แยกอิสระ ไม่เชื่อมต่อ hosoffice อัตโนมัติ)</span>
          </div>
          <h2 className="text-base font-bold text-slate-800">
            ข้อมูลบุคลากรและรหัสสแกนนิ้ว (Personnel Directory)
          </h2>
          <p className="text-xs text-slate-500">
            ดึงข้อมูลจาก hosoffice.hr_person เข้าสู่ระบบลงเวลาอัตโนมัติ เพื่อไม่ต้องบันทึกข้อมูลเอง
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
            title="ดึงข้อมูลจากตาราง hr_person ใน hosoffice มาเก็บใน samchuk_attendance เพื่อไม่ต้องพิมพ์เอง"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'กำลังดึงข้อมูล...' : '📥 ดึงข้อมูลบุคลากรจาก HOSOffice'}</span>
          </button>

          {/* Button: Clear Personnel in Samchuk DB */}
          {isAdmin && state.personnel.length > 0 && (
            <button
              onClick={handleClearPersonnelInDb}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg cursor-pointer transition-colors"
              title="ลบข้อมูลบุคลากรในฐาน samchuk_attendance เพื่อทดสอบการดึงข้อมูลใหม่"
            >
              <span>ล้างเป็น 0 ท่าน</span>
            </button>
          )}

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
            <span>* คิวรี่นี้ใช้ดึง 6 ฟิลด์หลักในการตรวจสอบและอัปเดต:</span>
            <span className="text-amber-300 font-mono">1. FULLNAME</span>
            <span className="text-amber-300 font-mono">2. HR_POSITION_NAME</span>
            <span className="text-amber-300 font-mono">3. HR_LEVEL_NAME</span>
            <span className="text-amber-300 font-mono">4. HR_DEPARTMENT_SUB</span>
            <span className="text-amber-300 font-mono">5. HR_PERSON_TYPE_NAME</span>
            <span className="text-amber-300 font-mono">6. HR_STATUS_NAME (สถานะการปฏิบัติงาน)</span>
            <span>ร่วมกับ <code className="text-teal-300">HP.FINGLE_ID</code>, <code className="text-teal-300">HP.HR_CID</code>, และ <code className="text-teal-300">HP.ID</code></span>
          </div>
        </div>
      )}

      {/* Notice Card: HOSOffice Purpose */}
      <div className="bg-gradient-to-r from-teal-50 via-emerald-50 to-cyan-50 border border-teal-200 rounded-xl p-3.5 text-xs text-teal-900 flex items-start gap-3 shadow-xs">
        <div className="p-1.5 bg-teal-600 text-white rounded-lg shrink-0 mt-0.5">
          <Info className="w-4 h-4" />
        </div>
        <div className="space-y-1">
          <div className="font-bold text-teal-950 flex items-center gap-2">
            <span>นำเข้าข้อมูลบุคลากรและรหัสสแกนนิ้วจาก HOSOffice (hr_person @ 10.2.0.201)</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-200/80 text-teal-800">
              เพื่อไม่ต้องบันทึกข้อมูลเอง
            </span>
          </div>
          <p className="text-[11px] text-teal-800 leading-relaxed">
            ระบบจะดึงข้อมูลรายชื่อ, <strong>รหัสสแกนนิ้ว (FINGLE_ID)</strong>, เลขบัตรประชาชน (CID), ตำแหน่ง, ระดับ, กลุ่มงาน, ประเภทบุคลากร และ<strong>สถานะการปฏิบัติงาน (HR_STATUS_NAME)</strong> จากฐาน HOSOffice มาบันทึกในทำเนียบบุคลากรให้โดยตรง 
            <strong> เพื่อที่เจ้าหน้าที่ฝ่ายบุคคลจะได้ไม่ต้องเสียเวลาคีย์ข้อมูลทีละคน</strong> โดยการดึงนี้เป็นการนำเข้าข้อมูลประวัติบุคลากรเท่านั้น ไม่เกี่ยวข้องกับการประมวลผลสถานะสแกนเวลา
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ, FINGLE_ID, เลขบัตร, ตำแหน่ง..."
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
            <option value="ALL">ทุกกลุ่มงาน/ฝ่ายหลัก</option>
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
            <option value="ALL">ทุกประเภทบุคลากร</option>
            {personTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
          >
            <option value="ALL">ทุกสถานะ (HR_STATUS)</option>
            <option value="ACTIVE">ปฏิบัติราชการ (Active / 01)</option>
            <option value="INACTIVE">ไม่ได้ปฏิบัติราชการ (Inactive)</option>
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
                <th className="py-2.5 px-3">สถานะ (HR_STATUS)</th>
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
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        person.status === 'ACTIVE' || person.hrStatusId === '01' || person.hrStatusId === 1
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          person.status === 'ACTIVE' || person.hrStatusId === '01' || person.hrStatusId === 1
                            ? 'bg-emerald-500'
                            : 'bg-rose-400'
                        }`} />
                        <span>{person.hrStatusName || (person.status === 'ACTIVE' ? 'ปฏิบัติราชการ' : 'ไม่ได้ปฏิบัติราชการ')}</span>
                        {person.hrStatusId && (
                          <span className="text-[10px] text-slate-500 font-mono">({person.hrStatusId})</span>
                        )}
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

              {filteredPersonnel.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="p-3 bg-teal-50 text-teal-700 rounded-full">
                        <Users className="w-8 h-8" />
                      </div>
                      <div className="font-bold text-slate-800 text-sm">
                        ไม่มีข้อมูลบุคลากรในฐานข้อมูล samchuk_attendance (0 ท่าน)
                      </div>
                      <p className="text-xs text-slate-500 max-w-md">
                        ระบบไม่ดึงข้อมูลจากฐาน hosoffice อัตโนมัติ เพื่อให้ท่านควบคุมข้อมูลได้อย่างอิสระ หากต้องการนำเข้ารายชื่อบุคลากรจาก HOSOffice มาใส่ฐาน samchuk_attendance สามารถกดปุ่มด้านล่างได้ทันที
                      </p>
                      {isAdmin && (
                        <button
                          onClick={() => handleExecuteSync(false)}
                          disabled={isSyncing}
                          className="mt-2 flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
                        >
                          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                          <span>📥 ดึงข้อมูลบุคลากรจาก HOSOffice มาใส่ฐาน samchuk_attendance</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
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
                      <strong>ตรวจพบข้อมูลใน HOSOffice มีการเปลี่ยนแปลง:</strong> ระบบได้ทำการปรับปรุงฐานข้อมูลเวลาปฏิบัติงานของเราให้ตรงกับ HOSOffice อัตโนมัติในทั้ง 6 ฟิลด์หลัก (ชื่อ-สกุล, ตำแหน่ง, ระดับ, กลุ่มงาน/หน่วยงานย่อย, ประเภทบุคลากร, สถานะการปฏิบัติงาน)
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
                            <th className="p-2.5">สถานะ</th>
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
                              <td className="p-2.5">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                                  person.status === 'ACTIVE' || person.hrStatusId === '01'
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                                }`}>
                                  {person.hrStatusName || (person.status === 'ACTIVE' ? 'ปฏิบัติราชการ' : 'ไม่ได้ปฏิบัติราชการ')}
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
                      <strong>เช็คแล้ว ข้อมูลดึงแล้ว ไม่ต้องดึงซ้ำ:</strong> บุคลากรเหล่านี้มีอยู่ในฐานข้อมูลอยู่แล้ว และข้อมูลทั้ง 6 ฟิลด์ตรงกับ HOSOffice 100% จึงข้ามการเพิ่มซ้ำเพื่อความปลอดภัยของข้อมูล
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
