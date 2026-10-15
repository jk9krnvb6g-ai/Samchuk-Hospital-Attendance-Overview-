using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SamchukAttendance.Api.Scanner.HIP;
using SamchukAttendance.Api.Services;

namespace SamchukAttendance.Api.BackgroundServices
{
    /// <summary>
    /// Background Service ทำงานอัตโนมัติทุก 1 นาที
    /// ทำหน้าที่: ดึงข้อมูลจากเครื่องสแกน 1-3 -> บันทึกลง Attendance DB (Staging) -> ⚡ ประมวลผลเวลาทันที (Option 1)
    /// **ข้อห้ามสำคัญ:** ห้ามเขียนลง hosoffice.fingle_scan ใน Service นี้เด็ดขาด
    /// </summary>
    public class ScannerBackgroundService : BackgroundService
    {
        private readonly ILogger<ScannerBackgroundService> _logger;
        private readonly IServiceProvider _serviceProvider;
        private readonly TimeSpan _syncInterval = TimeSpan.FromMinutes(1);

        public ScannerBackgroundService(
            ILogger<ScannerBackgroundService> logger, 
            IServiceProvider serviceProvider)
        {
            _logger = logger;
            _serviceProvider = serviceProvider;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("🚀 ScannerBackgroundService เริ่มทำงาน (ความถี่ทุก 1 นาที)");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using (var scope = _serviceProvider.CreateScope())
                    {
                        var attendanceCalc = scope.ServiceProvider.GetRequiredService<AttendanceCalculator>();
                        
                        // 1. ดึง Log จาก Scanner 1, 2, 3 ผ่าน Native DLL (FK623Attend.dll)
                        int newScansCount = await SyncAllScannersToStagingAsync();

                        // 2. ⚡ [แนวทางที่ 1] หากมีข้อมูลสแกนใหม่ หรือถึงรอบ ให้ประมวลผลเวลาทันทีอัตโนมัติ
                        if (newScansCount > 0)
                        {
                            _logger.LogInformation("พบข้อมูลสแกนใหม่ {Count} รายการ -> เรียกประมวลผลเวลาทันที", newScansCount);
                            await attendanceCalc.CalculateDailyAttendanceAsync(DateTime.Today);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "เกิดข้อผิดพลาดในรอบการ Sync เครื่องสแกน");
                }

                await Task.Delay(_syncInterval, stoppingToken);
            }
        }

        private async Task<int> SyncAllScannersToStagingAsync()
        {
            // ดึงข้อมูลจาก Scanner 1 (192.168.111.163), Scanner 2 (.164), Scanner 3 (.165)
            // ตรวจสอบ Duplicate ด้วย (fingle_id, scan_date_time)
            // ค้นหา HR Snapshot จาก hosoffice.hr_person
            // บันทึกลงตาราง attendance_raw_scan (push_status = 'PENDING')
            await Task.CompletedTask;
            return 0;
        }
    }
}
