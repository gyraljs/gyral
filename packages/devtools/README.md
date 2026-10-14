# @gyral/devtools

Gyral devtools: an in-page timeline of messages, state, commands and stores for development builds. Production builds of `@gyral/core` carry no devtools code.

## Install

```sh
pnpm add -D @gyral/devtools
```

## Example

```ts
// Development only: Vite drops this block from production builds.
if (import.meta.env.DEV) {
  void import('@gyral/devtools').then(({ mountDevtools }) => mountDevtools({ open: true }));
}
```

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (packages, Vite preset, server rendering):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral).

> Status: 0.x, on npm. Breaking changes to the
> [public API](https://github.com/gyraljs/gyral/blob/main/docs/references/public-api-0.3.1.md)
> come only in a new minor version, with a migration guide.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.
