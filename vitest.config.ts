import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // happy-dom dà localStorage e document ai test che ne hanno bisogno;
    // i moduli di calcolo restano puri e non lo usano.
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'pipeline/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
})
