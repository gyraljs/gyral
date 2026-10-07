# Views

`view(state, intents, ctx)` returns an `html` template from `@gyral/core` (Gyral's own view
layer). It is a pure function: no event handlers, no `this`, no fetching, no reading the DOM.
Compute derived values in plain helper functions of state.

## Template rules

| Need                              | Write                                                                |
| --------------------------------- | -------------------------------------------------------------------- |
| Name an intent                    | `data-intent=${i.Save}` — never `@click=${…}` or other closures      |
| Text, attributes                  | `${value}`, `attr=${value}`; `null`/`undefined`/`nothing` remove it  |
| Several pieces in one attribute   | `class="btn ${s.kind}"` (quoted)                                     |
| Presence-only attribute           | `?disabled=${s.busy}`                                                |
| Data for a child Gyral component  | `.items=${s.items}` (property binding; data, never functions)        |
| Text input value                  | `value=${s.text}` — live: written whenever the model's value changes |
| Checkbox/radio, option, indeterm. | `?checked=${s.on}`, `?selected=${…}`, `?indeterminate=${…}`          |
| `<details>`/`<dialog>` open       | `?open=${s.open}`                                                    |
| `<textarea>` content              | `<textarea name="note">${s.note}</textarea>`                         |
| Keyed list                        | `each(items, (it) => it.id, Row, pick?)`                             |
| Trusted markup (Markdown output)  | `raw(html)` — never user input                                       |
| Behaviour on the element itself   | an element hook: `<input ${invalid(errors)}>`, `defineHook(…)`       |

- `false`, `null`, `undefined` and `nothing` render nothing in a child hole, so
  `${s.open && html`…`}` works. `true` renders nothing and warns in development.
- Never bind form state with properties (`.value=`, `.checked=`): the server drops property
  bindings on plain elements. Use the attribute spellings above.
- Never pass functions in holes: `.onclick=${fn}` or `.format=${fn}` on a Gyral component warns
  in development (props are data and travel in hydration seeds), and the ESLint rule reports
  `${() => …}` anywhere in a template. Events are intents; behaviour on an element is a hook.
  (A third-party custom element whose API takes a callback is the exception.)
- Form state is written only when the model's value for it changes (then it overwrites the
  user's edit). A render for any other reason leaves what the user typed or toggled alone, and
  so does a refused edit (the reducer kept the state). To put a control back, change the model:
  clamp to a different value, or re-create the form with a key (`references/forms.md`).
- Classes and inline styles are plain strings: `class=${s.done ? 'done' : ''}`,
  `style="--w: ${s.width}px"`. (`classMap` and `styleMap` may return if a real need appears.)
- Graphics: write the whole `<svg>` inline in `html`. An SVG fragment that is its own template
  (shown conditionally or per list item inside an `<svg>`) uses `svg` (below).
- With `gyralVitePreset()`, `vite build` compiles templates and reports rule errors at build
  time (docs/design-docs/view/09-template-rules.md); dev and tests use the same rules at runtime.
- `@gyral/core/eslint` reports the same rule errors in the editor, with the same messages,
  flags `each` rows that read the view's scope (`gyral/each-row-purity`), and warns about
  intent parsers that no template in the module names (`gyral/unused-intent`). Enable it once:

```ts
// eslint.config.ts (eslint.config.js works the same)
import gyral from '@gyral/core/eslint';

export default [{ files: ['src/**/*.ts'], ...gyral.configs.recommended }];
```

## Lists: `each` with pure rows

`each(items, key, row, pick?)` is the only keyed list. A row re-renders only when its item
object or its `pick` result changes, so **a row may read only its parameters, module-level
bindings and imports**. Intent names come from a module-level `const i = intents<Msg>()` (the
same names the view gets as `i`); anything else from the view's scope (`s`, `ctx`) goes through
`pick` and arrives as the row's second argument (the ESLint rule says which name to move). Plain
arrays still render, by position.

