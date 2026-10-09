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
  The client writes `style` through the CSSOM, so a strict CSP (`style-src` without
  `'unsafe-inline'`) doesn't block client renders or updates. It does block the `style`
  attributes in server-rendered HTML until hydration re-applies them: prefer classes or data
  attributes over a value set (`class="tile v-${n}"`), and keep inline styles to custom
  properties whose stylesheet has a fallback (`inline-size: var(--w, auto)`)
  (`references/ssr.md` "Content-Security-Policy").
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
bindings and imports**. Intent names come from a module-level `const i = intentsOf<typeof C>()`
(the same names component `C`'s view gets as `i`; a row that uses it declares its return type,
`TemplateResult`, or the row and `C`'s type infer each other); anything else from the view's scope (`s`, `ctx`) goes through
`pick` and arrives as the row's second argument (the ESLint rule says which name to move). Plain
arrays still render, by position.

```ts
import { define, each, html, intentsOf, type TemplateResult } from '@gyral/core';

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
const i = intentsOf<typeof Todos>();

// A pure row: module-level, reads only (todo, selected) and module constants.
const Row = (t: Todo, selected: boolean): TemplateResult =>
  html`<li class=${selected ? 'selected' : ''}>
    <label>
      <input type="checkbox" value=${t.id} ?checked=${t.done} data-intent=${i.Toggle} />
      ${t.text}
    </label>
  </li>`;

export const Todos = define<State, Msg>()('my-todos', {
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
  // The view uses its own `i`; the module constant is for rows.
  view: (s, i) => html`
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

### `.map` or `each`?

- **`.map`** renders by position: fine for short lists whose items don't move (a few options, a
  breadcrumb, table headers). Its rows may read anything in the view's scope, since every row
  runs on every render. Keep them cheap: no sorting or filtering inside the row, compute that
  once above the template.
- **`each`** for lists that are long, change often, or reorder (results, inboxes, kanban
  columns): keyed, so a moved item keeps its element (focus, input state, animations), and a row
  re-renders only when its item or `pick` result changes. That second point is why `each` rows
  must be pure; the ESLint rule `gyral/each-row-purity` checks `each` rows only.

Keys must be unique strings or numbers (duplicates are a development error). `pick` results
are compared one level deep (`Object.is` per element or key), so returning a small object or
tuple is fine.

### Moving items between lists

A task that moves from one kanban column (one `each` list) to another is a new element in the second list, so the
browser can't animate it by itself. A FLIP hook can: it remembers where each key last was and,
when its element appears somewhere else, plays the move with the Web Animations API. Give it
the item's slot so it also runs when the item shifts inside its list:

```ts
import { define, defineHook, each, html, intentsOf, type TemplateResult } from '@gyral/core';

/** Where each key was last seen, in page coordinates. */
const seen = new Map<string, { readonly x: number; readonly y: number }>();

/** Animates the element from where `key` was last seen to where it is now. */
export const flip = defineHook<[key: string, slot: number]>({
  client: (el, [key]) => {
    const box = el.getBoundingClientRect();
    const now = { x: box.left + scrollX, y: box.top + scrollY };
    const before = seen.get(key);
    seen.set(key, now);
    if (before === undefined || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const dx = before.x - now.x;
    const dy = before.y - now.y;
    if (dx === 0 && dy === 0) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
      duration: 200,
      easing: 'ease-out',
    });
  },
});

interface Task {
  readonly id: string;
  readonly label: string;
}
interface State {
  readonly todo: readonly Task[];
  readonly done: readonly Task[];
}
type Msg = { readonly _tag: 'Move'; readonly id: string };

const i = intentsOf<typeof Board>();

const TaskRow = (t: Task, slot: number): TemplateResult =>
  html`<li ${flip(t.id, slot)}>
    <button type="button" value=${t.id} data-intent=${i.Move}>${t.label}</button>
  </li>`;

const column = (label: string, tasks: readonly Task[]): TemplateResult =>
  html`<ul aria-label=${label}>
    ${each(
      tasks,
      (t) => t.id,
      TaskRow,
      (t) => tasks.indexOf(t),
    )}
  </ul>`;

export const Board = define<State, Msg>()('my-board', {
  init: () => ({
    todo: [
      { id: 'a', label: 'Write' },
      { id: 'b', label: 'Test' },
    ],
    done: [],
  }),
  intent: { Move: ({ value }) => (value ? { _tag: 'Move', id: value } : undefined) },
  update: {
    Move: (s, { id }) => {
      const task = [...s.todo, ...s.done].find((t) => t.id === id);
      if (task === undefined) return s;
      return s.todo.includes(task)
        ? { todo: s.todo.filter((t) => t !== task), done: [...s.done, task] }
        : { done: s.done.filter((t) => t !== task), todo: [...s.todo, task] };
    },
  },
  view: (s) => html`${column('To do', s.todo)} ${column('Done', s.done)}`,
});
```

