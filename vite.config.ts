import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [{
    // The sandbox is the project now: the bare address opens it. The old population view is not served in development.
    name: 'open-sandbox',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req as { url?: string }).url ?? '';
        if (url === '/' || url.startsWith('/index.html')) { res.statusCode = 302; res.setHeader('Location', '/sandbox.html'); res.end(); return; }
        next();
      });
    },
  }],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: `http://localhost:${(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SANDBOX_PORT ?? 8787}`, changeOrigin: true } },
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
