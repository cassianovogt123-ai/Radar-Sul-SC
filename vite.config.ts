import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // caminhos relativos: funciona no APK (Capacitor), no app Windows (Electron) e na web
    base: './',
    plugins: [react(), tailwindcss()],
    define: {
      // versão exibida no rodapé (igual à do APK / release do GitHub)
      __APP_VERSION__: JSON.stringify('1.0.' + (process.env.VERSION_CODE || 'dev')),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
