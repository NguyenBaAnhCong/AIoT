// Nơi gắn route của từng module. MỖI THÀNH VIÊN chỉ thêm dòng cho module của mình.
import { Router } from 'express';
import systemRoutes from './modules/system/system.routes.js';
import mlRoutes from './modules/ml/ml.routes.js';
import dataQualityRoutes from './modules/data-quality/data-quality.routes.js';
import datasetRoutes from './modules/dataset/dataset.routes.js';

const api = Router();

api.use('/', systemRoutes);
api.use('/ml', mlRoutes); // TV6
api.use('/quality', dataQualityRoutes); // TV4
api.use('/datasets', datasetRoutes); // TV4

export default api;
