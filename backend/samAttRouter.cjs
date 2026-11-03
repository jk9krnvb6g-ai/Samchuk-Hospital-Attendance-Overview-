/**
 * Samchuk Attendance Router Module - Root Alias
 * 
 * นำเข้าและ Export createSamAttRouter(dependencies) จาก modules/sam_att/index.cjs
 * เพื่อความสะดวกในการ import เข้า Central Gateway:
 * 
 * const { createSamAttRouter } = require('./backend/samAttRouter.cjs');
 * app.use('/api/Sam_Att', createSamAttRouter(dependencies));
 */

const { createSamAttRouter, samRouter, ensureTablesExist } = require('./modules/sam_att/index.cjs');

// Universal Export: รองรับทั้งการ import แบบ Express Router โดยตรง, Adapter Object, และ Factory Function
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

