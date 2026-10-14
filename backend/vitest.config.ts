import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // DB統合テストは直列実行（同一テーブルを触るため並列だと競合する）
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
