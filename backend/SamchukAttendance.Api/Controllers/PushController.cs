using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SamchukAttendance.Api.Services;

namespace SamchukAttendance.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PushController : ControllerBase
    {
        private readonly ILogger<PushController> _logger;
        private readonly PushService _pushService;

        public PushController(ILogger<PushController> logger, PushService pushService)
        {
            _logger = logger;
            _pushService = pushService;
        }

        public class PushRequestDto
        {
            public string WorkDate { get; set; } = string.Empty;
            public int? PersonId { get; set; }
            public string PerformedBy { get; set; } = "ADMIN";
        }

        /// <summary>
        /// สั่งส่งข้อมูลเวลาเข้า hosoffice.fingle_scan (เฉพาะ ADMIN เท่านั้น ตามสเปก v2)
        /// </summary>
        [HttpPost("hosoffice")]
        public async Task<IActionResult> PushToHosOffice([FromBody] PushRequestDto request)
        {
            if (string.IsNullOrWhiteSpace(request.WorkDate))
            {
                return BadRequest(new { success = false, message = "กรุณาระบุ workDate (YYYY-MM-DD)" });
            }

            DateTime date = DateTime.Parse(request.WorkDate);
            var result = await _pushService.PushAttendanceToHosOfficeAsync(date, request.PersonId, request.PerformedBy);
            
            return Ok(result);
        }
    }
}
