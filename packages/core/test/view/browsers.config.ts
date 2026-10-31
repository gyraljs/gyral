// The style-attribute (including ADR 0020's hashed server style attributes) and Trusted Types
// tests in Chromium, Firefox and WebKit (not part of
// `pnpm check`, which runs Chromium only):
// `pnpm vitest run --config packages/core/test/view/browsers.config.ts`.
// Firefox is the browser that blocks a static `style` in a <template>'s HTML under a strict
// CSP (view/08-styles.md "Style attributes under a strict CSP"); the Trusted Types tests run
// with raw() and svg beside them, because those are the other two HTML sinks (gyral-ei9). The
// dialog and popover bindings run here too, since each engine implements showModal() and the
// Popover API itself (gyral-1zd.27). <noscript> runs here because the engines parse a
// <template>'s content differently: Chromium and WebKit with scripting off, Firefox with it on
// (gyral-qqa).
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { gyralVitePreset } from '../../src/vite.js';

export default defineConfig({
  ...gyralVitePreset(),
  test: {
    include: [
      'packages/core/test/view/{render-style,style-hydration,style-csp,trusted-types,render-raw,render-svg,dialogs,dialogs-insertion,dialogs-hydration,noscript-hydration}.test.ts',
      'packages/core/test/dialog-focus.test.ts',
      'packages/ssr/test/style-attribute-hashes.test.ts',
    ],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
});
