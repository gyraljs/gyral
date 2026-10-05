import { defineConfig } from 'vitest/config';

// Server rendering runs in Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts'],
  },
});
