# @gyral/codemod

Rewrites a [Gyral](https://gyral.dev) app's source for a release's API changes. It changes
code only where it can prove the rewrite safe, and lists every candidate it leaves as is, with
`file:line` and the reason, for you to review by hand.

> Status: 0.x, on npm, released with every Gyral release at the same version. It has
> transforms for each release whose API changes it can rewrite.

## Usage

Commit your work first, then run it from the app's directory:

```sh
npx @gyral/codemod 0.3.8          # rewrite every module under .
npx @gyral/codemod 0.3.8 src      # only under src
npx @gyral/codemod 0.3.8 --dry    # print a unified diff, write nothing
git diff                          # review what it changed
```

- It reads every `.ts`, `.tsx`, `.mts`, `.js`, `.jsx` and `.mjs` file under the given paths
  (default `.`), outside `node_modules`, `dist`, `build`, `out`, `coverage` and dot folders.
- It writes only into a git working tree with no uncommitted changes (untracked files count),
  so `git diff` shows exactly what it changed and `git checkout .` undoes it. `--force` writes
  anyway, also outside a git repository. `--dry` never writes, so it runs on any tree.
- Running it a second time changes nothing.
- It exits 0 when it ran, whatever it found; the report goes to stdout.
- It parses with [@babel/parser](https://babel.dev/docs/babel-parser) and edits text ranges,
  so code it doesn't touch keeps its formatting. It never loads your app's TypeScript, and it
  imports no Gyral package, so it works whatever Gyral version the app has installed.
- A rewritten module that passed your app's own Prettier before is formatted with it after,
  with your config, so a `prettier --check` gate stays green. The report marks any other
  rewritten module "not formatted" (the app has no Prettier, or the module didn't pass it):
  run your formatter on those.

Options: `--dry`, `--force`, `-h, --help`, `-v, --version`.

## 0.3.8

[What 0.3.8 changed](https://github.com/gyraljs/gyral/blob/main/docs/references/migrating-0.3.7-to-0.3.8.md).
Three transforms:

**`vite-plugin`**: `gyralVitePreset(options)` from `@gyral/core/vite` becomes the `gyral(options)`
plugin list. The import becomes `gyral` (it keeps `gyralVitePreset` while a use is left).

| Before                                                                          | After                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `defineConfig(gyralVitePreset(o))`                                              | `defineConfig({ plugins: [gyral(o)] })`                |
| `{ ...gyralVitePreset(o), build }` (no `plugins` key)                           | `{ plugins: [gyral(o)], build }`                       |
| `gyralVitePreset(o).plugins`                                                    | `gyral(o)`                                             |
| `const p = gyralVitePreset(o)` … `plugins: [...p.plugins]`, `...p.optimizeDeps` | `plugins: [gyral(o)]`, the declaration and spread gone |

It leaves (and reports) a preset spread into an object that has its own `plugins`, or after an
`optimizeDeps` the preset overrides today; a `const p` used for anything else or exported; a
`const p` whose options can't move to the plugins list unchanged (they call functions, read a
reassigned name, or read a local value that code between the two could change, or that a
function reads later); an `optimizeDeps` with an `include` before the spread or naming
`@gyral/*` packages; and a file that already declares `gyral`.

**`driver-list`**: driver records become lists, where every entry's driver name is known in
the module and equals its key, so each driver is still found under the same name.

```ts
// before
provideDrivers(root, { session: session.provide(run), feed: subscription(feed, listen) });
el.drivers = { log: fakeDriver('log') };
// after
provideDrivers(root, [session.provide(run), subscription(feed, listen)]);
el.drivers = [fakeDriver('log')];
```

Names are known from `subscription('k', …)`, `defineDriver({ name: 'k', … })`,
`fakeDriver('k', …)`, and `tok.provide(…)`, `subscription(tok, …)` or `fakeDriver(tok, …)` where
the module declares `const tok = defineDriver<…>('k')`. It leaves (and reports) a key that isn't
its driver's name, a driver imported from another module, a spread, a computed key, a record
with `as` or `satisfies`, and `el.drivers = { … }` in a file that reads `.drivers` elsewhere.
Test files (`*.test.*`, `*.spec.*`, `test/`, `tests/`, `__tests__/`, and setup modules such as
`vitest.setup.ts`, `test-setup*.ts` or `setupTests.js`) keep their records, which read well for
fakes.

**`subscription-token`**: `subscription('feed', fn)` becomes `subscription(feed, fn)` when the
module declares the token `const feed = defineDriver<I, O, E>('feed')` (or
`defineDriver({ name: 'feed' })` without `run`), so the subscription is typed by it. It leaves
(and reports) a call with type arguments (the two forms order them differently), a token that
sets `concurrency` or `toError` (the subscription would adopt them), a token declared after
the call or re-declared around it, and two tokens of one name.

## Programmatic use

```ts
import { releases, runCodemod, transformSource } from '@gyral/codemod';

releases; // ['0.3.8']
const result = await runCodemod({ release: '0.3.8', paths: ['src'], dry: true });
if (result.ok) console.log(result.changed, result.findings, result.diff);

const { after, findings } = transformSource('0.3.8', code, 'src/main.ts'); // one module
```

`runCodemod(options)` takes `CodemodOptions` (`release`, `paths`, `cwd`, `dry`, `force`) and
resolves to a `CodemodResult`: `{ ok: false, error }` when it refused (an unknown release, a dirty
tree, a missing path), or `{ ok: true, files, changed, findings, diff }`. `transformSource`
returns a `FileResult` (`file`, `before`, `after`, `findings`); each `Finding` has `file`,
`line`, `transform` and `reason`. Nothing else is exported.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.
