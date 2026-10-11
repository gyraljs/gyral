# create-gyral

Create a [Gyral](https://gyral.dev) app: Model-View-Intent components on web components, with
server rendering that hydrates in place.

## Usage

```sh
npm create gyral@latest
# or
pnpm create gyral
yarn create gyral
```

It asks for a directory and a template. To skip the questions:

```sh
npm create gyral@latest my-app -- --template ssr
npm create gyral@latest my-app -- --yes   # basic template
```

| Template | What you get                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `basic`  | Vite, a counter component and a Vitest browser test; client-only build (`clientOnly: true`, remove it before adding server rendering) |
| `ssr`    | Pages rendered on the server, prerendered to static HTML and hydrated; production server                                              |

Options: `-t, --template <basic|ssr>`, `-y, --yes`, `-h, --help`, `-v, --version`. The target
directory must not exist yet or be empty (a `.git` folder is fine).

The generated app depends on the `@gyral/*` release that matches this package's version.

## Programmatic use

Tools that generate Gyral projects can call the same code as the CLI:

```ts
import { manifest, parse, scaffold } from 'create-gyral';

const parsed = parse(['my-app', '--template', 'ssr']); // { ok: true, options } or { ok: false, error }
await scaffold({
  targetDir: 'my-app',
  template: 'ssr',
  packageName: 'my-app',
  gyralVersion: '0.3.1',
});
const pkg = manifest('basic', 'my-app', '0.3.1'); // the package.json scaffold() writes
```

`scaffold` refuses a non-empty directory. Nothing else is exported.

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source and issues:
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral).

> Status: pre-alpha. APIs change between 0.x releases.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.