```ts
import { define, each, html, intents } from '@gyral/core';

interface Todo {
  readonly id: number;
  readonly text: string;
  readonly done: boolean;
}
interface State {
  readonly todos: readonly Todo[];
  readonly selected: number;
  readonly note: string;
}
type Msg =
  | { readonly _tag: 'Toggle'; readonly id: number }
  | { readonly _tag: 'Note'; readonly note: string };

// Intent names as a module constant, so rows can use them and stay pure.
const i = intents<Msg>();

// A pure row: module-level, reads only (todo, selected) and module constants.
const Row = (t: Todo, selected: boolean) =>
  html`<li class=${selected ? 'selected' : ''}>
    <label>
      <input type="checkbox" value=${t.id} ?checked=${t.done} data-intent=${i.Toggle} />
      ${t.text}
    </label>
  </li>`;

export const Todos = define<State, Msg>('my-todos', {
  init: () => ({ todos: [{ id: 1, text: 'Write docs', done: false }], selected: 1, note: '' }),
  intent: {
    Toggle: ({ value }) => {
      const id = Number(value);
      return Number.isInteger(id) ? { _tag: 'Toggle', id } : undefined;
    },
    Note: ({ value }) => ({ _tag: 'Note', note: value ?? '' }),
  },
  update: {
    Toggle: (s, m) => ({
      ...s,
      todos: s.todos.map((t) => (t.id === m.id ? { ...t, done: !t.done } : t)),
    }),
    Note: (s, m) => ({ ...s, note: m.note }),
  },
  view: (s) => html`
    <ul aria-label="Todos">
      ${each(
        s.todos,
        (t) => t.id,
        Row,
        (t) => t.id === s.selected,
      )}
    </ul>
    <label for="note">Note</label>
    <textarea id="note" name="note" rows="3" data-intent=${i.Note}>${s.note}</textarea>
  `,
});
```

Keys must be unique strings or numbers (duplicates are a development error). `pick` results
are compared one level deep (`Object.is` per element or key), so returning a small object or
tuple is fine.

## SVG fragments: `svg`

`svg` (from `@gyral/core`, since 0.3.1) is `html` for SVG fragments: its top level is SVG
content, so `<path />`, `<g>`, `<text>`, `<clipPath>` are SVG elements, self-closing tags are
fine and SVG's camelCase names stay. Render an `svg` result **only inside an `<svg>`** (or
another SVG element other than `<foreignObject>`): a development error anywhere else. HTML at an
`svg` template's top level is a template error; HTML goes in `<foreignObject>` as an `html`
template. Bind `href=${…}`, not `xlink:href=${…}` (an error).

```ts
import { define, each, html, nothing, svg } from '@gyral/core';

interface Card {
  readonly id: number;
  readonly suit: 'circle' | 'square' | undefined;
  readonly name: string;
}

// Fragments are plain functions returning svg results; rows of `each` stay pure.
const mark = (suit: 'circle' | 'square') =>
  suit === 'circle'
    ? svg`<circle cx="5" cy="5" r="3" />`
    : svg`<rect x="2" y="2" width="6" height="6" />`;
const face = (c: Card) => svg`<g transform="translate(${(c.id - 1) * 12} 0)">
  ${c.suit === undefined ? nothing : mark(c.suit)}
  <text x="1" y="13">${c.name}</text>
</g>`;

export const Hand = define<{ readonly cards: readonly Card[] }, never>('my-hand', {
  init: () => ({ cards: [{ id: 1, suit: 'circle', name: 'Han' }] }),
  intent: {},
  update: {},
  view: (s) =>
    html`<svg viewBox="0 0 ${s.cards.length * 12} 14" role="img" aria-label="Hand">
      ${each(s.cards, (c) => c.id, face)}
    </svg>`,
});
```

## Element hooks

A hook is a small behaviour attached to the element it sits on, written in the start tag. Core
ships `invalid(errors)` (forms.md) and `labelledBy(id, fallback?)`. Write your own with
`defineHook`: `client(el, args, prev)` runs after the commit whenever the arguments change
(`prev` is `undefined` the first time); the optional `server(args)` returns attributes for the
server-rendered start tag. A hook that must tear down is defined with `defineDisposableHook`
instead, which adds `dispose(el, args)` (below). A hook acts only on its own element.

```ts
import { defineHook, define, html } from '@gyral/core';

/** Scrolls the element into view when `active` turns true. */
export const scrollWhen = defineHook<[active: boolean]>({
  client: (el, [active], prev) => {
    if (active && prev?.[0] !== true) el.scrollIntoView({ block: 'nearest' });
  },
});

interface State {
  readonly current: number;
}
type Msg = { readonly _tag: 'Next' };

export const Steps = define<State, Msg>('my-steps', {
  init: () => ({ current: 0 }),
  intent: { Next: () => ({ _tag: 'Next' }) },
  update: { Next: (s) => ({ current: (s.current + 1) % 3 }) },
  view: (s, i) => html`
    <ol>
      <li ${scrollWhen(s.current === 0)}>One</li>
      <li ${scrollWhen(s.current === 1)}>Two</li>
      <li ${scrollWhen(s.current === 2)}>Three</li>
    </ol>
    <button type="button" data-intent=${i.Next}>Next</button>
  `,
});
```

