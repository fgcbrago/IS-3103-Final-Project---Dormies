import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// the frontend runs on 5173, every /api request is forwarded to the backend on port 5000
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5000' },
  },
})
