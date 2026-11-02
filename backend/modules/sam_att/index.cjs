/**
 * Samchuk Hospital Attendance System (Sam_Att) - Central Gateway Express Router Module
 * 
 * โมดูล Express Router สำหรับเชื่อมต่อเข้ากับ Samchuk Hospital Central API Gateway พอร์ต 3002
 * เส้นทางหลัก: /api/Sam_Att/
 * 
 * คุณสมบัติ:
 * 1. ไม่มี app.listen() ภายในตัวโมดูลเด็ดขาด (ให้ Central Gateway เป็นผู้จัดการ HTTP Listener ตัวเดียว)
 * 2. ไม่มีการใช้งานหรือเรียกพอร์ต 3003 (Procurement) หรือ 3004 (Cash_Cheque)
 * 3. รองรับ Dependency Injection สำหรับ Database Connection Pools, Config, Logger
 * 4. รักษา API Contract เดิมทั้งหมด 100%
 */

const { createSamAttRouter, samRouter, ensureTablesExist } = require('../../server.cjs');

module.exports = {
  createSamAttRouter,
  samRouter,
  ensureTablesExist
};
