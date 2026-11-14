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

import tv5Routes from './modules/tv5/tv5.routes.js';

const api = Router();

api.use(accessLog);

api.use('/', systemRoutes);
api.use('/auth', authRoutes);            // TV1
api.use('/api-keys', apiKeyRoutes);      // TV1
api.use('/ml', mlRoutes);                // TV6
api.use('/quality', dataQualityRoutes);  // TV4
api.use('/datasets', datasetRoutes);     // TV4
api.use('/tv5', tv5Routes);              // TV5
api.use('/farm', farmRoutes);            // TV3
api.use('/experiment', experimentRoutes);// TV3
api.use('/biochar', biocharRoutes);      // TV3
api.use('/laboratory', laboratoryRoutes);// TV3
// TV2: thêm dòng của mình ở đây (không sửa dòng người khác)

export default api;
