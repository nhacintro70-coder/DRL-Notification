import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Dùng relative path để deploy lên Github Pages (hoạt động với mọi sub-path)
})
