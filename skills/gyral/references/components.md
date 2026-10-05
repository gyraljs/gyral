# Components: `define()`

`define<S, M, P, O>(tag, spec)` compiles a spec into a Lit custom element, registers it under
`tag`, and returns the class. Type parameters: `S` state, `M` message union, `P` props
(default `object`), `O` outputs a child emits to its parent (default `never`).

## Spec fields

| Field                             | Required                     | Meaning                                                                         |
| --------------------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| `init(props)`                     | yes, unless `S` accepts `{}` | Initial state, optionally `[state, commands]`                                   |
| `intent`                          | yes (may be `{}`)            | Parsers keyed by message tag: DOM event → message                               |
| `update`                          | yes                          | One pure reducer per message tag (exhaustive), plus optional framework reducers |
| `view(state, intents, ctx)`       | yes                          | Pure template; `ctx.props`, `ctx.read(store)`                                   |
| `props`                           | no                           | Lit property declarations, with Gyral's `required`/`default` rule               |
| `styles`                          | no                           | `css` templates, strings, `CSSStyleSheet`s or arrays (shadow DOM only)          |
| `shadow`                          | no                           | `false` renders into light DOM (page-level content). Default `true`             |
| `hydrate`                         | no                           | `'load'` (default), `'idle'`, `'visible'`, `'interaction'` for SSR islands      |
| `events`                          | no                           | Extra event types usable with `data-intent-on`                                  |
| `drivers`                         | no                           | Driver substitutions by name for every instance                                 |
| `stores`                          | no                           | Stores this component reads and writes                                          |
| `viewTransition(prev, next, msg)` | no                           | `true` renders that change inside a View Transition                             |
| `states(state)`                   | no                           | Boolean custom states for CSS: `:host(:state(loading))`                         |

## Props

A prop is `undefined` until a parent, an attribute or a seed sets it, so a prop whose type
excludes `undefined` must declare `required: true` or a `default`:

```ts
import { define, html } from '@gyral/core';

interface Props {
  readonly label: string; // required
  readonly step: number; // has a default
  readonly hint?: string | undefined; // may be missing
}
interface State {
  readonly value: number;
}
type Msg = { readonly _tag: 'Bump' };

export const Stepper = define<State, Msg, Props>('my-stepper', {
  props: {
    label: { type: String, required: true },
    step: { type: Number, default: 1 },
    hint: { type: String },
  },
  init: () => ({ value: 0 }),
  intent: { Bump: () => ({ _tag: 'Bump' }) },
  update: { Bump: (s, _m, { props }) => ({ value: s.value + props.step }) },
  view: (s, i, { props }) => html`
    <button type="button" data-intent=${i.Bump}>${props.label}: ${s.value}</button>
    ${props.hint === undefined ? '' : html`<small>${props.hint}</small>`}
  `,
});
```

Don't name props after built-in element properties (`hidden`, `title`, `id`): `define()` warns,
because setting them changes platform behaviour. Objects and arrays are passed as properties
(`.item=${it}`) and declared with `attribute: false`.

## Stateless components

`Stateless` (an empty record) makes `init` optional; use `never` when there are no messages:

```ts
import { define, html, type Stateless } from '@gyral/core';

export const Badge = define<Stateless, never, { readonly text: string }>('my-badge', {
  props: { text: { type: String, default: '' } },
  intent: {},
  update: {},
  view: (_s, _i, { props }) => html`<span class="badge">${props.text}</span>`,
});
```

## Styles

Shadow components take `styles` (constructable stylesheets shared across instances). Theme
through inherited custom properties and `::part()`. Wrap rules in `@layer component` so app
themes win predictably.

```ts
import { css, define, html, type Stateless } from '@gyral/core';

export const Card = define<Stateless, never>('my-card', {
  intent: {},
  update: {},
  view: () => html`<article part="card"><slot></slot></article>`,
  styles: css`
    @layer component {
      :host {
        display: block;
        --card-accent: oklch(55% 0.18 260);
      }
      article {
        border: 1px solid var(--card-accent);
        border-radius: 0.5rem;
        padding: 1rem;
      }
    }
  `,
});
```

## Light DOM (`shadow: false`)

For page-level components (listings, articles, landing sections): the view renders as the
element's own children, so document CSS applies and crawlers see plain HTML. No `<slot>`s and
no `styles` (ignored with a warning); style with document CSS, e.g. `@scope (my-page)`. Keep
widgets (buttons, popovers, form controls) in shadow DOM. Intents still belong to the nearest
Gyral host, so nested components keep their own intents.

```ts
import { define, html, type Stateless } from '@gyral/core';

export const AboutPage = define<Stateless, never>('my-about-page', {
  shadow: false,
  intent: {},
  update: {},
  view: () => html`
    <h1>About us</h1>
    <p>Plain children of the element: indexable and styled by the page.</p>
  `,
});
```

## Custom states and view transitions

```ts
import { css, define, html } from '@gyral/core';

type State = { readonly _tag: 'Idle' } | { readonly _tag: 'Loading' };
type Msg = { readonly _tag: 'Start' } | { readonly _tag: 'Done' };

export const Loader = define<State, Msg>('my-loader', {
  init: () => ({ _tag: 'Idle' }),
  intent: { Start: () => ({ _tag: 'Start' }) },
  update: {
    Start: () => ({ _tag: 'Loading' }),
    Done: () => ({ _tag: 'Idle' }),
  },
  // Exposed to CSS as :host(:state(loading)) and my-loader:state(loading).
  states: (s) => ({ loading: s._tag === 'Loading' }),
  // Animate only the Idle → Loading change.
  viewTransition: (prev, next) => prev._tag !== next._tag,
  view: (s, i) =>
    html`<button type="button" data-intent=${i.Start}>
      ${s._tag === 'Loading' ? 'Loading…' : 'Load'}
    </button>`,
  styles: css`
    :host(:state(loading)) button {
      opacity: 0.6;
    }
  `,
});
```

`Done` has no intent parser: it only arrives from a command (see update-and-commands.md).

## Typing the tag

Declare the tag so `document.createElement('my-…')` and `querySelector` are typed:

```ts
import { define, html, type Stateless } from '@gyral/core';

export const Hello = define<Stateless, never>('my-hello', {
  intent: {},
  update: {},
  view: () => html`<p>Hello</p>`,
});

declare global {
  interface HTMLElementTagNameMap {
    'my-hello': InstanceType<typeof Hello>;
  }
}
```

The class also carries `.spec` (the spec you passed), which `@gyral/testing` uses:
`step(Hello.spec, …)`.
