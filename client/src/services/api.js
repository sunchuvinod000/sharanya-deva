import axios from 'axios';

const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * Base URL for `/auth/*` and `/admin/*` paths. Must end with `/api` when using an absolute URL
 * (e.g. `https://api.example.com/api`), otherwise requests hit `/admin/...` on the wrong origin.
 */
function normalizeApiRoot(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return '/api';
  const noTrail = v.replace(/\/+$/, '');
  if (noTrail.endsWith('/api')) return noTrail;
  return `${noTrail}/api`;
}

const API_ROOT = normalizeApiRoot(import.meta.env.VITE_API_URL);

export const api = axios.create({
  baseURL: API_ROOT,
  withCredentials: true,
  timeout: DEFAULT_TIMEOUT_MS,
});

function getApiRoot() {
  return normalizeApiRoot(import.meta.env.VITE_API_URL);
}

const TRANSIENT_RETRY_MAX = 3;
const TRANSIENT_BASE_DELAY_MS = 400;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function shouldTransientRetry(error) {
  const cfg = error.config;
  if (!cfg || cfg.__skipTransientRetry) return false;
  if ((cfg.__transientRetryCount || 0) >= TRANSIENT_RETRY_MAX) return false;
  const method = String(cfg.method || 'get').toLowerCase();
  if (method !== 'get' && method !== 'head') return false;
  const status = error.response?.status;
  if (status === 401 || status === 403) return false;
  if (!error.response) {
    const code = String(error.code || '');
    const msg = String(error.message || '');
    return (
      code === 'ECONNABORTED' ||
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      code === 'ERR_NETWORK' ||
      msg === 'Network Error'
    );
  }
  if (status === 408 || status === 429) return true;
  if (status >= 500 && status <= 504) return true;
  return false;
}

let isRefreshing = false;
let queue = [];

function processQueue(error, token = null) {
  queue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token);
  });
  queue = [];
}

export async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('No refresh token');
  const { data } = await api.post('/auth/refresh', { refreshToken });
  return data.accessToken;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;

    if (original && shouldTransientRetry(error)) {
      original.__transientRetryCount = (original.__transientRetryCount || 0) + 1;
      const delay = Math.min(
        8000,
        TRANSIENT_BASE_DELAY_MS * 2 ** (original.__transientRetryCount - 1)
      );
      await sleep(delay);
      return api(original);
    }

    if (!original || !error.response || error.response.status !== 401 || original._retry) {
      return Promise.reject(error);
    }
    if (original.url?.includes('/auth/login') || original.url?.endsWith('/auth/refresh')) {
      return Promise.reject(error);
    }
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          },
          reject,
        });
      });
    }
    original._retry = true;
    isRefreshing = true;
    try {
      const newToken = await refreshAccessToken();
      localStorage.setItem('token', newToken);
      processQueue(null, newToken);
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch (e) {
      processQueue(e, null);
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return Promise.reject(e);
    } finally {
      isRefreshing = false;
    }
  }
);

export async function apiLogin(email, password) {
  const { data } = await api.post('/auth/login', { email, password });
  return data;
}
