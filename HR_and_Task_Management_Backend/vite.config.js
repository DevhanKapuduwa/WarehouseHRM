import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        tailwindcss(),
        laravel({
            input: ['resources/css/app.css', 'resources/js/main.tsx'],
            refresh: true,
        }),
        react(),
    ],
    server: {
        host: 'localhost',
        proxy: {
            // MJPEG stream proxy — must not buffer, handled first (more specific path)
            '/api/face/live-stream/proxy': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                selfHandleResponse: false,
                configure: (proxy) => {
                    proxy.on('proxyReq', (_proxyReq, _req, res) => {
                        res.setHeader('X-Accel-Buffering', 'no');
                    });
                },
            },
            '/api': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
            },
            '/sanctum': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
            },
        },
    },
});