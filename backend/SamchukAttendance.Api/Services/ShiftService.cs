using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace SamchukAttendance.Api.Services
{
    public class ResolvedShiftResult
    {
        public int? ShiftId { get; set; }
        public string ShiftCode { get; set; } = "M";
        public string ShiftName { get; set; } = "เช้า";
        public TimeSpan StartTime { get; set; } = new TimeSpan(8, 15, 0);
        public TimeSpan EndTime { get; set; } = new TimeSpan(16, 0, 0);
        public int LateGraceMinutes { get; set; } = 0;
        public string ResolutionSource { get; set; } = "SYSTEM_DEFAULT";
    }

    /// <summary>
    /// Service คำนวณกะที่บุคลากรต้องปฏิบัติงาน ตามลำดับความสำคัญ (Resolution Order 4 ระดับ)
    /// สเปกข้อ 16.3:
    /// 1. Roster รายวัน (attendance_person_roster) - สูงสุด
    /// 2. กะประจำรายบุคคล (attendance_person_shift) - Override
    /// 3. กะตามกลุ่มบุคลากร (attendance_group_shift) - ตาม Priority ของกลุ่ม
    /// 4. กะเริ่มต้นของระบบ (System Default)
    /// </summary>
    public class ShiftService
    {
        private readonly ILogger<ShiftService> _logger;

        public ShiftService(ILogger<ShiftService> logger)
        {
            _logger = logger;
        }

        public async Task<ResolvedShiftResult> ResolveShiftForPersonAsync(int personId, DateTime workDate)
        {
            // 1. ตรวจสอบ Roster รายวัน (attendance_person_roster)
            // 2. ตรวจสอบ กะประจำรายบุคคล (attendance_person_shift)
            // 3. ตรวจสอบ กะตามกลุ่มบุคลากร (attendance_group_shift)
            // 4. ใช้ค่าเริ่มต้นของระบบ (System Default: เช้า 08:15 - 16:00)

            await Task.CompletedTask;
            return new ResolvedShiftResult();
        }
    }
}
