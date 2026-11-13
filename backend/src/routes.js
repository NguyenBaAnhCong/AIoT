// Nơi gắn route của từng module. MỖI THÀNH VIÊN chỉ thêm dòng cho module của mình.
import { Router } from 'express';
import systemRoutes from './modules/system/system.routes.js';
import mlRoutes from './modules/ml/ml.routes.js';

const api = Router();

api.use('/', systemRoutes);
api.use('/ml', mlRoutes);           // TV6
// TV1: api.use('/auth', authRoutes); api.use('/users', userRoutes); ...
// TV2: api.use('/ingest', ...); api.use('/sensors', ...);
// TV3: api.use('/plots', ...); api.use('/experiments', ...);
// ... (mỗi người thêm dòng của mình, không sửa dòng người khác)

export default api;
