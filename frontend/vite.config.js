import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi chạy `npm run dev`, mọi request /api/... được chuyển sang backend (tránh lỗi CORS).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/tv5': process.env.VITE_TV5_PROXY || 'http://127.0.0.1:4005',
      '/api/v1/tv5': process.env.VITE_TV5_PROXY || 'http://127.0.0.1:4005',
      '/api': process.env.VITE_API_PROXY || 'http://localhost:4000',
    },
  },
});
