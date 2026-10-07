# Components: `define()`

`define<S, M, P, O>(tag, spec)` compiles a spec into a plain custom element (an `HTMLElement`
subclass), registers it under `tag`, and returns the class. Type parameters: `S` state, `M`
message union, `P` props (default `object`; inferred from the `prop.*` builders when you pass
no type arguments), `O` outputs a child emits to its parent (default `never`; emit them with
`const emit = outputs<O>()`, composition.md). Rendering goes
through one global scheduler: reducers run at once, the DOM updates in a microtask; tests
`await settled()`.

## Spec fields

| Field                             | Required                     | Meaning                                                                         |
| --------------------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| `init(props)`                     | yes, unless `S` accepts `{}` | Initial state, optionally `[state, commands]`                                   |
| `intent`                          | yes (may be `{}`)            | Parsers keyed by message tag: DOM event → message                               |
| `update`                          | yes                          | One pure reducer per message tag (exhaustive), plus optional framework reducers |
| `view(state, intents, ctx)`       | yes                          | Pure template; `ctx.props`, `ctx.read(store)`                                   |
| `props`                           | no                           | `prop.*` builders (Standard Schema), with the `required`/`default` rule         |
| `styles`                          | no                           | `css` values, CSS strings, or arrays of them (shadow DOM only)                  |
| `shadow`                          | no                           | `false` renders into light DOM (page-level content). Default `true`             |
| `hydrate`                         | no                           | `'load'` (default), `'idle'`, `'visible'`, `'interaction'` for SSR islands      |
| `events`                          | no                           | Extra event types a bound `data-intent-on=${…}` may produce (see intent.md)     |
| `drivers`                         | no                           | Driver substitutions by name for every instance                                 |
| `stores`                          | no                           | Stores this component reads and writes                                          |
| `viewTransition(prev, next, msg)` | no                           | `true` renders that change inside a View Transition                             |
| `states(state)`                   | no                           | Boolean custom states for CSS: `:host(:state(loading))`                         |
| `renderOnFrame`                   | no                           | Message tags (or `'StoreChanged'`) from bursty sources: render once per frame   |

## Props

Declare props with `prop.*` builders. Types come from the builders: a prop without `required`
or `default` includes `undefined` (it is unset until a parent, an attribute or a seed sets it).

```ts
import { define, html, prop, type PropsOf } from '@gyral/core';

const props = {
  label: prop.string({ required: true }), // attribute "label"
  step: prop.number({ default: 1 }), // attribute "step"
  hint: prop.string(), // string | undefined
  maxValue: prop.number({ default: 10 }), // attribute "max-value" (kebab-case)
  compact: prop.boolean(), // present → true, absent → false
};
type Props = PropsOf<typeof props>;

interface State {
  readonly value: number;
}
type Msg = { readonly _tag: 'Bump' };

export const Stepper = define<State, Msg, Props>('my-stepper', {
  props,
  init: () => ({ value: 0 }),
  intent: { Bump: () => ({ _tag: 'Bump' }) },
  update: {
    Bump: (s, _m, { props: p }) => ({ value: Math.min(s.value + p.step, p.maxValue) }),
  },
  view: (s, i, { props: p }) => html`
    <button type="button" class=${p.compact ? 'compact' : ''} data-intent=${i.Bump}>
      ${p.label}: ${s.value}
    </button>
    ${p.hint === undefined ? '' : html`<small>${p.hint}</small>`}
  `,
});
```

| Builder                     | Attribute parsing                   | Attribute name |
| --------------------------- | ----------------------------------- | -------------- |
| `prop.string(opts?)`        | as is                               | kebab-case     |
| `prop.number(opts?)`        | `Number(v)`; empty or `NaN` invalid | kebab-case     |
| `prop.boolean(opts?)`       | present → `true`, absent → `false`  | kebab-case     |
| `prop.json(schema, opts?)`  | `JSON.parse`, then the schema       | kebab-case     |
| `prop.value(schema, opts?)` | none: property only (`.items=${…}`) | none           |

`prop.json` and `prop.value` also take a plain type guard instead of a schema:
`prop.value(isSeat, { required: true })` with `const isSeat = (u: unknown): u is Seat => …`.

Options: `schema` (refines `string`/`number`/`boolean`, e.g. `v.picklist([...])`),
`attribute` (a name, or `false` for property only), `required`, `default`. Any Standard Schema
library works (valibot, zod, …); schemas must be synchronous and should validate, not transform.

- **Attributes are always validated** (they're external strings). Property sets and hydration
  seeds are validated in development only. An invalid value is logged and treated as missing.
- **A property set keeps the object it was given** (`el.item === item`): development checks it
  and stores the input, production skips the schema. So schemas for properties must check, not
  decode (no `Date` parsing, defaults or key stripping there); a type guard is enough.
- No reflection: props never write attributes. State that CSS needs goes through `states`.
- Objects and arrays travel as properties: `prop.value(v.array(Item), { default: [] })` and
  `.items=${s.items}` in the parent.
- Don't name props after built-in element properties (`hidden`, `title`, `id`): it's an error
  in development, because setting them changes platform behaviour.

A `default` replaces only `undefined`: setting a defaulted prop to `undefined` (or removing its
attribute) brings the default back, so `undefined` can't mean "nobody on purpose". Use `null`
for that, with a nullable schema: `owner: prop.value(v.nullable(User), { default: team })`,
then `.owner=${null}` (or `prop.json(…)` and the attribute `owner="null"`).

## Stateless components

`Stateless` (an empty record) makes `init` optional; use `never` when there are no messages:

```ts
import { define, html, prop, type Stateless } from '@gyral/core';

export const Badge = define<Stateless, never, { readonly text: string }>('my-badge', {
  props: { text: prop.string({ default: '' }) },
  intent: {},
  update: {},
  view: (_s, _i, { props }) => html`<span class="badge">${props.text}</span>`,
});
```

## Styles

Shadow components take `styles`: `css` values, plain CSS strings (e.g. a `?inline` import) or
nested arrays of them. Each `css` value maps to one `CSSStyleSheet`, shared by every component
and instance that uses it. Strings and numbers interpolate as written (`${GAP}px`); CSS is
trusted author code, never user input. Theme through inherited custom properties and
`::part()`. Wrap rules in `@layer component` so app themes win predictably.

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
