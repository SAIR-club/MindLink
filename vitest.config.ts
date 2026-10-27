import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Component tests mount the front end's `.vue` files; they run in happy-dom (`@vitest-environment happy-dom`).
  plugins: [vue()],
  test: {
    include: ['packages/*/test/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: false,
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 4,
      },
    },
  },
})
