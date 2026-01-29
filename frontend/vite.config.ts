import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-router')) return 'react-router'
          if (id.includes('react-dom') || id.includes('react')) return 'react'
          if (id.includes('@tanstack/react-query')) return 'react-query'
          if (id.includes('@dnd-kit')) return 'dnd-kit'
          if (id.includes('react-hook-form') || id.includes('@hookform/resolvers') || id.includes('zod')) return 'forms'
          if (id.includes('date-fns')) return 'date-fns'
          return 'vendor'
        },
      },
    },
  },
})
