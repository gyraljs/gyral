import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    projects: [
      {
        // Pre-bundle Lit's directive modules (re-exported by @gyral/core) so the first browser
        // run doesn't discover them mid-test and reload.
        optimizeDeps: {
          include: [
            'lit',
            'lit/directive.js',
            'lit/directives/class-map.js',
            'lit/directives/keyed.js',
            'lit/directives/live.js',
            'lit/directives/repeat.js',
            'lit/directives/style-map.js',
          ],
        },
        test: {
          name: 'browser',
          include: ['packages/*/test/**/*.test.ts', 'examples/*/test/**/*.test.ts'],
          // Server-rendering tests run in Node (the `node` project below).
          exclude: ['**/*.node.test.ts', '**/node_modules/**'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        test: {
          name: 'node',
          include: [
            'scripts/test/**/*.test.mjs',
            'packages/*/test/**/*.node.test.ts',
            'examples/*/test/**/*.node.test.ts',
          ],
          environment: 'node',
        },
      },
    ],
  },
});
