import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import {defineConfig} from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  const basePath = process.env.VITE_BASE_PATH || '/Sam_Att/';
  const apiBase = process.env.VITE_API_URL || 'SAME_ORIGIN';
  if (apiBase !== 'SAME_ORIGIN') {
    const endpoint = new URL(apiBase);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('VITE_API_URL must not contain credentials, query or fragment');
  }
  return {
    base: basePath,
    plugins: [react(), tailwindcss(), {
      name: 'scanner-build-evidence',
      generateBundle() { this.emitFile({ type: 'asset', fileName: 'scanner-build.json', source: JSON.stringify({ basePath, apiBase }, null, 2) }); },
    }],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
