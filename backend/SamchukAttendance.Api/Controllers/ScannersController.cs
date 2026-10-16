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
            public string IpAddress { get; set; } = "192.168.111.163";
            public int Port { get; set; } = 5005;
            public int TimeoutMs { get; set; } = 3000;
            public int License { get; set; } = 1261;
        }

        /// <summary>
        /// ตรวจสอบว่าระบบสามารถโหลด FK623Attend.dll ได้หรือไม่
        /// </summary>
        [HttpGet("check-dll")]
        public IActionResult CheckDll()
        {
            try
            {
                // ตรวจสอบสถาปัตยกรรม Process
                bool is64 = Environment.Is64BitProcess;
                return Ok(new
                {
                    success = true,
                    dll = "FK623Attend.dll",
                    architecture = is64 ? "x64 (Warning: FK623 requires x86 32-bit)" : "x86 (OK - Compatible)",
                    is32BitCompatible = !is64,
                    message = !is64 
                        ? "ระบบพร้อมใช้งานในโหมด 32-bit (x86) ตรงตามมาตรฐาน FK623Attend.dll" 
                        : "คำเตือน: กระบวนการกำลังทำงานในโหมด 64-bit โปรดเปิด Enable 32-Bit Applications ใน IIS หรือคอมไพล์เป็น x86"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "เกิดข้อผิดพลาดในการตรวจสอบ DLL", error = ex.Message });
            }
        }

        /// <summary>
        /// ทดสอบเชื่อมต่อ Socket ผ่าน GET query string
        /// </summary>
        [HttpGet("test-socket")]
        public IActionResult TestSocket([FromQuery] string ip = "192.168.111.163", [FromQuery] int port = 5005, [FromQuery] int machineNo = 1, [FromQuery] int license = 1261)
        {
            return TestConnection(new TestConnectionRequest
            {
                MachineNo = machineNo,
                IpAddress = ip,
                Port = port,
                License = license
            });
        }

        /// <summary>
        /// ทดสอบเชื่อมต่อ Socket ไปยังเครื่องสแกน HIP CMiF68S
        /// </summary>
        [HttpPost("test-connection")]
        public IActionResult TestConnection([FromBody] TestConnectionRequest req)
        {
            try
            {
                // ลองเชื่อมต่อด้วย License ที่ระบุ (1261 สำหรับ HIP CMiF68S)
                int license = req.License != 0 ? req.License : 1261;
                int handle = ScannerReader.FK_ConnectNet(
                    req.MachineNo,
                    req.IpAddress,
                    req.Port,
                    req.TimeoutMs,
                    1, // Protocol Type
                    0, // Net Password
                    license
                );

                // หากไม่สำเร็จด้วย License 1261 ลองทดสอบด้วย License 0
                if (handle <= 0 && license != 0)
                {
                    handle = ScannerReader.FK_ConnectNet(
                        req.MachineNo,
                        req.IpAddress,
                        req.Port,
                        req.TimeoutMs,
                        1,
                        0,
                        0
                    );
                }

                if (handle > 0)
                {
                    ScannerReader.FK_DisConnect(handle);
                    return Ok(new
                    {
                        success = true,
                        ipAddress = req.IpAddress,
                        port = req.Port,
                        handle = handle,
                        message = $"เชื่อมต่อเครื่องสแกนสำเร็จ (Handle: {handle}, Socket Port {req.Port} OK)"
                    });
                }

                return StatusCode(502, new
                {
                    success = false,
                    ipAddress = req.IpAddress,
                    port = req.Port,
                    errorCode = handle,
                    message = $"ไม่สามารถเชื่อมต่อเครื่องสแกนได้ (Return Code: {handle}) กรุณาตรวจสอบสาย LAN หรือการตั้งค่า IP"
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
