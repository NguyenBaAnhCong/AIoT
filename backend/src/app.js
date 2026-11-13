import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.use('/api/v1', routes);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend');
app.use('/tv4', express.static(root));

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
