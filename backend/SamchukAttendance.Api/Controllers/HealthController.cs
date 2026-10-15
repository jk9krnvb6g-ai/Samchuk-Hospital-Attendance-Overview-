using System;
using Microsoft.AspNetCore.Mvc;

namespace SamchukAttendance.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class HealthController : ControllerBase
    {
        [HttpGet]
        public IActionResult Get()
        {
            return Ok(new
            {
                status = "Online",
                service = "Samchuk Attendance & Biometric API (v2)",
                version = "2.2.1",
                architecture = Environment.Is64BitProcess ? "x64 (Warning: FK623Attend requires x86)" : "x86 (OK)",
                thaiSupport = "100% utf8mb4",
                serverTime = DateTime.Now
            });
        }
    }
}
