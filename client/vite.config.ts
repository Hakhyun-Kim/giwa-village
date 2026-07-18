import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE: GitHub Pages 배포 시 "/<repo-name>/" (기본 "/")
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
})
