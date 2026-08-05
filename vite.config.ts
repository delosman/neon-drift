import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works when VIVERSE (or any host) serves it
  // from a subpath rather than the domain root.
  base: './',
  server: { port: 5173, strictPort: true, host: true },
  build: { target: 'es2022', sourcemap: true },
});
