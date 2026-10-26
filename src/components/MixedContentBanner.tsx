import React, { useState, useEffect } from 'react';
import { AlertTriangle, ShieldCheck, ArrowRight, X, ShieldAlert, CheckCircle2, Lock, Server } from 'lucide-react';
import { apiClient } from '../services/apiClient';

export const MixedContentBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState<boolean>(false);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isHttps = window.location.protocol === 'https:';
      const isBlocked = apiClient.isMixedContentBlocked();
      if (isHttps && isBlocked) {
        setShowBanner(true);
      } else {
        setShowBanner(false);
      }
    }
  }, []);

  if (!showBanner) return null;

  const handleSwitchToHttpsProxy = () => {
    apiClient.switchToHttpsProxy();
    setShowBanner(false);
    window.location.reload();
  };

  return (
    <>
      {/* Top Notification Banner */}
      <div className="bg-sky-600 text-white border-b border-sky-700 px-4 py-2.5 shadow-md shrink-0 sticky top-0 z-50 animate-slide-down">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2.5 font-medium">
            <span className="p-1 bg-white/20 text-white rounded-md shrink-0">
              <Lock className="w-4 h-4" />
            </span>
            <span>
              <strong>โหมดความปลอดภัย HTTPS 100%:</strong> ตรวจพบการตั้งค่า API เป็น HTTP เดิม (พอร์ต 3002) แนะนำให้สลับมาใช้ HTTPS ผ่าน IIS Reverse Proxy (พอร์ต 3001) เพื่อให้โหลดข้อมูลสแกนนิ้วได้ราบรื่น
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSwitchToHttpsProxy}
              className="px-3 py-1.5 bg-white text-sky-800 hover:bg-sky-50 font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer text-xs"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>เปิดใช้งาน HTTPS พอร์ต 3001 ทันที</span>
            </button>
            <button
              onClick={() => setShowDetailModal(true)}
              className="px-2.5 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg font-semibold transition-colors cursor-pointer text-xs"
            >
              ดูวิธีตั้งค่า IIS
            </button>
            <button
              onClick={() => setShowBanner(false)}
              className="p-1 text-sky-200 hover:text-white rounded hover:bg-sky-700/50 cursor-pointer"
              title="ปิดการแจ้งเตือน"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Explanation Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden text-slate-800 max-h-[90vh] flex flex-col">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-sky-500/20 text-sky-400 rounded-lg border border-sky-400/30">
                  <Lock className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">แนวทางใช้งานระบบผ่าน HTTPS 100% (ไม่มี HTTP)</h3>
                  <p className="text-xs text-slate-400">วิธีเชื่อมต่อ API ผ่าน HTTPS เดียวกันกับหน้าเว็บ เพื่อความปลอดภัยสูงสุด</p>
                </div>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs sm:text-sm overflow-y-auto">
              <div className="bg-sky-50 border border-sky-300 rounded-xl p-4 text-sky-950 space-y-2">
                <p className="font-bold text-sky-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>ทำไมต้องใช้งาน API ผ่าน HTTPS เดียวกันกับหน้าเว็บ?</span>
                </p>
                <div className="text-xs text-sky-900/90 leading-relaxed space-y-1">
                  <p>
                    ตามนโยบายความปลอดภัย เมื่อผู้ใช้เปิดหน้าเว็บผ่าน <strong><code>https://10.2.0.13:3001/Sam_Att/</code></strong> บราวเซอร์จะบังคับให้การดึงข้อมูลทั้งหมด (API) ต้องส่งผ่านโปรโตคอล <strong>HTTPS เท่านั้น</strong>
                  </p>
                  <p>
                    • ข้อมูลในฐานข้อมูล MySQL ถูกจัดเก็บครบถ้วนตามปกติ
                  </p>
                  <p>
                    • เพียงปรับให้ API เรียกผ่านพอร์ต 3001 (Same-Origin HTTPS) บราวเซอร์จะเปิดรับข้อมูลทันที 100% โดยไม่ต้องปรับลดความปลอดภัย
                  </p>
                </div>
              </div>

              {/* Solution 1: Switch to Same-Origin Reverse Proxy */}
              <div className="border border-emerald-300 bg-emerald-50/50 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-emerald-950 flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>วิธีที่ 1: สลับ Endpoint เป็น HTTPS พอร์ต 3001 (แนะนำที่สุด)</span>
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-200 text-emerald-800">
                    HTTPS 100%
                  </span>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed">
                  ระบบได้เตรียมไฟล์ <code className="font-bold text-slate-800 bg-slate-200 px-1 py-0.5 rounded">web.config</code> เพื่อทำ Reverse Proxy บน IIS พอร์ต 3001 ให้ส่งต่อไปยัง Node API ภายในเครื่องอัตโนมัติ คลิกปุ่มด้านล่างเพื่อสลับได้ทันที:
                </p>
                <div className="bg-white border border-emerald-300 p-3 rounded-lg flex items-center justify-between gap-2">
                  <div className="font-mono text-xs text-emerald-900 font-bold">
                    https://10.2.0.13:3001/api/Sam_Att
                  </div>
                  <button
                    onClick={handleSwitchToHttpsProxy}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-2xs whitespace-nowrap flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>ใช้ HTTPS ทันที</span>
                  </button>
                </div>
              </div>

              {/* Solution 2: IIS ARR Server Configuration */}
              <div className="border border-slate-300 bg-slate-50 rounded-xl p-4 space-y-2.5">
                <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                  <Server className="w-4 h-4 text-slate-600" />
                  <span>การเปิดใช้งาน IIS Application Request Routing (ARR) บน Server (สำหรับ Admin)</span>
                </h4>
                <div className="text-slate-600 text-xs leading-relaxed space-y-1.5">
                  <p>
                    1. เปิดโปรแกรม <strong>IIS Manager</strong> บนเครื่องเซิร์ฟเวอร์ 10.2.0.13
                  </p>
                  <p>
                    2. ดับเบิลคลิกที่ไอคอน <strong>Application Request Routing Cache</strong> ที่หน้าหลักของ Server
                  </p>
                  <p>
                    3. เมนูด้านขวามือคลิก <strong>Server Proxy Settings...</strong>
                  </p>
                  <p>
                    4. ติ๊กเครื่องหมายถูกที่ช่อง <strong>"Enable proxy"</strong> แล้วกด <strong>Apply</strong> ที่มุมขวาบน
                  </p>
                  <p className="text-emerald-700 font-medium">
                    เพียงเท่านี้ IIS จะทำหน้าที่รับ HTTPS พอร์ต 3001 และ Forward API ไปยัง Node.js ภายในเครื่องอย่างปลอดภัย 100%
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end gap-2 shrink-0">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 font-semibold text-xs cursor-pointer"
              >
                เข้าใจแล้ว / ปิดหน้าต่างนี้
              </button>
              <button
                onClick={handleSwitchToHttpsProxy}
                className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-xl font-bold text-xs cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>เปิดใช้งาน HTTPS พอร์ต 3001</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
