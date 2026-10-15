using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SamchukAttendance.Api.Services;

namespace SamchukAttendance.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ShiftsController : ControllerBase
    {
        private readonly ILogger<ShiftsController> _logger;
        private readonly ShiftService _shiftService;

        public ShiftsController(ILogger<ShiftsController> logger, ShiftService shiftService)
        {
            _logger = logger;
            _shiftService = shiftService;
        }

        /// <summary>
        /// ตรวจสอบกะที่ได้รับมอบหมายของบุคลากรตามลำดับ 4 ลำดับ (Roster -> Override -> Group -> System)
        /// </summary>
        [HttpGet("resolve")]
        public async Task<IActionResult> ResolveShift([FromQuery] int personId, [FromQuery] string? date)
        {
            DateTime targetDate = string.IsNullOrEmpty(date) ? DateTime.Today : DateTime.Parse(date);
            var shift = await _shiftService.ResolveShiftForPersonAsync(personId, targetDate);
            return Ok(shift);
        }
    }
}