## Widgets with a lifecycle: their own element, or a disposable hook

Anything with setup and teardown (a Three.js or WebGL stage, a chart or map library, an
observer, a connection) belongs in **its own custom element**: one input property, its own
state, teardown in `disconnectedCallback`. The platform tells it about every connect,
disconnect and move, and the Gyral view stays a pure description that passes data down:

```ts
import { define, html } from '@gyral/core';

interface Scene {
  readonly cubes: number;
}

/** The widget: one property in, its own lifecycle. */
class StageElement extends HTMLElement {
  #scene: Scene = { cubes: 0 };
  #frame = 0;

  set view(scene: Scene) {
    this.#scene = scene;
    this.#schedule();
  }

  connectedCallback(): void {
    this.#schedule(); // set up renderer, canvas, observers here
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#frame); // dispose renderer, GPU buffers, listeners here
  }

  #schedule(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => {
      this.textContent = `${String(this.#scene.cubes)} cubes`;
    });
  }
}
customElements.define('my-stage', StageElement);

interface State {
  readonly scene: Scene;
}
type Msg = { readonly _tag: 'Add' };

export const Game = define<State, Msg>('my-game', {
  init: () => ({ scene: { cubes: 1 } }),
  intent: { Add: () => ({ _tag: 'Add' }) },
  update: { Add: (s) => ({ scene: { cubes: s.scene.cubes + 1 } }) },
  view: (s, i) => html`
    <my-stage .view=${s.scene}></my-stage>
    <button type="button" data-intent=${i.Add}>Add a cube</button>
  `,
});
```

The widget reports back with events: dispatch `OUTPUT_EVENT` with a tagged `detail` and the
parent parses it like a child component's output (composition.md). It can be a Gyral component
itself (`prop.value` input, `outputs<Out>()`) when it has a model of its own.

For a **small imperative behaviour** on an element of the view, a hook with a teardown is the
lighter option: `defineDisposableHook` takes `dispose(el, args)` next to `client`. It runs when
Gyral removes the element (its part cleared, its template replaced, its row removed), when the
position stops holding the hook, and when the host disconnects; never on moves (`moveBefore`,
list reorders). After a host reconnects, `client` runs again with `prev` undefined. `defineHook`
takes no `dispose` (a type error, and a development error), so apps without teardowns don't
bundle the tracking.

```ts
import { defineDisposableHook } from '@gyral/core';

const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/** Highlights the element for a moment whenever `value` changes. */
export const flash = defineDisposableHook<[value: unknown]>({
  client: (el, _args, prev) => {
    if (prev === undefined) return; // not on first render
    el.classList.add('flash');
    clearTimeout(timers.get(el));
    timers.set(
      el,
      setTimeout(() => {
        el.classList.remove('flash');
      }, 600),
    );
  },
  dispose: (el) => {
    clearTimeout(timers.get(el));
  },
});
```

## Naming a component's form from the page

`aria-labelledby` inside a shadow root can't see ids in the page. `labelledBy(id)` resolves the
id outward through the shadow-including ancestors (element reflection, with an `aria-label`
fallback):

```ts
import { define, html, labelledBy, type Stateless } from '@gyral/core';

// Page markup: <h1 id="page-title">Checkout</h1> <my-checkout-form></my-checkout-form>
export const CheckoutForm = define<Stateless, never>('my-checkout-form', {
  intent: {},
  update: {},
  view: () => html`<form ${labelledBy('page-title')}><button>Pay</button></form>`,
});
```

## Focus after a change

Moving focus is a side effect, so it's a command that runs after the render:

```ts
import { define, focus, html } from '@gyral/core';

interface State {
  readonly page: number;
}
type Msg = { readonly _tag: 'Next' };

export const Pager = define<State, Msg>('my-pager', {
  init: () => ({ page: 1 }),
  intent: { Next: () => ({ _tag: 'Next' }) },
  update: {
    Next: (s) => [{ page: s.page + 1 }, [focus('h2', { preventScroll: true })]],
  },
  view: (s, i) => html`
    <h2 tabindex="-1">Page ${s.page}</h2>
    <button type="button" data-intent=${i.Next}>Next page</button>
  `,
});
```

## Semantics and accessibility

Use real elements: `<button type="button">` for actions, `<a href>` for navigation, `<form>`
with `<label>`s, `<output aria-live="polite">` for changing numbers, `role="status"` /
`role="alert"` for async results, `<search>`, `<menu>`, `<dialog>`, popovers. Gyral's intents
work with all of them, including keyboard activation, because they ride on native events.
