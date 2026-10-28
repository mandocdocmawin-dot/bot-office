import { defineConfig, loadEnv } from 'vite';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  const target = `http://127.0.0.1:${env.PORT || 3001}`;
  return { server: { host: '127.0.0.1', proxy: { '/ws': { target, ws: true }, '/api': target, '/auth': target, '/health': target } } };
});
