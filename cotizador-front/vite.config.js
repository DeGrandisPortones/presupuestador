import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Escribe dist/version.json con un id único de este build (timestamp).
// El front lo sondea periódicamente (ver src/version-check.jsx) para detectar
// que hay un deploy nuevo y avisarle al usuario que recargue, en vez de dejar
// pestañas viejas corriendo JS desactualizado para siempre.
function buildVersionPlugin() {
  const buildId = String(Date.now());
  let outDir = 'dist';
  return {
    name: 'build-version-file',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      try {
        writeFileSync(resolve(outDir, 'version.json'), JSON.stringify({ buildId }));
      } catch (err) {
        console.warn('[build-version-file] no se pudo escribir version.json:', err?.message || err);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), buildVersionPlugin()],
  server: {
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});

