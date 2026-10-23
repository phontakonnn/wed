import { defineConfig } from 'vitest/config';

/**
 * Rules tests run inside `firebase emulators:exec` (see package.json
 * `test:rules`). They need the emulator, so they are excluded from the default
 * `vitest run` used by CI's unit-test step.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
