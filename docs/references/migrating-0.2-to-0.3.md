# Migrating from Gyral 0.2 to 0.3

Gyral 0.3 renders with its own view layer instead of Lit
([ADR 0018](../design-docs/0018-view-layer.md), specs in [view/](../design-docs/view/README.md)).
The component model is unchanged: `define()`, intents, reducers, commands, drivers, stores,
forms, the router and the testing helpers work as before. What changes is everything a view
touches: imports, bindings, lists, props, styles, server rendering and hydration.

Most apps migrate in this order: dependencies, imports, the build checks (the compiler and the
ESLint rules list every template that needs a change), props, lists, tests, server.

The 0.2 snippets below are `text` blocks; every 0.3 snippet typechecks against the packages
(`pnpm invariants`).

## Dependencies

- Remove `lit`, `@lit-labs/ssr` and `@lit-labs/ssr-client`, and the `lit-html` 3.3.0 override
  (`pnpm.overrides`, `overrides` or `resolutions`). No Gyral package depends on Lit, and
  `@gyral/core` has no runtime dependencies at all.
- Keep Lit only if the app has its own Lit elements: any custom element still works next to
  Gyral components, but Gyral no longer installs or dedupes Lit for you.
- Optional build-time peers of `@gyral/core`: `vite` ^8 (preset and compiler), `parse5`
  (an extra markup check in `vite build`) and `eslint` 9 or 10 (the plugin).

## Imports

Everything a view needs comes from `@gyral/core`:

