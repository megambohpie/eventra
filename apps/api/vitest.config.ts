import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './test/testDb';

export default defineConfig({
  test: {
    globalSetup: ['./test/globalSetup.ts'],
    env: { DATABASE_URL: TEST_DATABASE_URL },
    // Semua file berbagi satu database uji; jalankan berurutan.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
