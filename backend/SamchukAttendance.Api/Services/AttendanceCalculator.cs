using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace SamchukAttendance.Api.Services
{
    /// <summary>
    /// Service สำหรับประมวลผลเวลาปฏิบัติงาน (Attendance Calculation)
    /// ตามแนวทางที่ 1: ประมวลผลทันทีเมื่อ ScannerBackgroundService ดึงข้อมูลสแกนเข้ามา
    /// </summary>
    public class AttendanceCalculator
    {
        private readonly ILogger<AttendanceCalculator> _logger;
        private readonly ShiftService _shiftService;

        public AttendanceCalculator(ILogger<AttendanceCalculator> logger, ShiftService shiftService)
        {
            _logger = logger;
            _shiftService = shiftService;
        }

        /// <summary>
        /// ประมวลผลเวลาปฏิบัติงานประจำวันทันทีแบบ Real-time
        /// </summary>
        /// <param name="workDate">วันที่ประมวลผล (ค.ศ. รูปแบบ YYYY-MM-DD)</param>
        /// <param name="personId">ระบุรหัสบุคคล หรือ null เพื่อประมวลผลทุกคน</param>
        public async Task<int> CalculateDailyAttendanceAsync(DateTime workDate, int? personId = null)
        {
            string dateStr = workDate.ToString("yyyy-MM-dd");
            _logger.LogInformation("⚡ [Auto-Calculate] กำลังประมวลผลเวลาทำงานประจำวันที่ {Date}", dateStr);

            // 1. ดึงข้อมูลบุคลากรเป้าหมาย
            // 2. หา "กะที่ต้องทำ" ของแต่ละคนตามลำดับความสำคัญ 4 ลำดับ (ShiftService.ResolveShift)
            // 3. ดึง Raw Scans ของบุคคลนั้นในวันดังกล่าวจากตาราง attendance_raw_scan
            // 4. สแกนแรก = IN, สแกนสุดท้าย = OUT
            // 5. คำนวณ ตรงเวลา / สาย / ออกก่อน / OT และสแกนซ้ำ (<= duplicate_scan_min)
            // 6. บันทึกลงตาราง attendance_daily_result (Upsert)

            int processedCount = 0;
            await Task.CompletedTask; // Placeholder สำหรับ Entity Framework / Dapper database call

            _logger.LogInformation("✓ [Auto-Calculate] ประมวลผลเวลาสำเร็จสำหรับ {Date}", dateStr);
            return processedCount;
        }
    }
}