| 0.2 (Lit or a Lit re-export)                                     | 0.3                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| `import { html } from 'lit'` / `'@gyral/core'`                   | `import { html } from '@gyral/core'` (Gyral's own tag)    |
| `css`, `nothing`                                                 | same names, from `@gyral/core`                            |
| `unsafeCSS(x)`                                                   | `${x}` inside `css` (see Styles)                          |
| `repeat`, `keyed`                                                | `each(items, key, row, pick?)`                            |
| `live`, `liveBoolean`, `textarea()`, `textareaMarkup`            | plain bindings (see Form state)                           |
| `classMap`, `styleMap`                                           | strings: `class=${…}`, `style="--w: ${w}px"`              |
| `svg` templates                                                  | inline `<svg>` inside `html`                              |
| `unsafeHTML` (from `lit/directives`)                             | `raw(markup)`: trusted markup only                        |
| `directive`, `ElementDirective`                                  | `defineHook({ client, server? })` (see Hooks)             |
| `serverHtml` (`@gyral/ssr`)                                      | `html` from `@gyral/core`                                 |
| `import '@gyral/ssr/hydrate'`                                    | delete it: hydration is built in (the entry is now empty) |
| `defineStoresProvider`, `HIDDEN_MARKER`, `HYDRATE_KEY`           | removed (internal)                                        |
| `LIT_PACKAGES`, `LIT_PREBUNDLE` (`@gyral/core/vite`)             | removed                                                   |
| `el.updateComplete`, `requestUpdate`, `renderRoot`, `hasUpdated` | `await settled()` (see Tests)                             |

New exports: `each`, `raw`, `defineHook`, `prop`, `intents`, `settled`, `HydrationMismatch` and
their types from `@gyral/core`; the entry points `@gyral/core/server`, `@gyral/core/eslint` and
`@gyral/core/compiled` (used by compiled output); `contentSecurityPolicy` and
`page({ modulepreload })` in `@gyral/ssr`; `clientAssets` and `clientAssetsFromManifest` in
`@gyral/ssr/static`; the `renderOnFrame` spec field (bursty sources render once per frame).

## Build: the Vite preset compiles templates

`gyralVitePreset()` used to dedupe Lit and pre-bundle its modules. It now adds the template
compiler to `vite build`: templates are precompiled, and a template that breaks a rule fails
the build with a code frame. Keep the spread; add your own plugins after its plugins:

```ts
import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

const preset = gyralVitePreset();

export default defineConfig({ ...preset, plugins: [...preset.plugins], build: { manifest: true } });
```

The dev server and Vitest keep the runtime path, which checks the same rules on first render.
Template whitespace is normalized once per template (indentation between block tags goes,
`<pre>`/`<textarea>` keep theirs), the same way in the compiler, the browser and the server;
0.2 did this at runtime in its `html` wrapper, so output should match, but compare pages whose
layout depends on whitespace between inline elements. Details:
[consumer-setup.md](consumer-setup.md).

## ESLint: `@gyral/core/eslint`

New in 0.3: the template rules and pure `each` rows in the editor, with the compiler's
messages. Run it once over the codebase: it lists most of the changes in this note.

```ts
import gyral from '@gyral/core/eslint';

export default [{ files: ['src/**/*.ts'], ...gyral.configs.recommended }];
```

## Templates: what is an error now

0.2 accepted these and misrendered some of them; 0.3 rejects them in the compiler, the
development runtime and ESLint ([09-template-rules.md](../design-docs/view/09-template-rules.md)):

- `.value=`, `.checked=`, `.selected=`, `.open=`, `.indeterminate=` on form controls (rule 4).
- Self-closing non-void elements: `<my-el />` becomes `<my-el></my-el>` (rule 6).
- Unquoted multi-part attributes: `class=a${b}` becomes `class="a ${b}"` (rule 5).
- Markup the HTML parser repairs: `<tr>` directly in `<table>`, a `<div>` in a `<p>` (rule 7).
- Named character references other than `&amp; &lt; &gt; &quot; &apos; &nbsp;` in attribute
  text: write the character or a numeric reference (rule 13).
- Page shells (`<html>`, doctype) rendered in the browser (rule 11): server-only now.

Attributes: `null` and `undefined` remove an attribute, so `href=${s.url ?? nothing}` is just
`href=${s.url}`. `true` in a child hole renders nothing and warns in development.

## Form state

One spelling per piece of state, the same on the server and in the browser. The model wins
whenever it changes, and hydration never overwrites what the user typed before scripts ran.

```text
// 0.2
html`<input .value=${s.name} />
  <input type="checkbox" ?checked=${liveBoolean(s.agree)} />
  ${textarea({ value: s.note, attrs: { name: 'note' } })}`;
```

```ts
import { html } from '@gyral/core';

export const fields = (s: { name: string; agree: boolean; note: string }) =>
  html`<input name="name" value=${s.name} />
    <input type="checkbox" name="agree" ?checked=${s.agree} />
    <textarea name="note">${s.note}</textarea>`;
```

Also `?selected` on `<option>`, `?indeterminate` on checkboxes and `?open` on
`<details>`/`<dialog>`.

## Props: `prop.*` builders

Props are declared with builders over [Standard Schema](https://standardschema.dev).
Attribute values are always parsed and validated; an invalid value is logged and treated as
missing. **Default attribute names are now kebab-case** (`minPrice` reads `min-price`; Lit read
`minprice`): update the markup, or pass `attribute: 'minprice'`.

```text
// 0.2: Lit property declarations
props: {
  label: { type: String, required: true },
  step: { type: Number, default: 1 },
  items: { attribute: false, default: [] },
}
```

```ts
import { define, html, prop } from '@gyral/core';
import * as v from 'valibot';

interface Props {
  readonly label: string;
  readonly step: number;
  readonly items: readonly string[];
}

export const Stepper = define<{ readonly value: number }, { readonly _tag: 'Bump' }, Props>(
  'my-stepper',
  {
    props: {
      label: prop.string({ required: true }),
      step: prop.number({ default: 1 }),
      items: prop.value(v.array(v.string()), { default: [] }), // property only
    },
    init: () => ({ value: 0 }),
    intent: { Bump: () => ({ _tag: 'Bump' }) },
    update: { Bump: (s, _m, { props }) => ({ value: s.value + props.step }) },
    view: (s, i, { props }) =>
      html`<button type="button" data-intent=${i.Bump}>${props.label}: ${s.value}</button>
        <p>${props.items.length} items</p>`,
  },
);
```

`prop.boolean()` is presence-based and defaults to `false`; `prop.json(schema)` parses JSON
from an attribute. `PropsChanged` and props as `ctx.props` are unchanged.

## Lists: `each`, pure rows, `pick` and `intents`

`each(items, key, row, pick?)` replaces `repeat` and `keyed`. A row re-renders only when its
item or its `pick` result changes, so a row may read only its arguments and module-level
values. Name intents in rows with a module-level `intents<Msg>()`; pass view values (the
selection) through `pick`. ESLint's `gyral/each-row-purity` names every read to move.

```text
// 0.2
${repeat(s.todos, (t) => t.id, (t) =>
  html`<li class=${classMap({ selected: t.id === s.selected })}>
    <button data-intent=${i.Pick} value=${t.id}>${t.text}</button></li>`)}
```

```ts
import { define, each, html, intents } from '@gyral/core';

interface Todo {
  readonly id: number;
  readonly text: string;
}
interface State {
  readonly todos: readonly Todo[];
  readonly selected: number;
}
type Msg = { readonly _tag: 'Pick'; readonly id: number };

const i = intents<Msg>();

const Row = (t: Todo, selected: boolean) =>
  html`<li class=${selected ? 'selected' : ''}>
    <button type="button" value=${t.id} data-intent=${i.Pick}>${t.text}</button>
  </li>`;

export const Todos = define<State, Msg>('my-todos', {
  init: () => ({ todos: [{ id: 1, text: 'Write docs' }], selected: 1 }),
  intent: { Pick: ({ value }) => ({ _tag: 'Pick', id: Number(value) }) },
  update: { Pick: (s, m) => ({ ...s, selected: m.id }) },
  view: (s) =>
    html`<ul>
      ${each(
        s.todos,
        (t) => t.id,
        Row,
        (t) => t.id === s.selected,
      )}
    </ul>`,
});
```

For `keyed(id, template)` (a fresh element when an id changes), render a one-item `each`:
`each([s.item], (it) => it.id, Item)`.

## Hooks instead of directives

Element directives become hooks: small behaviours on the element they sit in, with an optional
server half that adds attributes to the server-rendered start tag. `invalid(errors)` and
`labelledBy(id)` are hooks now; the call sites don't change.

```ts
import { defineHook, html } from '@gyral/core';

/** Scrolls the element into view when `active` turns true. */
export const scrollWhen = defineHook<[active: boolean]>({
  client: (el, [active], prev) => {
    if (active && prev?.[0] !== true) el.scrollIntoView({ block: 'nearest' });
  },
});

export const step = (current: boolean) => html`<li ${scrollWhen(current)}>Step</li>`;
```

## Styles: `css`

- `${value}` inside `css` inserts strings and numbers as written, and another `css` value as
  its text, so `unsafeCSS` is gone. CSS is trusted author code: never interpolate user input.
- `styles` accepts `css` values, strings (`import base from './base.css?inline'`) and arrays of
  them. `CSSStyleSheet` objects are no longer accepted (the server can't read them): share the
  `css` value instead; each one maps to one shared sheet.

```ts
import { css } from '@gyral/core';

const SPEED_MS = 600;
const tokens = css`
  :host {
    --accent: oklch(55% 0.18 260);
  }
`;

export const styles = css`
  ${tokens}
  li {
    transition: color ${SPEED_MS}ms ease-out;
  }
`;
```

## Light components and their children

A `shadow: false` component owns all its children. The server now throws when a template
writes children inside a light component's tag (whitespace is dropped), and the browser
reports a hydration mismatch. Pass the data as props instead. Shadow components still take
children for their `<slot>`s.

## Tests: `settled()`

`await settled()` (from `@gyral/core`) waits until every component has rendered, view
transitions and lazily loaded code included. It replaces `await el.updateComplete` and loops
over several elements.

```ts
import { settled } from '@gyral/core';

export async function clickAndWait(button: HTMLButtonElement): Promise<void> {
  button.click();
  await settled();
}
```

`@gyral/testing`: `hydrated(page)` now just waits for `settled()`; it no longer awaits
`updateComplete` on other custom elements (await your own Lit elements yourself) and takes
`{ releaseIslands: true }` to hydrate pending islands. `mountSsr` no longer ignores Lit's
dev-mode console banner.

## Server rendering

Rendering is Gyral's own (`@gyral/core/server`): synchronous, no DOM shim, any runtime with
WebCrypto. `@gyral/ssr` keeps `renderPage`, `renderToString`, `renderToStream`, `page`,
`formAction` and `@gyral/ssr/static`, and writes every template with core's `html`:

```ts
import { html } from '@gyral/core';
import { contentSecurityPolicy, renderPage } from '@gyral/ssr';

const styles = ':root { color-scheme: light dark; }';

export async function home(): Promise<Response> {
  return renderPage({
    title: 'Home',
    styles,
    head: html`<link rel="icon" href="/favicon.svg" />`, // was serverHtml`…`
    body: html`<my-home></my-home>`,
    scripts: ['/src/entry-client.ts'],
    csp: await contentSecurityPolicy({ styles, directives: { 'default-src': "'self'" } }),
  });
}
```

- **CSP helper:** shadow components' `<style>` elements are allowed by hash, so `style-src`
  needs no `'unsafe-inline'` any more.
- **Preloading:** in production, read the entry and its preloads from the Vite manifest with
  `clientAssetsFromManifest()` and pass `modulepreload` to `renderPage`
  ([ssr reference](../../skills/gyral/references/ssr.md)); `productionServer` hands
  `{ clientEntry, modulepreload }` to `createApp`.
- A `Promise` anywhere in a view is an error: load data in the handler first, as before.
- Development output (Vite's dev server, Vitest) carries `<!--gyral:ID-->` markers; production
  output is the template HTML plus values. Regenerate golden SSR fixtures.

## Hydration

- **No hydration import, no evaluation-order rules.** The client entry imports the components;
  each server-rendered component adopts its DOM in place, on its own, whether its parent has
  hydrated or not.
- **Mismatches** between server markup and the first client render throw `HydrationMismatch`
  in development (with the tag, template location, DOM path, expected and found). Production
  re-renders only that component and warns. Typical causes: a view that reads the clock or
  randomness, or a third party that edits the page before scripts run.
- **Islands** (`hydrate: 'idle' | 'visible' | 'interaction'`) may sit anywhere, also inside
  other components. Components inside a pending island hydrate on their own at load; only the
  island waits.
- The hydration code is a lazily loaded chunk, fetched only by pages with server-rendered
  components.

## Size and budgets

Gzip, production builds with the preset (`pnpm size`; "initial" is the entry chunk and its
static imports, what a page loads before any `import()`):

| Bundle                   | 0.2.0 | 0.3: initial | 0.3: all chunks |
| ------------------------ | ----- | ------------ | --------------- |
| hello-world              | 12.2  | 8.9          | 11.3            |
| isomorphic (SSR)         | 17.3  | 13.0         | 15.6            |
| no-js-first (SSR, forms) | 18.7  | 16.8         | 19.3            |

Features load with the API that uses them (`each`, `raw`, hooks, `command()`, stores, prop
builders), so small apps shed the most. If you keep a size budget, budget the initial chunk;
the lazy hydration chunk (about 2.8 KiB) only loads on server-rendered pages.
