import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  const target = `http://127.0.0.1:${env.PORT || 3001}`;

  return {
    server: {
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
      allowedHosts: ['https://thesaurus-idol-calculator-suggested.trycloudflare.com'],
      proxy: {
        '/ws': { target, ws: true },
        '/api': target,
        '/auth': target,
        '/health': target,
      },
    },
  };
});