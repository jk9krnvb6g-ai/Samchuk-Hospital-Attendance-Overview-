import React from 'react';
import { RefreshCw, Clock, PanelLeftClose, PanelLeft } from 'lucide-react';
import { User, Scanner } from '../types/attendance';

interface HeaderProps {
  title: string;
  subtitle: string;
  currentUser: User;
  scanners: Scanner[];
  pendingCount: number;
  onSyncClick: () => void;
  isSyncing: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  currentUser,
  scanners,
  pendingCount,
  onSyncClick,
  isSyncing,
  isCollapsed,
  onToggleCollapse,
}) => {
  const onlineCount = scanners.filter(s => s.status === 'ONLINE').length;
  const isAdmin = currentUser.role === 'ADMIN';

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
      {/* Title & Toggle Button */}
      <div className="flex items-center gap-3 min-w-0">
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer transition-colors"
            title={isCollapsed ? 'ขยายแถบเมนู (Expand)' : 'ย่อแถบเมนู (Collapse)'}
          >
            {isCollapsed ? <PanelLeft className="w-5 h-5 text-teal-700" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
        )}
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-800 leading-tight truncate">
            {title}
          </h2>
          <p className="text-xs text-slate-500 truncate">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Status Indicators & Action Bar */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Network & API Gateway Indicator */}
        <div className="hidden lg:flex items-center gap-2 text-xs bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-200" title="Web: https://10.2.0.13:3001/Sam_Att/ | API: https://10.2.0.13:3002">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-slate-500">API:</span>
            <span className="font-bold text-teal-700">:3002</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1 font-mono text-[11px]">
            <span className="text-slate-500">Web:</span>
            <span className="font-semibold text-slate-700">:3001</span>
          </div>
        </div>

        {/* Scanners Status Indicator */}
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">
          <span className="text-slate-500">เครื่องสแกน CMiF68S:</span>
          <span className="font-semibold text-slate-700">
            {onlineCount}/{scanners.length} ออนไลน์
          </span>
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
        </div>

        {/* Pending Records in Staging */}
        {isAdmin && (
          <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-amber-800 font-medium">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>รอส่งเข้า hosoffice:</span>
            <span className="font-bold tabular-nums font-mono text-amber-900">{pendingCount}</span>
            <span className="text-[11px] text-amber-600 font-normal">รายการ</span>
          </div>
        )}

        {/* Sync From Scanner button (ADMIN only) */}
        {isAdmin && (
          <button
            onClick={onSyncClick}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-md shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            title="จำลองการเรียก FK_LoadGeneralLogData ดึง Log จากเครื่องสแกน 1-3 เข้าสู่ Staging DB"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'กำลังดึงข้อมูล...' : 'ดึงข้อมูลจากสแกนเนอร์'}</span>
          </button>
        )}
      </div>
    </header>
  );
};
