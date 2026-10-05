// Vite / Vitest settings every Gyral app needs (gyral-a7r, docs/references/consumer-setup.md).
// Plain data, no imports: safe to load from vite.config.ts and vitest.config.ts.

/** Every Lit package: resolve exactly one copy, even when Gyral is linked from elsewhere. */
export const LIT_PACKAGES: readonly string[] = [
  'lit',
  'lit-html',
  'lit-element',
  '@lit/reactive-element',
  '@lit-labs/ssr',
  '@lit-labs/ssr-client',
];

/**
 * Lit modules that Gyral imports or re-exports. Pre-bundling them up front stops Vite from
 * discovering them mid-run, which reloads the page and fails the first browser test run.
 */
export const LIT_PREBUNDLE: readonly string[] = [
  'lit',
  'lit/directive.js',
  'lit/static-html.js',
  'lit/directives/class-map.js',
  'lit/directives/keyed.js',
  'lit/directives/live.js',
  'lit/directives/repeat.js',
  'lit/directives/style-map.js',
];

export interface GyralViteOptions {
  /** More modules to pre-bundle (e.g. 'lit/directives/unsafe-html.js'). */
  readonly optimize?: readonly string[];
}

export interface GyralViteConfig {
  readonly resolve: { readonly dedupe: string[] };
  readonly optimizeDeps: { readonly include: string[] };
}

/**
 * Spread into a Vite config, or into each Vitest project:
 *
 *   export default defineConfig({ ...gyralVitePreset(), build: { … } });
 */
export function gyralVitePreset(options: GyralViteOptions = {}): GyralViteConfig {
  return {
    resolve: { dedupe: [...LIT_PACKAGES] },
    optimizeDeps: { include: [...new Set([...LIT_PREBUNDLE, ...(options.optimize ?? [])])] },
  };
}
