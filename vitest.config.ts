import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Component tests mount the front end's `.vue` files; they run in happy-dom (`@vitest-environment happy-dom`).
  plugins: [vue()],
  test: {
    include: ['packages/*/test/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: false,
    // Tests that open a real graph reached 6.75s on a slow Windows runner; browser suites tear down several Edge
    // processes, slower than the default hook limit. This only moves where a hung test gets cut off.
    testTimeout: 20_000,
    hookTimeout: 60_000,
    teardownTimeout: 60_000,
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 4,
      },
    },
  },
})
