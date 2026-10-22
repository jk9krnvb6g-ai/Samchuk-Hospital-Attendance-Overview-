import React, { useState, useEffect } from 'react';
import { AlertTriangle, ExternalLink, ArrowRight, X, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { apiClient } from '../services/apiClient';

export const MixedContentBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState<boolean>(false);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [httpUrl, setHttpUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isHttps = window.location.protocol === 'https:';
      const isBlocked = apiClient.isMixedContentBlocked();
      if (isHttps && isBlocked) {
        setShowBanner(true);
        setHttpUrl(window.location.href.replace(/^https:/i, 'http:'));
      }
    }
  }, []);

  if (!showBanner) return null;

  const handleSwitchToHttp = () => {
    if (typeof window !== 'undefined' && httpUrl) {
      window.location.href = httpUrl;
    }
  };

  return (
    <>
      {/* Top Warning Alert Banner */}
      <div className="bg-amber-500 text-slate-900 border-b border-amber-600 px-4 py-2.5 shadow-md shrink-0 sticky top-0 z-50 animate-slide-down">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2.5 font-medium">
            <span className="p-1 bg-amber-600 text-white rounded-md shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </span>
            <span>
              <strong>คำเตือนบราวเซอร์บล็อกข้อมูล (Mixed Content):</strong> คุณกำลังเข้าเว็บด้วย{' '}
              <code className="bg-amber-600/30 px-1.5 py-0.5 rounded font-mono font-bold text-amber-950">https://</code>{' '}
              แต่ Backend API Gateway (พอร์ต 3002) ทำงานด้วย HTTP ทำให้บราวเซอร์บล็อกการโหลดข้อมูล
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSwitchToHttp}
              className="px-3 py-1 bg-slate-900 text-white font-semibold rounded shadow hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer text-xs"
            >
              <span>เปลี่ยนไปใช้ HTTP ทันที</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowDetailModal(true)}
              className="px-2.5 py-1 bg-amber-600/30 text-slate-950 hover:bg-amber-600/50 rounded font-medium transition-colors cursor-pointer text-xs"
            >
              วิธีแก้ไข / ทำความเข้าใจ
            </button>
            <button
              onClick={() => setShowBanner(false)}
              className="p-1 text-slate-800 hover:text-slate-950 rounded hover:bg-amber-600/30 cursor-pointer"
              title="ซ่อนการแจ้งเตือนนี้"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Explanation Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden text-slate-800">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base">สาเหตุของข้อผิดพลาด "Mixed Content" และวิธีแก้ไข</h3>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs sm:text-sm">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-amber-900 space-y-1">
                <p className="font-bold">ทำไมบราวเซอร์ถึงขึ้นข้อความนี้?</p>
                <p className="text-xs text-amber-800 leading-relaxed">
                  เนื่องจากมาตรฐานความปลอดภัยสากลของ Google Chrome และ Microsoft Edge กำหนดไว้ว่า:
                  หากหน้าเว็บหลักถูกเปิดด้วย <strong>HTTPS</strong> (เช่น <code>https://10.2.0.13:3001/Sam_Att/</code>)
                  บราวเซอร์จะ<strong>บล็อกคำสั่งดึงข้อมูล (API AJAX/fetch)</strong> ที่ยิงไปยัง <strong>HTTP</strong> (เช่น <code>http://10.2.0.13:3002/...</code>) โดยอัตโนมัติ เพื่อป้องกันการส่งข้อมูลที่ไม่เข้ารหัส
                </p>
              </div>

              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  วิธีแก้ไขที่ 1: เข้าใช้งานผ่าน HTTP (แนะนำสำหรับระบบเครือข่ายภายใน รพ.)
                </h4>
                <p className="text-slate-600 text-xs leading-relaxed">
                  เปลี่ยน URL ในช่องกรอกที่อยู่เว็บ (Address Bar) ของบราวเซอร์ โดยตัดตัว <code className="font-bold text-rose-600">s</code> ออก ให้เป็น:
                </p>
                <div className="bg-slate-100 p-2.5 rounded font-mono text-xs text-teal-800 font-bold flex items-center justify-between">
                  <span>{httpUrl || 'http://10.2.0.13:3001/Sam_Att/'}</span>
                  <button
                    onClick={handleSwitchToHttp}
                    className="px-2.5 py-1 bg-teal-600 text-white rounded text-xs hover:bg-teal-700 cursor-pointer"
                  >
                    เปิดหน้านี้ทันที
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-4 space-y-2">
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-600" />
                  วิธีแก้ไขที่ 2: ตั้งค่า Reverse Proxy บน IIS พอร์ต 3001 (หากต้องการใช้ HTTPS ต่อไป)
                </h4>
                <p className="text-slate-600 text-xs leading-relaxed">
                  หากต้องการให้ทุกระบบรันผ่าน HTTPS ต่อเนื่องโดยไม่มีคำเตือน ให้เปิดฟังก์ชัน <strong>URL Rewrite + ARR (Application Request Routing)</strong> ใน IIS บนเครื่องเซิร์ฟเวอร์ โดยส่งต่อ URL <code>/api/*</code> ไปยัง <code>http://127.0.0.1:3002/api/*</code> (ไฟล์ <code>web.config</code> ในโฟลเดอร์โครงการได้เตรียมการตั้งค่านี้ไว้เรียบร้อยแล้ว)
                </p>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 border border-slate-300 rounded text-slate-700 hover:bg-slate-100 font-medium text-xs cursor-pointer"
              >
                ปิดหน้าต่างนี้
              </button>
              <button
                onClick={handleSwitchToHttp}
                className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 font-bold text-xs cursor-pointer flex items-center gap-1.5"
              >
                <span>สลับไปใช้ HTTP ทันที</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
