/**
 * Samchuk Attendance Router Module - Root Alias
 * 
 * นำเข้าและ Export createSamAttRouter(dependencies) จาก modules/sam_att/index.cjs
 * เพื่อความสะดวกในการ import เข้า Central Gateway:
 * 
 * const { createSamAttRouter } = require('./backend/samAttRouter.cjs');
 * app.use('/api/Sam_Att', createSamAttRouter(dependencies));
 */

const { createSamAttRouter, samRouter } = require('./modules/sam_att/index.cjs');

module.exports = {
  createSamAttRouter,
  samRouter
};
