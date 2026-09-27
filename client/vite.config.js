import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { buildRobotsTxt } from './src/utils/robots.js';

function robotsTxt(sitemapUrl) {
  const body = buildRobotsTxt({ sitemapUrl });
  return {
    name: 'cove-robots-txt',
    configureServer(server) {
      server.middlewares.use('/robots.txt', (req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(body);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: body });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), robotsTxt(env.VITE_SITEMAP_URL)],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
  };
});
