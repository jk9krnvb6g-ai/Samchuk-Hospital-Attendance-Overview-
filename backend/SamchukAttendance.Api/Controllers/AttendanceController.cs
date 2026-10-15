using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SamchukAttendance.Api.Services;

namespace SamchukAttendance.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AttendanceController : ControllerBase
    {
        private readonly ILogger<AttendanceController> _logger;
        private readonly AttendanceCalculator _attendanceCalculator;

        public AttendanceController(ILogger<AttendanceController> logger, AttendanceCalculator attendanceCalculator)
        {
            _logger = logger;
            _attendanceCalculator = attendanceCalculator;
        }

        /// <summary>
        /// สั่งคำนวณเวลาปฏิบัติงานประจำวันทันทีแบบ Manual หรือเรียกซ้ำ
        /// </summary>
        [HttpPost("calculate")]
        public async Task<IActionResult> CalculateAttendance([FromQuery] string? date, [FromQuery] int? personId)
        {
            DateTime targetDate = string.IsNullOrEmpty(date) ? DateTime.Today : DateTime.Parse(date);
            int count = await _attendanceCalculator.CalculateDailyAttendanceAsync(targetDate, personId);
            return Ok(new
            {
                success = true,
                message = $"คำนวณเวลาทำงานประจำวันที่ {targetDate:yyyy-MM-dd} สำเร็จ",
                processedCount = count,
                calculatedAt = DateTime.Now
            });
        }
    }
}
