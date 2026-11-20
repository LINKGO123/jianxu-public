import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:4173', changeOrigin: false } } },
  build: { outDir: 'dist/client', rollupOptions: { input: {
    home: fileURLToPath(new URL('./index.html', import.meta.url)),
    workbench: fileURLToPath(new URL('./workbench/index.html', import.meta.url))
  } } }
});
