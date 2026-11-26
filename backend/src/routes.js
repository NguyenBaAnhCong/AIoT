// Nơi gắn route của từng module. MỖI THÀNH VIÊN chỉ thêm dòng cho module của mình.
import { Router } from 'express';
import { accessLog } from './middleware/accessLog.js';
import systemRoutes from './modules/system/system.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import apiKeyRoutes from './modules/api-keys/api-keys.routes.js';
import mlRoutes from './modules/ml/ml.routes.js';
import dataQualityRoutes from './modules/data-quality/data-quality.routes.js';
import datasetRoutes from './modules/dataset/dataset.routes.js';
import farmRoutes from './modules/farm/farm.routes.js';
import experimentRoutes from './modules/experiment/experiment.routes.js';
import biocharRoutes from './modules/biochar/biochar.routes.js';
import laboratoryRoutes from './modules/laboratory/laboratory.routes.js';
import gatewayRoutes from './modules/gateway/gateway.routes.js';
import calibrationRoutes from './modules/calibration/calibration.routes.js';
import devicesRoutes from './modules/devices/devices.routes.js';


import userRoutes from './modules/users/users.routes.js';
import { rolesRouter, permissionsRouter, organizationsRouter } from './modules/roles/roles.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import refRoutes from './modules/ref/ref.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import systemStatusRoutes from './modules/system/status.routes.js';

const api = Router();

api.use(accessLog);

api.use('/', systemRoutes);
api.use('/auth', authRoutes);            // TV1
api.use('/api-keys', apiKeyRoutes);      // TV1
api.use('/ml', mlRoutes);                // TV6
api.use('/quality', dataQualityRoutes);  // TV4
api.use('/datasets', datasetRoutes);     // TV4
api.use('/farm', farmRoutes);            // TV3
api.use('/experiment', experimentRoutes);// TV3
api.use('/biochar', biocharRoutes);      // TV3
api.use('/laboratory', laboratoryRoutes);// TV3
api.use('/gateway', gatewayRoutes);      // TV2
api.use('/calibration', calibrationRoutes); // TV2
api.use('/devices', devicesRoutes); // TV2
// TV2: thêm dòng của mình ở đây (không sửa dòng người khác)
api.use('/users', userRoutes);                  // TV1
api.use('/roles', rolesRouter);                 // TV1
api.use('/permissions', permissionsRouter);     // TV1
api.use('/organizations', organizationsRouter); // TV1
api.use('/audit', auditRoutes);                 // TV1
api.use('/ref', refRoutes);                     // TV1
api.use('/dashboard', dashboardRoutes);         // TV1
api.use('/system', systemStatusRoutes);         // TV1

export default api;
