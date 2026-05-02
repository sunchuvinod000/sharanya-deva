import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';

function normalizeOriginUrl(o) {
  return String(o).trim().replace(/\/+$/, '');
}

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => normalizeOriginUrl(o))
  : [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ];

/** Preflight + actual responses: methods and headers browsers send for cross-origin API calls. */
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  optionsSuccessStatus: 204,
  maxAge: 86_400,
};

const app = express();

/** Behind reverse proxies — correct `req.ip`, secure cookies if added later */
app.set('trust proxy', 1);

app.use(cors(corsOptions));
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