- The hook runs only when its arguments change: for a new element (the task in its new column)
  and for tasks whose slot changed. Tasks that move because the layout changed around them
  (a resize, a column that grew) aren't animated.
- `seen` keeps keys of deleted items; clear it when the board is reloaded.
- The native way is a View Transition: `viewTransition` (components.md) runs a render inside
  `document.startViewTransition`, and a task whose `view-transition-name` is the same before
  and after (a style binding on the row, `style="view-transition-name: task-${t.id}"`)
  morphs from its old place to its new one. Same-document View Transitions are only newly Baseline, so keep the hook as the
  fallback for now. A built-in for moves between lists is planned for 0.4.

## SVG fragments: `svg`

`svg` (from `@gyral/core`, since 0.3.1) is `html` for SVG fragments: its top level is SVG
content, so `<path />`, `<g>`, `<text>`, `<clipPath>` are SVG elements, self-closing tags are
fine and SVG's camelCase names stay. Render an `svg` result **only inside an `<svg>`** (or
another SVG element other than `<foreignObject>`): a development error anywhere else. HTML at an
`svg` template's top level is a template error; HTML goes in `<foreignObject>` as an `html`
template. Bind `href=${…}`, not `xlink:href=${…}` (an error).

```ts
import { define, each, html, nothing, svg } from '@gyral/core';

interface Service {
  readonly id: number;
  readonly status: 'up' | 'down' | undefined;
  readonly name: string;
}

// Fragments are plain functions returning svg results; rows of `each` stay pure.
const mark = (status: 'up' | 'down') =>
  status === 'up'
    ? svg`<circle cx="5" cy="5" r="3" />`
    : svg`<rect x="2" y="2" width="6" height="6" />`;
const tile = (service: Service) => svg`<g transform="translate(${(service.id - 1) * 12} 0)">
  ${service.status === undefined ? nothing : mark(service.status)}
  <text x="1" y="13">${service.name}</text>
</g>`;

export const StatusStrip = define<{ readonly services: readonly Service[] }, never>()(
  'my-status-strip',
  {
    init: () => ({ services: [{ id: 1, status: 'up', name: 'API' }] }),
    intent: {},
    update: {},
    view: (s) =>
      html`<svg viewBox="0 0 ${s.services.length * 12} 14" role="img" aria-label="Service status">
        ${each(s.services, (service) => service.id, tile)}
      </svg>`,
  },
);
```

## Element hooks

A hook is a small behaviour attached to the element it sits on, written in the start tag. Core
ships `invalid(errors)` (forms.md), `labelledBy(id, fallback?)` and `capturePointer()`
(press-and-release intents, intent.md). Write your own with
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

