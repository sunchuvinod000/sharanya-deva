import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';

function normalizeOriginUrl(o) {
  return String(o).trim().replace(/\/+$/, '');
}

const devOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const configuredOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => normalizeOriginUrl(o))
  : [];

function originAllowed(origin) {
  if (!origin) return true;
  if (configuredOrigins.includes(origin) || devOrigins.includes(origin)) return true;
  // Preview / branch deploys use *.vercel.app hostnames; opt-in so production stays explicit via CORS_ORIGIN.
  if (process.env.CORS_ALLOW_VERCEL_PREVIEW_ORIGINS === 'true') {
    try {
      const { protocol, hostname } = new URL(origin);
      return protocol === 'https:' && hostname.endsWith('.vercel.app');
    } catch {
      return false;
    }
  }
  return false;
}

const app = express();

/** Behind reverse proxies — correct `req.ip`, secure cookies if added later */
app.set('trust proxy', 1);

app.use(
  cors({
    origin(origin, callback) {
      if (originAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  const path = req.originalUrl.split('?')[0];
  if (path === '/api' || path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Not found.' });
  }
  return res.status(404).send('Not found');
});

app.use((err, _req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'Not allowed by CORS' });
  }
  return next(err);
});

app.use((err, _req, res, _next) => {
  if (res.headersSent) return;
  console.error(err);
  const status =
    typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  const isProd = process.env.NODE_ENV === 'production';
  const body = {
    message:
      status === 500 && isProd ? 'Internal server error.' : err.message || 'Internal server error.',
  };
  if (!isProd && err.stack) {
    body.stack = err.stack;
  }
  res.status(status).json(body);
});

export default app;
