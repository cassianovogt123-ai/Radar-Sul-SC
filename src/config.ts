// Base URL of the backend (server.ts).
// - Web (served by the same Express server): leave VITE_API_BASE empty -> relative URLs.
// - Android APK (Capacitor): set VITE_API_BASE=https://your-backend.example.com at build time.
const raw = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export const API_BASE = raw.replace(/\/+$/, '');

export const apiUrl = (path: string): string => `${API_BASE}${path}`;

export const wsUrl = (path: string): string => {
  if (API_BASE) return API_BASE.replace(/^http/, 'ws') + path;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
};
