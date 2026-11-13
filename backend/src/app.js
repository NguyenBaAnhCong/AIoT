import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import routes from './routes.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';

const app = express();

// Phía sau nginx/proxy: cần để req.ip là IP thật của người dùng (giới hạn đăng nhập, access_logs)
if (env.trustProxy) app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));
if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.use('/api/v1', routes);

// Trang HTML thuần của TV4 (đã dời vào frontend/public/tv4), mở tại http://localhost:4000/tv4/
const tv4Root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/public/tv4');
app.use('/tv4', express.static(tv4Root));

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
