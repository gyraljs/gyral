# @gyral/codemod

## 0.3.10

### Patch Changes

- bbf760f: `npx @gyral/codemod 0.3.8` rewrites `...(gyralVitePreset(o).plugins ?? [])` to `...gyral(o)`
  (gyral-68h). It wrote `...(gyral(o) ?? [])` before: valid, but the fallback is dead, since
  `gyral()` always returns an array. A `|| []` fallback goes the same way. If you already ran the
  codemod, you can delete the `?? []` and its parentheses by hand.

## 0.3.9

### Patch Changes

- bab6758: The codemod leaves a package whose `@gyral/core` is older than the release its transforms
  migrate from, and reports it once (gyral-w2j): "left as is: this package's @gyral/core is 0.3.0
  (installed), and the 0.3.8 rewrites start from 0.3.7: migrate it to 0.3.7 first". Before, it
  rewrote it too, so a package still on 0.3.0 got `gyral()`, which 0.3.0 doesn't export. The 0.3.8
  transforms start from 0.3.7, so they run before or after you install 0.3.8, as before. The
  package is the module's nearest `package.json`; its core is the one Node finds from there, else
  the lowest version its declared range allows. A module whose core it can't tell is rewritten.
- 26cb250: The codemod reports two kinds of driver candidate it used to leave without a word (gyral-0dj).
  A record of drivers built away from `provideDrivers` and `el.drivers` (returned from a function,
  passed in `defineStore({ drivers })` options or to another function) is listed, to make a list
  by hand if nothing reads it by key; test files keep their records unreported. And
  `subscription('feed', …)` is listed when the module imports a binding named `feed` (naming where
  from), or declares a `feed` token where the rewrite can't pass it (inside a function, or with
  `let`). A string name with its own implementation stays a documented form and isn't reported.
  An entry imported from another module now names that module.

## 0.3.8

### Patch Changes

- b35cfb7: New package: `npx @gyral/codemod 0.3.8` rewrites an app's source for 0.3.8's APIs (gyral-337.4).
  `gyralVitePreset(options)` becomes `plugins: [gyral(options)]`; driver records whose keys are
  their drivers' names become lists (`provideDrivers(root, [feed.provide(run)])`, outside test
  files); and `subscription('feed', fn)` becomes `subscription(feed, fn)` when the module declares
  the `feed` token. It rewrites only what it can prove safe and reports every candidate it leaves,
  with `file:line` and the reason. It writes only into a clean git working tree (`--force`
  overrides), `--dry` prints a unified diff instead, and a second run changes nothing. It parses
  with `@babel/parser`, never the app's TypeScript, and imports no Gyral package, so it runs on any
  app. A rewritten module that passed the app's own Prettier before is formatted with it after, so
  a `prettier --check` gate stays green; the report marks any other rewritten module "not
  formatted".
