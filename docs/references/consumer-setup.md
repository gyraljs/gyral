# Using Gyral in an app

Gyral renders with [Lit](https://lit.dev). Lit must exist **once** in an app: two copies give
two `LitElement` classes and two template systems, and server-rendered templates stop
hydrating. So the Lit packages are **peer dependencies** of `@gyral/core` and `@gyral/ssr`.
Your app installs them, and every Gyral package uses your copy.

## Install

```sh
pnpm add @gyral/core lit
# Optional packages
pnpm add @gyral/http @gyral/router @gyral/time
pnpm add -D @gyral/testing
# Server rendering (ADR 0012)
pnpm add @gyral/ssr @lit-labs/ssr @lit-labs/ssr-client
```

| Package                                                         | Peer dependencies                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| `@gyral/core`                                                   | `lit` ^3.3                                                      |
| `@gyral/ssr`                                                    | `lit` ^3.3, `@lit-labs/ssr` ^4.1, `@lit-labs/ssr-client` ^1.1.8 |
| `@gyral/http`, `@gyral/router`, `@gyral/time`, `@gyral/testing` | none beyond `@gyral/core`                                       |

Import Lit helpers (`html`, `css`, `nothing`, `repeat`, `live`, …) from `@gyral/core`. Only
import `lit` directly for plain `LitElement` classes.

## Vite: dedupe Lit

Package managers usually dedupe peers. They can't when Gyral comes from a `link:` path or a
second checkout (as in gyral-shop before Gyral is published), because each tree has its own
`node_modules`. Tell Vite (and Vitest) to resolve every Lit package from your app:

```ts
// vite.config.ts (repeat `resolve.dedupe` in each Vitest project)
export const LIT_PACKAGES = [
  'lit',
  'lit-html',
  'lit-element',
  '@lit/reactive-element',
  '@lit-labs/ssr',
  '@lit-labs/ssr-client',
];

export default defineConfig({ resolve: { dedupe: LIT_PACKAGES } });
```

Symptom if you skip this: the console warns "Multiple versions of Lit loaded", or hydration
fails with "Hydration value mismatch" and duplicated DOM.

## Server rendering checklist

- Import `@gyral/ssr/hydrate` **first** in the client entry, before anything that imports
  `lit` or `@gyral/core`.
- Allow `style-src 'unsafe-inline'` in your CSP. Declarative Shadow DOM styles are inline
  `<style>` elements (ADR 0012, CSP addendum).
- Keep component state and props JSON-serializable. They travel in the hydration seed.
