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
import { User } from './types/attendance';

export default function App() {
  const [storeState, setStoreState] = useState<StoreState>(attendanceStore.getState());
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Subscribe to store updates
  useEffect(() => {
    const unsubscribe = attendanceStore.subscribe(() => {
      setStoreState({ ...attendanceStore.getState() });
    });
    return unsubscribe;
  }, []);

  // Background auto-sync simulation (every 60s as specified in Section 7)
  useEffect(() => {
    const timer = setInterval(() => {
      if (storeState.autoSyncEnabled) {
        attendanceStore.triggerScannerSync();
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [storeState.autoSyncEnabled]);

  // Handle manual sync action
  const handleTriggerSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      const res = attendanceStore.triggerScannerSync();
      setIsSyncing(false);
      showToast(`⚡ บันทึกสแกนดิบ (+${res.totalNew} รายการ) และประมวลผลเวลา (${res.processedCount} คน) สำเร็จพร้อมกันในขั้นตอนเดียว!`);
    }, 500);
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
      title: 'จัดการกะการทำงานและตารางเวร (Shifts & Roster)',
      subtitle: 'แก้ไขเวลากะเช้า/บ่าย/ดึก/เช้าควบบ่าย, จัดกลุ่มบุคลากร และ Override'
    },
    raw_scans: {
      title: 'บันทึกสแกนดิบ (Raw Scans Staging DB)',
      subtitle: 'ตาราง attendance_raw_scan ข้อมูลจริงจาก HIP CMiF68S'
    },
    attendance: {
      title: 'ผลการประมวลผลเวลาปฏิบัติงาน (Attendance Calculation)',
      subtitle: 'คำนวณการเข้าตรงเวลา สาย ออกก่อน และ OT ตามลำดับความสำคัญของกะ'
    },
    monthly_report: {
      title: 'รายงานสรุปประจำเดือนสำหรับฝ่ายบุคคล/การเงิน (Monthly HR Attendance Report)',
      subtitle: 'สรุปยอดวันทำงาน, มาสาย, ออกก่อน, OT สะสม และพิมพ์รายงาน/ส่งออก Excel'
    },
    my_attendance: {
      title: 'เวลาทำงานและตารางเวรของฉัน (My Attendance & Roster)',
      subtitle: 'ตรวจสอบสถานะสแกนนิ้ววันนี้, ตารางเวรที่ได้รับมอบหมาย และประวัติการลงเวลาส่วนบุคคล'
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
          onSyncClick={handleTriggerSync}
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
              onSync={handleTriggerSync}
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
              onSync={handleTriggerSync}
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
              onSync={handleTriggerSync}
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
