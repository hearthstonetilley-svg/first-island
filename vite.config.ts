import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [{
    // The sandbox is the project now: the bare address opens it. The old world view stays at /index.html.
    name: 'open-sandbox',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req as { url?: string }).url === '/') { res.statusCode = 302; res.setHeader('Location', '/sandbox.html'); res.end(); return; }
        next();
      });
    },
  }],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        sandbox: 'sandbox.html',
        web: 'web.html',
      },
    },
  },
});
