import { defineConfig, loadEnv } from 'vite-plus'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '..', '')
    const target = `http://127.0.0.1:${env.PORT || 3001}`

    return {
        server: {
            host: '127.0.0.1',
            port: 5174,
            strictPort: true,
            allowedHosts: true,
            proxy: {
                '/ws': { target, ws: true },
                '/api': target,
                '/auth': target,
                '/health': target
            }
        },
        build: {
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (id.includes('node_modules/phaser')) {
                            return 'phaser'
                        }
                    }
                }
            }
        }
    }
})
