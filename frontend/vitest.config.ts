import { defineConfig } from 'vitest/config'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
  },
})
