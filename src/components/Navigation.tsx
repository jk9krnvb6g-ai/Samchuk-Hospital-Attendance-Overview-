import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Send, 
  CalendarClock, 
  Fingerprint, 
  CheckCircle2, 
  Cpu, 
  Users, 
  FileText, 
  Hospital,
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
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

  // Collapsed sections tracking
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  interface NavItem {
    id: NavTab;
    label: string;
    sublabel: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }

  interface NavSection {
    key: string;
    title: string;
    items: NavItem[];
  }

  const adminSections: NavSection[] = [
    {
      key: 'daily',
      title: 'งานประจำวัน & รายงาน',
      items: [
        {
          id: 'dashboard',
          label: 'แดชบอร์ดภาพรวม',
          sublabel: 'Dashboard Overview',
          icon: LayoutDashboard,
        },
        {
          id: 'attendance',
          label: 'รายงานสรุปเวลา (ผู้บริหาร)',
          sublabel: 'Executive Attendance',
          icon: CheckCircle2,
        },
        {
          id: 'monthly_report',
          label: 'รายงานสรุปประจำเดือน HR',
          sublabel: 'Monthly HR Report',
          icon: FileSpreadsheet,
        },
        {
          id: 'my_attendance',
          label: 'เวลาทำงานของฉัน',
          sublabel: 'My Personal Attendance',
          icon: UserCheck,
        },
      ]
    },
    {
      key: 'sync',
      title: 'ข้อมูลสแกน & ส่ง HOSxP',
      items: [
        {
          id: 'raw_scans',
          label: 'บันทึกสแกนดิบ (Staging)',
          sublabel: 'Raw Scan Logs',
          icon: Fingerprint,
        },
        {
          id: 'push',
          label: 'ส่งข้อมูลเข้า hosoffice',
          sublabel: 'Push to fingle_scan',
          icon: Send,
          badge: pendingPushCount > 0 ? pendingPushCount : undefined,
        },
        {
          id: 'personnel',
          label: 'ข้อมูลบุคลากร HR',
          sublabel: 'Personnel Directory',
          icon: Users,
        },
      ]
    },
    {
      key: 'settings',
      title: 'ตั้งค่าระบบ & เครื่องสแกน',
      items: [
        {
          id: 'shifts',
          label: 'ประเภทบุคลากร & เวลากะ',
          sublabel: 'Personnel Types & Shifts',
          icon: CalendarClock,
        },
        {
          id: 'scanners',
          label: 'จัดการเครื่องสแกน',
          sublabel: 'CMiF68S Scanners (Port 5005)',
          icon: Cpu,
        },
        {
          id: 'system',
          label: 'ระบบ & ประวัติ Log',
          sublabel: 'Database Logs & Audit',
          icon: FileText,
        },
      ]
    }
  ];

  const userSections: NavSection[] = [
    {
      key: 'personal',
      title: 'ข้อมูลส่วนบุคคล',
      items: [
        {
          id: 'my_attendance',
          label: 'เวลาทำงานของฉัน',
          sublabel: 'My Personal Attendance',
          icon: UserCheck,
        },
      ]
    },
    {
      key: 'overview',
      title: 'ภาพรวมโรงพยาบาล',
      items: [
        {
          id: 'dashboard',
          label: 'แดชบอร์ดภาพรวม',
          sublabel: 'Hospital Attendance',
          icon: LayoutDashboard,
        },
        {
          id: 'monthly_report',
          label: 'รายงานสรุปประจำเดือน HR',
          sublabel: 'Monthly HR Report',
          icon: FileSpreadsheet,
        },
      ]
    }
  ];

  const sectionsToRender = isAdmin ? adminSections : userSections;

  return (
    <aside 
      className={`bg-slate-900 text-slate-200 flex flex-col shrink-0 min-h-screen border-r border-slate-800/80 select-none transition-all duration-200 ease-in-out ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Brand Header */}
      <div className={`h-14 px-3 border-b border-slate-800/80 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white shadow-xs shrink-0">
            <Hospital className="w-4 h-4" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-white tracking-tight leading-tight truncate">
                ระบบลงเวลา รพ.สามชุก
              </h1>
              <p className="text-[10px] text-teal-400 font-sans truncate">
                Samchuk Attendance System
              </p>
            </div>
          )}
        </div>

        {/* Toggle Collapse Button */}
        <button
          onClick={onToggleCollapse}
          className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 cursor-pointer transition-colors"
          title={isCollapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav Menu */}
      <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
        {sectionsToRender.map((section) => {
          const isSectionCollapsed = collapsedSections[section.key];

          return (
            <div key={section.key} className="space-y-0.5">
              {/* Section Header */}
              {!isCollapsed && (
                <button
                  onClick={() => toggleSection(section.key)}
                  className="w-full flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
                >
                  <span className="truncate">{section.title}</span>
                  <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${isSectionCollapsed ? '-rotate-90' : ''}`} />
                </button>
              )}

              {/* Section Items */}
              {!isSectionCollapsed && (
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentTab === item.id;

                    return (
                      <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium cursor-pointer transition-colors text-left relative ${
                          isActive 
                            ? 'bg-teal-700/25 text-teal-200 font-semibold border-l-2 border-teal-400' 
                            : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                        }`}
                        title={isCollapsed ? item.label : undefined}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-400' : 'text-slate-400'}`} />
                        
                        {!isCollapsed && (
                          <div className="min-w-0 flex-1">
                            <div className="truncate leading-tight">{item.label}</div>
                            <div className="text-[10px] text-slate-400 truncate mt-0.5">{item.sublabel}</div>
                          </div>
                        )}

                        {item.badge !== undefined && (
                          !isCollapsed ? (
                            <span className="text-[10px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {item.badge}
                            </span>
                          ) : (
                            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                          )
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User Info & Switcher Footer */}
      <div className={`p-2.5 border-t border-slate-800/80 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} bg-slate-950/20`}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div 
            className="w-7 h-7 rounded-md bg-teal-800/60 text-teal-200 flex items-center justify-center text-xs font-semibold shrink-0 border border-teal-700/40"
            title={`${currentUser.fullname} (${currentUser.role})`}
          >
            {currentUser.fullname.charAt(0)}
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-slate-200 font-medium truncate">{currentUser.fullname}</span>
                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                  isAdmin ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700 text-slate-300'
                }`}>
                  {currentUser.role}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 truncate">{currentUser.department}</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
