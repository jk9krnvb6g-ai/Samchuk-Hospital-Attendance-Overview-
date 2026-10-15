using System.Runtime.InteropServices;

namespace SamchukAttendance.Api.Scanner.HIP
{
    /// <summary>
    /// P/Invoke Wrapper สำหรับ HIP Native DLL (FK623Attend.dll)
    /// สเปกข้อ 5: การสื่อสารกับเครื่องสแกน CMiF68S ผ่าน TCP 5005
    /// </summary>
    public static class ScannerReader
    {
        private const string DllFileName = "FK623Attend.dll";

        [DllImport(DllFileName, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.Winapi)]
        public static extern int FK_ConnectNet(
            int anMachineNo,
            string astrIpAddress,
            int anNetPort,
            int anTimeOut,
            int anProtocolType,
            int anNetPassword,
            int anLicense);

        [DllImport(DllFileName, CallingConvention = CallingConvention.Winapi)]
        public static extern int FK_DisConnect(int anHandle);

        [DllImport(DllFileName, CallingConvention = CallingConvention.Winapi)]
        public static extern int FK_LoadGeneralLogData(int anHandle, int anReadMark);

        // Numeric Getter สำหรับ CMiF68S (String ID Support = 0 ตามสเปกข้อ 6)
        [DllImport(DllFileName, CallingConvention = CallingConvention.Winapi)]
        public static extern int FK_GetGeneralLogData(
            int anHandle,
            ref int anEnrollNumber,
            ref int anVerifyMode,
            ref int anInOutMode,
            ref int anDateTimeYear,
            ref int anDateTimeMonth,
            ref int anDateTimeDay,
            ref int anDateTimeHour,
            ref int anDateTimeMinute,
            ref int anDateTimeSecond);
    }
}
