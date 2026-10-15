using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using SamchukAttendance.Api.Scanner.HIP;

namespace SamchukAttendance.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ScannersController : ControllerBase
    {
        private readonly IConfiguration _config;

        public ScannersController(IConfiguration config)
        {
            _config = config;
        }

        public class TestConnectionRequest
        {
            public int MachineNo { get; set; } = 1;
            public string IpAddress { get; set; } = "10.1.0.101";
            public int Port { get; set; } = 5005;
            public int TimeoutMs { get; set; } = 3000;
        }

        /// <summary>
        /// ทดสอบเชื่อมต่อ Socket ไปยังเครื่องสแกน HIP CMiF68S
        /// </summary>
        [HttpPost("test-connection")]
        public IActionResult TestConnection([FromBody] TestConnectionRequest req)
        {
            try
            {
                // เรียกผ่าน FK_ConnectNet (x86 P/Invoke)
                int handle = ScannerReader.FK_ConnectNet(
                    req.MachineNo,
                    req.IpAddress,
                    req.Port,
                    req.TimeoutMs,
                    1, // Protocol Type
                    0, // Net Password
                    0  // License
                );

                if (handle > 0)
                {
                    ScannerReader.FK_DisConnect(handle);
                    return Ok(new
                    {
                        success = true,
                        ipAddress = req.IpAddress,
                        port = req.Port,
                        message = "เชื่อมต่อเครื่องสแกนสำเร็จ (Socket Port 5005 OK)"
                    });
                }

                return StatusCode(502, new
                {
                    success = false,
                    ipAddress = req.IpAddress,
                    port = req.Port,
                    message = $"ไม่สามารถเชื่อมต่อเครื่องสแกนได้ (Error Code: {handle}) กรุณาตรวจสอบสาย LAN หรือการตั้งค่า IP"
                });
            }
            catch (DllNotFoundException ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "ไม่พบไฟล์ FK623Attend.dll กรุณาวางไฟล์ DLL ไว้ในโฟลเดอร์เดียวกันกับตัวโปรแกรม",
                    error = ex.Message
                });
            }
            catch (BadImageFormatException ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "สถาปัตยกรรม Process ไม่ตรงกับ DLL (ต้องรันในโหมด x86 32-bit เท่านั้น)",
                    error = ex.Message
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "เกิดข้อผิดพลาดในการทดสอบเชื่อมต่อ",
                    error = ex.Message
                });
            }
        }
    }
}
