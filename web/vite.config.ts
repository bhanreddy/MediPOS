import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  server: {
    port: 8082,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:5001' },
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
          auth: ['@supabase/supabase-js'],
          router: ['react-router-dom'],
        },
      },
    },
  },
})
