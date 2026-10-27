import React, { useState, useEffect } from 'react';
import { attendanceStore, StoreState } from './services/attendanceStore';
import { Navigation, NavTab } from './components/Navigation';
import { Header } from './components/Header';
import { DashboardPage } from './pages/DashboardPage';
import { PushToHosofficePage } from './pages/PushToHosofficePage';
import { ShiftsAndRosterPage } from './pages/ShiftsAndRosterPage';
import { RawScansPage } from './pages/RawScansPage';
import { AttendancePage } from './pages/AttendancePage';
import { ScannersPage } from './pages/ScannersPage';
import { PersonnelPage } from './pages/PersonnelPage';
import { SystemAndLogsPage } from './pages/SystemAndLogsPage';
import { MonthlyReportPage } from './pages/MonthlyReportPage';
import { MyAttendancePage } from './pages/MyAttendancePage';
import { CustomSyncModal } from './components/CustomSyncModal';
import { SyncLoadingOverlay } from './components/SyncLoadingOverlay';
import { User } from './types/attendance';

export default function App() {
  const [storeState, setStoreState] = useState<StoreState>(attendanceStore.getState());
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isCustomSyncOpen, setIsCustomSyncOpen] = useState(false);

  // Subscribe to store updates
  useEffect(() => {
    const unsubscribe = attendanceStore.subscribe(() => {
      setStoreState({ ...attendanceStore.getState() });
    });
    return unsubscribe;
  }, []);

  // เมื่อผู้ใช้กดปุ่ม Sync ด่วนจาก Header หรือปุ่มดึงด่วนในหน้าต่างๆ ให้เริ่มดึงข้อมูลดิบจากเครื่อง 1, 2, 3 พร้อมหน้า Loading ล็อกจอ
  const handleQuickSync = async () => {
    setIsSyncing(true);
    try {
      const todayBangkok = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
      const res = await attendanceStore.syncScannersCustom({
        machineNos: [1, 2, 3],
        mode: 'TODAY',
        date: todayBangkok,
        allPersonnel: true,
        recalculate: true,
        strategy: 'SKIP_DUPLICATES',
        preview: false
      });
      showToast(res.message);
    } catch (err: any) {
      showToast(err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลจากเครื่องสแกน');
    } finally {
      setIsSyncing(false);
    }
  };

  // เมื่อผู้ใช้ต้องการกำหนดเงื่อนไขเครื่อง/วันที่เอง
  const handleTriggerCustomSync = () => {
    setIsCustomSyncOpen(true);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleUserChange = (user: User) => {
    attendanceStore.setCurrentUser(user);
    if (user.role === 'USER') {
      // Direct user to their own personal attendance dashboard
      setCurrentTab('my_attendance');
    }
    showToast(`สลับผู้ใช้งานเป็น: ${user.fullname} (${user.role})`);
  };

  const pendingPushCount = storeState.rawScans.filter(s => s.pushStatus === 'PENDING').length;

  const tabTitles: Record<NavTab, { title: string; subtitle: string }> = {
    dashboard: {
      title: 'แดชบอร์ดภาพรวมการลงเวลา',
      subtitle: 'Samchuk Hospital Attendance Overview & Real-time Telemetry'
    },
    push: {
      title: 'ส่งข้อมูลเข้า MySQL hosoffice (Manual Push)',
      subtitle: 'ตรวจสอบและยืนยันการส่งข้อมูลเข้าตาราง hosoffice.fingle_scan'
    },
    shifts: {
      title: 'จัดการกะการทำงานและประเภทบุคลากร (Personnel Types & Shifts)',
      subtitle: 'กำหนดเวลากะเช้า/บ่าย/ดึก และเกณฑ์สายแยกตามประเภทบุคลากร รพ.สามชุก'
    },
    raw_scans: {
      title: 'บันทึกสแกนดิบ (Raw Scans Staging DB)',
      subtitle: 'ตาราง attendance_raw_scan ข้อมูลจริงจาก HIP CMiF68S'
    },
    attendance: {
      title: 'รายงานสรุปเวลาปฏิบัติงานสำหรับผู้บริหาร (Executive Attendance Summary)',
      subtitle: 'สรุปเวลาสแกนจริง เข้า-ออก และคำนวณการมาสายตามประเภทบุคลากร (Personnel Type) โดยตรง'
    },
    monthly_report: {
      title: 'รายงานสรุปประจำเดือนสำหรับฝ่ายบุคคล/การเงิน (Monthly HR Attendance Report)',
      subtitle: 'สรุปยอดวันทำงาน, มาสาย, ออกก่อน, OT สะสม และพิมพ์รายงาน/ส่งออก Excel'
    },
    my_attendance: {
      title: 'ดูข้อมูลรายคน / ฝ่าย (Individual & Department Attendance)',
      subtitle: 'เลือกดูประวัติการลงเวลาและสแกนนิ้วแยกรายบุคคล หรือดูสรุปภาพรวมการเข้างานตามฝ่าย/กลุ่มงาน'
    },
    scanners: {
      title: 'จัดการเครื่องสแกนนิ้วมือ (CMiF68S Scanners)',
      subtitle: 'ทดสอบการเชื่อมต่อ FK_ConnectNet และสั่ง Sync ผ่าน Native DLL'
    },
    personnel: {
      title: 'ทำเนียบบุคลากรและรหัสสแกนนิ้ว (HR Directory)',
      subtitle: 'อ่านข้อมูลอย่างเดียวจากตาราง hosoffice.hr_person'
    },
    system: {
      title: 'ระบบ สถาปัตยกรรม และประวัติการทำงาน (System & Logs)',
      subtitle: 'Sync Logs, Audit Trails, MySQL DDL Schemas, และ C# ASP.NET Core 10'
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 overflow-hidden font-sans antialiased">
      {/* Sidebar Navigation */}
      <Navigation
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        currentUser={storeState.currentUser}
        onUserChange={handleUserChange}
        allUsers={storeState.users}
        pendingPushCount={pendingPushCount}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <Header
          title={tabTitles[currentTab].title}
          subtitle={tabTitles[currentTab].subtitle}
          currentUser={storeState.currentUser}
          scanners={storeState.scanners}
          pendingCount={pendingPushCount}
          onSyncClick={handleQuickSync}
          isSyncing={isSyncing}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Dynamic Page View */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {currentTab === 'dashboard' && (
            <DashboardPage
              state={storeState}
              onNavigate={setCurrentTab}
              onSync={handleQuickSync}
              isSyncing={isSyncing}
            />
          )}

          {currentTab === 'push' && (
            <PushToHosofficePage state={storeState} />
          )}

          {currentTab === 'shifts' && (
            <ShiftsAndRosterPage state={storeState} />
          )}

          {currentTab === 'raw_scans' && (
            <RawScansPage
              state={storeState}
              onSync={handleQuickSync}
              isSyncing={isSyncing}
            />
          )}

          {currentTab === 'attendance' && (
            <AttendancePage state={storeState} />
          )}

          {currentTab === 'monthly_report' && (
            <MonthlyReportPage state={storeState} />
          )}

          {currentTab === 'my_attendance' && (
            <MyAttendancePage state={storeState} />
          )}

          {currentTab === 'scanners' && (
            <ScannersPage
              state={storeState}
              onSync={handleQuickSync}
              isSyncing={isSyncing}
            />
          )}

          {currentTab === 'personnel' && (
            <PersonnelPage state={storeState} />
          )}

          {currentTab === 'system' && (
            <SystemAndLogsPage state={storeState} />
          )}
        </main>
      </div>

      {/* Fullscreen Loading Screen blocking all clicks until sync is complete */}
      <SyncLoadingOverlay
        isLoading={isSyncing}
        title="กำลังดึงข้อมูลดิบจากเครื่องสแกนนิ้วมือ (ดึงด่วน)..."
        subtitle="ระบบกำลังติดต่อเครื่องสแกน HIP CMiF68S เครื่อง 1, 2, 3 ผ่าน TCP Port 5005 และบันทึกลง MySQL attendance_raw_scan"
        machines={[1, 2, 3]}
        modeText="ดึงข้อมูลด่วนวันนี้ (เครื่อง 1-3)"
      />

      {/* Custom Sync Modal with Preview and Duplicate Control */}
      <CustomSyncModal
        isOpen={isCustomSyncOpen}
        onClose={() => setIsCustomSyncOpen(false)}
        onSyncComplete={(msg) => {
          setIsCustomSyncOpen(false);
          showToast(msg);
        }}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-lg shadow-lg border border-slate-700 flex items-center gap-2 animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-teal-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
