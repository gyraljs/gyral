# Automatic component loading: shop size check (2026-10-11)

The gyral-1zd.31 fix meets the shop's existing `lazy.ts` JavaScript size on all nine measured
pages and in all emitted chunks, with matching admin grouping. These are byte measurements,
not an LCP benchmark or a guarantee for every app.

## Comparison

Baseline: gyral-shop `6214623`, manual loader, its unchanged `0.3.1-next.9` internal package
cohort. Candidate: shop `42458f5` (`components-attempt-next9`), Gyral's gyral-1zd.31 fix packed
as internal `0.3.1-next.31` tarballs, plus the admin overrides below. These packages were built
locally for verification; none were published to npm or submitted to Context7.

Each page uses a fresh Chromium context against the production server and a seeded throwaway
database. The harness sums each downloaded script's gzip size at level 9 after the loader is
ready and the network is idle. All chunks sums every emitted `.js` file compressed separately
at the same level, including deferred hydration and admin code. Request counts include module
preloads. Every listed route returned 200 with no browser exception.

| Page               | Manual gzip (B) | Automatic gzip (B) | Difference (B) | Scripts manual → automatic |
| ------------------ | --------------: | -----------------: | -------------: | -------------------------- |
| Home               |          34,821 |             34,430 |           −391 | 13 → 13                    |
| Department         |          34,821 |             34,430 |           −391 | 13 → 13                    |
| Category           |          44,106 |             43,657 |           −449 | 18 → 18                    |
| Product            |          44,041 |             43,545 |           −496 | 20 → 20                    |
| Search             |          44,106 |             43,657 |           −449 | 18 → 18                    |
| Empty cart         |          37,075 |             36,650 |           −425 | 14 → 15                    |
| Login              |          36,345 |             35,908 |           −437 | 16 → 17                    |
| About              |          33,068 |             31,575 |         −1,493 | 11 → 11                    |
| Contact            |          38,628 |             38,187 |           −441 | 18 → 19                    |
| All emitted chunks |          91,205 |             90,308 |           −897 | —                          |

## Matching the existing admin grouping

The manual loader imports only `src/ui/admin/app.ts`; that module statically registers all ten
admin sections and provides their drivers. A default scan also makes each section a separate
dynamic entry, defeating the existing grouping. Add these overrides to the candidate's existing
`vite.components.ts` map (the already listed member forms stay in that map):

```ts
const adminModules = {
  'shop-admin-dashboard': 'src/ui/admin/app.ts',
  'shop-admin-order': 'src/ui/admin/app.ts',
  'shop-admin-orders': 'src/ui/admin/app.ts',
  'shop-admin-product': 'src/ui/admin/app.ts',
  'shop-admin-products': 'src/ui/admin/app.ts',
  'shop-admin-promo': 'src/ui/admin/app.ts',
  'shop-admin-promos': 'src/ui/admin/app.ts',
  'shop-admin-reviews': 'src/ui/admin/app.ts',
  'shop-admin-taxonomy': 'src/ui/admin/app.ts',
  'shop-admin-users': 'src/ui/admin/app.ts',
};
```

This uses the existing `components.modules` API, whose explicit entries override scanned
paths. It adds no framework runtime API. Without these overrides, the fixed loader's first
candidate still cost home +368 B and all chunks +12,470 B. A trial that automatically folded
every lazy child reduced total chunks but made home fetch catalog code through its wishlist
tag (+8,291 B); that algorithm was discarded.

## Reproduction and correctness checks

Use isolated shop worktrees for the two commits above. Keep the baseline lockfile and install
the candidate package cohort internally (repository [release runbook](releasing.md)); do not
publish test tarballs. In each shop worktree run:

```sh
pnpm install
node /path/to/gyral/scripts/measure-components-shop.mjs /tmp/shop-measurement.json
```

The script builds the production app and records per-script details, status, exceptions and
all-chunk totals in JSON. `--no-build` reuses a build while creating a new throwaway database.
Page paths are home, discovered department/category/product links, `/search?q=phone`, `/cart`,
`/account/login`, `/about` and `/contact`.

Production hydration and interaction verification uses the candidate shop's `pnpm smoke:prod
--no-build`. Framework regressions cover tree-shaken static imports, entry registration order,
nested shadow roots, explicit groups and static cycles, custom output filenames and app preload
resolvers, plus actual Chromium loading of late CSS and reuse of SSR-linked stylesheets.
