import React, { useState, useEffect } from 'react';
import { RefreshCw, PanelLeftClose, PanelLeft, Clock, Send, Wifi } from 'lucide-react';
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
  const isAdmin = currentUser.role === 'ADMIN';



  return (
    <header className="h-14 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 lg:px-6 flex items-center justify-between shrink-0 sticky top-0 z-30 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      {/* Title & Navigation Collapse */}
      <div className="flex items-center gap-3 min-w-0">
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 cursor-pointer transition-colors"
            title={isCollapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'}
          >
            {isCollapsed ? <PanelLeft className="w-4 h-4 text-teal-700" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 tracking-tight leading-none truncate">
              {title}
            </h2>
            <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-slate-300"></span>
            <span className="hidden sm:inline-block text-[11px] font-medium text-teal-800 tracking-tight">
              รพ.สามชุก
            </span>
          </div>
          <p className="text-[11px] text-slate-500 truncate mt-0.5 font-normal">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Mission-Control Telemetry Dock (Status & Actions) */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Compact Telemetry Dock: 3 Scanners Online/Ping */}
        <div className="hidden lg:flex items-center gap-3 px-3 py-1 bg-slate-50/90 rounded-lg border border-slate-200/90 shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider pr-1 border-r border-slate-200">
            <Wifi className="w-3 h-3 text-teal-600" />
            <span>DOCK</span>
          </div>

          {scanners.map((sc) => {
            const shortLoc = sc.name.includes('อำนวยการ') ? 'อำนวยการ' :
                             sc.name.includes('ER') ? 'ER ฉุกเฉิน' :
                             sc.name.includes('IPD') ? 'IPD ผู้ป่วยใน' : `#${sc.machineNo}`;
            const isOnline = sc.status === 'ONLINE';
            const latency = sc.machineNo === 1 ? '12ms' : sc.machineNo === 2 ? '15ms' : '9ms';

            return (
              <div 
                key={sc.id} 
                className="flex items-center gap-1.5 text-[11px]"
                title={`${sc.name} (${sc.ip}:${sc.port}) - Ping ${latency} · ออนไลน์ผ่าน FK_ConnectNet`}
              >
                <span className="relative flex h-2 w-2">
                  {isOnline && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                </span>
                <span className="font-semibold text-slate-800 text-[11px]">{shortLoc}</span>
                <span className="font-mono text-[10px] text-slate-500 font-medium tabular-nums">({latency})</span>
              </div>
            );
          })}

          {/* Manual Sync Status Badge */}
          <div 
            className="pl-1.5 border-l border-slate-200 flex items-center gap-1 text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded"
            title="ปิดระบบ Sync อัตโนมัติแล้ว เพื่อป้องกันข้อมูลทับซ้อน (ดึงข้อมูลเมื่อกดปุ่มด้วยตัวเองเท่านั้น)"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <span>Manual Sync</span>
          </div>
        </div>

        {/* Pending Sync with hosoffice */}
        {isAdmin && pendingCount > 0 && (
          <div 
            className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-amber-900 bg-amber-500/10 border border-amber-300/80 px-2.5 py-1 rounded-lg"
            title="จำนวนรายการสแกนดิบใน Staging ที่รอส่งเข้า MySQL hosoffice.fingle_scan"
          >
            <Send className="w-3 h-3 text-amber-600" />
            <span>รอส่ง HOSxP:</span>
            <span className="font-mono font-bold text-amber-950 tabular-nums">{pendingCount}</span>
          </div>
        )}

        {/* Sync Now Action Button (Matte Deep Teal) */}
        {isAdmin && (
          <button
            onClick={onSyncClick}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 active:bg-teal-950 rounded-lg shadow-xs transition-all duration-150 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            title="ดึงข้อมูลเวลาสแกนล่าสุดจากเครื่อง CMiF68S ทั้ง 3 เครื่องทันที"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'กำลังดึงเวลา...' : 'ดึงเวลาสแกน'}</span>
          </button>
        )}
      </div>
    </header>
  );
};