export const Steps = define<State, Msg>()('my-steps', {
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

### Custom properties

Pass values to CSS through a style binding: `<div class="bar" style="--fill: ${s.done / s.total}">`
with `inline-size: calc(var(--fill, 0) * 100%)` in the stylesheet. Style bindings are written
through the CSSOM, so they work under a Content-Security-Policy without `'unsafe-inline'` (0.3.1;
in server-rendered markup the policy blocks the attribute until the component hydrates, so keep
a stylesheet default such as `var(--fill, 0)`).
For the rare element whose inline style a hook writes too, a hook can set only the properties it
names:

```ts
import { defineHook } from '@gyral/core';

/** Sets the named custom properties, leaving the element's other inline styles alone. */
export const cssVars = defineHook<[vars: Readonly<Record<`--${string}`, string>>]>({
  client: (el, [vars]) => {
    for (const [name, value] of Object.entries(vars))
      (el as HTMLElement).style.setProperty(name, value);
  },
});
```

### Replaying a CSS animation

A CSS animation runs once when its element appears, so a "flash on change" (a counter that
pulses when it updates, a field that shakes on a rejected value) needs replaying. Count the
replays in state and restart the element's animations with the Web Animations API when the
count changes:

```ts
import { define, defineHook, html } from '@gyral/core';

/** Restarts the element's CSS animations whenever `count` changes (not on the first render). */
export const replay = defineHook<[count: number]>({
  client: (el, [count], prev) => {
    if (prev === undefined || prev[0] === count) return;
    for (const animation of el.getAnimations()) {
      animation.cancel();
      animation.play();
    }
  },
});

interface State {
  readonly unread: number;
  readonly pulses: number;
}
type Msg = { readonly _tag: 'Arrived' };

export const Inbox = define<State, Msg>()('my-inbox', {
  init: () => ({ unread: 0, pulses: 0 }),
  intent: { Arrived: () => ({ _tag: 'Arrived' }) },
  update: { Arrived: (s) => ({ unread: s.unread + 1, pulses: s.pulses + 1 }) },
  view: (s, i) => html`
    <output class="badge" ${replay(s.pulses)}>${s.unread}</output>
    <button type="button" data-intent=${i.Arrived}>Simulate a message</button>
  `,
  // .badge { animation: pulse 300ms ease-out; } in the component's styles
});
```

`getAnimations()` covers CSS animations and transitions on the element (pass
`{ subtree: true }` for its descendants). Without a hook, a keyed one-item list replays by
replacing the element: `each([s.pulses], String, Badge)` renders a new `<output>` per count, at
the cost of a new node (and its focus, if it had any).

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

export const SceneEditor = define<State, Msg>()('my-scene-editor', {
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
export const CheckoutForm = define<Stateless, never>()('my-checkout-form', {
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

export const Pager = define<State, Msg>()('my-pager', {
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

**Focusing into a child component.** `focus()` looks inside this component's own root, so it
can't reach an element in a child's shadow root. Give the child `shadow: { delegatesFocus: true }` and
focus the child itself: its first focusable element gets focus (0.3.1).

```ts
import { define, focus, html } from '@gyral/core';

// The child: focusing <my-name-field> focuses its input.
export const NameField = define<object, never>()('my-name-field', {
  shadow: { delegatesFocus: true },
  init: () => ({}),
  intent: {},
  update: {},
  view: () => html`<label>Name <input name="name" /></label>`,
});

type Msg = { readonly _tag: 'Edit' };

export const Profile = define<object, Msg>()('my-profile', {
  init: () => ({}),
  intent: { Edit: () => ({ _tag: 'Edit' }) },
  update: { Edit: (s) => [s, [focus('my-name-field')]] },
  view: (_s, i) => html`
    <button type="button" data-intent=${i.Edit}>Edit name</button>
    <my-name-field></my-name-field>
  `,
});
```

**Keeping focus across renders.** Focus stays only while the focused node does. Render
focusable rows with a keyed `each` (rows move instead of being recreated), and when the
focused item is removed (a deleted row), return a `focus()` command for its neighbour or the
list, or focus falls to the page body.

## Semantics and accessibility

Use real elements: `<button type="button">` for actions, `<a href>` for navigation, `<form>`
with `<label>`s, `<output aria-live="polite">` for changing numbers, `role="status"` /
`role="alert"` for async results, `<search>`, `<menu>`, `<dialog>`, popovers. Gyral's intents
work with all of them, including keyboard activation, because they ride on native events.
