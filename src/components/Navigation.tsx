import React from 'react';
import { 
  LayoutDashboard, 
  Send, 
  CalendarClock, 
  Fingerprint, 
  CheckCircle2, 
  Cpu, 
  Users, 
  FileText, 
  ShieldCheck, 
  Hospital,
  PanelLeftClose,
  PanelLeft,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  UserCheck
} from 'lucide-react';
import { User } from '../types/attendance';

export type NavTab = 
  | 'dashboard' 
  | 'push' 
  | 'shifts' 
  | 'raw_scans' 
  | 'attendance' 
  | 'monthly_report'
  | 'my_attendance'
  | 'scanners' 
  | 'personnel' 
  | 'system';

interface NavigationProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  currentUser: User;
  onUserChange: (user: User) => void;
  allUsers: User[];
  pendingPushCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onTabChange,
  currentUser,
  onUserChange,
  allUsers,
  pendingPushCount,
  isCollapsed,
  onToggleCollapse,
}) => {
  const isAdmin = currentUser.role === 'ADMIN';

  // For USER role, emphasize My Attendance first, followed by Monthly Report and Dashboard
  const navItems = isAdmin ? [
    {
      id: 'dashboard' as NavTab,
      label: 'แดชบอร์ดภาพรวม',
      sublabel: 'Dashboard',
      icon: LayoutDashboard,
      adminOnly: false,
    },
    {
      id: 'push' as NavTab,
      label: 'ส่งข้อมูลเข้า hosoffice',
      sublabel: 'Push to hosoffice',
      icon: Send,
      adminOnly: true,
      badge: pendingPushCount > 0 ? pendingPushCount : undefined,
    },
    {
      id: 'shifts' as NavTab,
      label: 'กะและตารางเวร',
      sublabel: 'Shifts & Roster',
      icon: CalendarClock,
      adminOnly: true,
    },
    {
      id: 'attendance' as NavTab,
      label: 'ประมวลผลเวลาทำงาน',
      sublabel: 'Attendance & Late',
      icon: CheckCircle2,
      adminOnly: false,
    },
    {
      id: 'monthly_report' as NavTab,
      label: 'รายงานสรุปประจำเดือน HR',
      sublabel: 'Monthly HR Report',
      icon: FileSpreadsheet,
      adminOnly: false,
    },
    {
      id: 'raw_scans' as NavTab,
      label: 'บันทึกสแกนดิบ (Staging)',
      sublabel: 'Raw Scan Logs',
      icon: Fingerprint,
      adminOnly: false,
    },
    {
      id: 'my_attendance' as NavTab,
      label: 'เวลาทำงานของฉัน',
      sublabel: 'My Attendance',
      icon: UserCheck,
      adminOnly: false,
    },
    {
      id: 'scanners' as NavTab,
      label: 'จัดการเครื่องสแกน',
      sublabel: 'Scanners (CMiF68S)',
      icon: Cpu,
      adminOnly: true,
    },
    {
      id: 'personnel' as NavTab,
      label: 'ข้อมูลบุคลากร HR',
      sublabel: 'Personnel Directory',
      icon: Users,
      adminOnly: false,
    },
    {
      id: 'system' as NavTab,
      label: 'ระบบ & ประวัติ Log',
      sublabel: 'System & Architecture',
      icon: FileText,
      adminOnly: true,
    },
  ] : [
    {
      id: 'my_attendance' as NavTab,
      label: 'เวลาทำงานและตารางเวรของฉัน',
      sublabel: 'My Attendance & Roster',
      icon: UserCheck,
      adminOnly: false,
    },
    {
      id: 'monthly_report' as NavTab,
      label: 'รายงานสรุปประจำเดือน HR',
      sublabel: 'Monthly HR Report',
      icon: FileSpreadsheet,
      adminOnly: false,
    },
    {
      id: 'dashboard' as NavTab,
      label: 'แดชบอร์ดภาพรวม',
      sublabel: 'Hospital Overview',
      icon: LayoutDashboard,
      adminOnly: false,
    },
    {
      id: 'raw_scans' as NavTab,
      label: 'บันทึกสแกนดิบ (Staging)',
      sublabel: 'Raw Scan Logs',
      icon: Fingerprint,
      adminOnly: false,
    },
    {
      id: 'attendance' as NavTab,
      label: 'ประมวลผลเวลาทำงาน',
      sublabel: 'Attendance & Late',
      icon: CheckCircle2,
      adminOnly: false,
    },
    {
      id: 'personnel' as NavTab,
      label: 'ข้อมูลบุคลากร HR',
      sublabel: 'Personnel Directory',
      icon: Users,
      adminOnly: false,
    },
  ];

  return (
    <aside 
      className={`bg-slate-900 text-slate-200 flex flex-col shrink-0 min-h-screen border-r border-slate-800 select-none transition-all duration-200 ease-in-out ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className={`p-3 border-b border-slate-800 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <Hospital className="w-5 h-5" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-white tracking-tight leading-tight truncate">
                รพ.สามชุก
              </h1>
              <p className="text-[11px] text-slate-400 truncate">
                ระบบจัดการสแกนนิ้ว v2
              </p>
            </div>
          )}
        </div>

        {/* Toggle Collapse Button */}
        <button
          onClick={onToggleCollapse}
          className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 cursor-pointer transition-colors"
          title={isCollapsed ? 'ขยายเมนู (Expand Sidebar)' : 'ย่อเมนู (Collapse Sidebar)'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Role Switcher banner */}
      {!isCollapsed ? (
        <div className="px-3 pt-3 pb-2 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="font-medium">สิทธิ์การใช้งาน (Role)</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider ${
              isAdmin ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            }`}>
              {currentUser.role}
            </span>
          </div>
          <select
            value={currentUser.id}
            onChange={(e) => {
              const selected = allUsers.find(u => u.id === Number(e.target.value));
              if (selected) onUserChange(selected);
            }}
            className="w-full bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
          >
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullname} ({u.role})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
            {isAdmin 
              ? '✓ เข้าถึงปุ่มส่งข้อมูล, กะ, Roster และตั้งค่าเครื่อง' 
              : '🔒 ดูข้อมูลอย่างเดียว (ซ่อนปุ่มส่งและเมนูจัดการ)'}
          </p>
        </div>
      ) : (
        <div className="py-2 flex justify-center border-b border-slate-800 bg-slate-950/60" title={`สิทธิ์ปัจจุบัน: ${currentUser.role}`}>
          <span className={`w-3 h-3 rounded-full ${isAdmin ? 'bg-amber-400' : 'bg-blue-400'}`}></span>
        </div>
      )}

      {/* Nav Menu */}
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {!isCollapsed && (
          <div className="px-2 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            เมนูหลัก
          </div>
        )}

        {navItems.map((item) => {
          if (item.adminOnly && !isAdmin) {
            return null;
          }

          const isActive = currentTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              title={isCollapsed ? `${item.label} (${item.sublabel})` : undefined}
              className={`w-full flex items-center rounded-lg text-left text-xs transition-colors group relative cursor-pointer ${
                isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
              } ${
                isActive
                  ? 'bg-teal-600 text-white font-medium shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} />
                {!isCollapsed && (
                  <div className="truncate">
                    <div className="truncate leading-tight font-medium">{item.label}</div>
                    <div className={`text-[10px] truncate ${isActive ? 'text-teal-100' : 'text-slate-500'}`}>
                      {item.sublabel}
                    </div>
                  </div>
                )}
              </div>

              {item.badge !== undefined && (
                !isCollapsed ? (
                  <span className={`text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white text-teal-800' : 'bg-amber-500 text-slate-950 font-bold'
                  }`}>
                    {item.badge}
                  </span>
                ) : (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400"></span>
                )
              )}
            </button>
          );
        })}
      </nav>

      {/* Database Architecture Status (Only shown when expanded) */}
      {!isCollapsed && (
        <div className="p-3 border-t border-slate-800 text-[11px] text-slate-400 bg-slate-950/40">
          <div className="flex items-center gap-1.5 mb-1 text-slate-300 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span>สถาปัตยกรรม 2 ฐานข้อมูล</span>
          </div>
          <div className="space-y-1 text-[10px] text-slate-400 leading-tight">
            <div className="flex items-center justify-between">
              <span>samchuk_attendance:</span>
              <span className="text-emerald-400 font-mono">10.2.0.201 (Auto)</span>
            </div>
            <div className="flex items-center justify-between">
              <span>hosoffice:</span>
              <span className="text-amber-400 font-mono">10.2.0.201 (กดส่ง)</span>
            </div>
          </div>
        </div>
      )}

      {/* User Info Footer */}
      <div className={`p-3 border-t border-slate-800 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div 
            className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 text-xs font-semibold"
            title={`${currentUser.fullname} (${currentUser.role})`}
          >
            {currentUser.fullname.charAt(0)}
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <div className="text-xs text-slate-200 font-medium truncate">{currentUser.fullname}</div>
              <div className="text-[10px] text-slate-500 truncate">{currentUser.department}</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
