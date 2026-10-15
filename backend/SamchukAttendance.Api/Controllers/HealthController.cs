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
                version = "2.2.3",
                port = 3002,
                endpoint = "https://10.2.0.13:3002",
                frontendUrl = "https://10.2.0.13:3001/Sam-attendance/",
                architecture = Environment.Is64BitProcess ? "x64 (Warning: FK623Attend requires x86)" : "x86 (OK)",
                thaiSupport = "100% utf8mb4",
                serverTime = DateTime.Now
            });
        }
    }
}
