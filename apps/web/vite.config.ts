import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://localhost:3000',
        secure: false, // Allow self-signed SSL cert in dev
        changeOrigin: true
      },
      '/socket.io': {
        target: 'https://localhost:3000',
        secure: false,
        ws: true,
        changeOrigin: true
      }
    }
  }
});
