using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SamchukAttendance.Api.BackgroundServices;
using SamchukAttendance.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// กำหนดให้ API รันบนพอร์ต 3002 (ค่าเริ่มต้น HTTP สำหรับ LAN โรงพยาบาล หรือตาม ASPNETCORE_URLS)
var defaultUrls = Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "http://0.0.0.0:3002";
builder.WebHost.UseUrls(defaultUrls);

// เปิดใช้งานการรันเป็น Windows Service
builder.Host.UseWindowsService();

// กำหนดการเชื่อมต่อและ Services
var services = builder.Services;
var configuration = builder.Configuration;

services.AddControllers();
services.AddEndpointsApiExplorer();
services.AddSwaggerGen();

// ลงทะเบียน Services ตามสถาปัตยกรรม v2
services.AddSingleton<ShiftService>();
services.AddScoped<AttendanceCalculator>();
services.AddScoped<PushService>();

// เปิด Background Worker ดึงข้อมูลเครื่องสแกนทุก 1 นาที + ประมวลผลอัตโนมัติ
services.AddHostedService<ScannerBackgroundService>();

// เปิดใช้งาน CORS สำหรับ Web Frontend
services.AddCors(options =>
{
    options.AddPolicy("AllowWebFrontend", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowWebFrontend");
app.UseAuthorization();
app.MapControllers();

app.Run();
