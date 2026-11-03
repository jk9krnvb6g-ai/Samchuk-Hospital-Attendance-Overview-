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

// กำหนด Adapter Metadata และ Function Properties ให้กับ samRouter โดยตรง
// เพื่อให้รองรับทั้ง app.use('/api/Sam_Att', router) และ require().router และ createSamAttRouter()
samRouter.id = 'sam-att';
samRouter.moduleId = 'sam-att';
samRouter.name = 'Samchuk Attendance System';
samRouter.prefix = '/api/Sam_Att';
samRouter.router = samRouter;
samRouter.samRouter = samRouter;
samRouter.createSamAttRouter = createSamAttRouter;
samRouter.ensureTablesExist = ensureTablesExist;

// Universal Export: คืนค่าเป็น Express Router function พร้อมคุณสมบัติครบถ้วน
module.exports = samRouter;
module.exports.default = samRouter;
module.exports.id = 'sam-att';
module.exports.moduleId = 'sam-att';
module.exports.name = 'Samchuk Attendance System';
module.exports.prefix = '/api/Sam_Att';
module.exports.router = samRouter;
module.exports.samRouter = samRouter;
module.exports.createSamAttRouter = createSamAttRouter;
module.exports.ensureTablesExist = ensureTablesExist;

