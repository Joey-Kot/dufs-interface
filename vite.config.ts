import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/': {
        target: process.env.DUFS_PROXY || 'http://127.0.0.1:12345',
        changeOrigin: true,
        bypass: (req) => {
          if (req.url?.startsWith('/@') || req.url === '/' || req.url?.startsWith('/src/') || req.url?.startsWith('/assets/') || req.url?.startsWith('/favicon') || req.url?.startsWith('/icons')) {
            return req.url
          }
        },
      },
    },
  },
})
