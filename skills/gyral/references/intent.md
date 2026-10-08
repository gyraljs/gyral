# Intent: DOM events → typed messages

The view names intents with `data-intent=${i.Tag}` (`i` is typed from the message union, so a
typo fails to compile). When that element's trigger event fires, Gyral calls the parser
`intent[Tag]` with an `IntentInput` and dispatches what it returns.

## Triggers

| Element                                                                 | Default trigger                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `<form>`                                                                | `submit` (default prevented; `formData` filled, including the submitter) |
| `<button>`, `<input type=button/submit/reset/image>`, any other element | `click`                                                                  |
| `<input>` (text-like), `<textarea>`                                     | `input`                                                                  |
| `<select>`, checkbox, radio                                             | `change`                                                                 |
| A child custom element                                                  | its outputs (`emit()` in the child)                                      |

Override with `data-intent-on`: `keydown`, `keyup`, `focusin`, `focusout`, `toggle`
(popover, `<details>`), `command` (invoker commands), `change`, `input`, `click`, `submit`.
Any other event type works too when written statically (`data-intent-on="pointerdown"`): the
component listens for the events its templates name. Only a type that comes from a bound
`data-intent-on=${…}` and isn't in the list above must be added to `spec.events`.

`data-intent-on` takes a list separated by spaces (0.3.1): `data-intent-on="keydown keyup"`
fires the intent for both, and the parser tells them apart with `event.type` (see "Press and
release" below).

### One element, an intent per event: `data-intent-<event>`

When each event on an element means something different, name an intent per event type
(0.3.1): `data-intent-pointerdown=${i.Grab} data-intent-keydown=${i.Key}`. For an event of type
T, an element's `data-intent-T` comes first; its plain `data-intent` (with `data-intent-on` or
its default trigger) handles the other events. Lookup still starts at the element that was hit
and goes outward: the nearest element with an intent for that event wins. A sortable list, where
one item handles the pointer (drag), the keyboard (move) and focus without wrapper elements:

```ts
import { define, each, html, intents } from '@gyral/core';

interface Task {
  readonly id: string;
  readonly title: string;
}
interface State {
  readonly tasks: readonly Task[];
  readonly dragging: string | undefined;
  readonly focused: string | undefined;
}
type Msg =
  | { readonly _tag: 'Grab'; readonly id: string }
  | { readonly _tag: 'Drop'; readonly id: string }
  | { readonly _tag: 'Move'; readonly id: string; readonly by: -1 | 1 }
  | { readonly _tag: 'Focus'; readonly id: string };

const i = intents<Msg>();

const TaskRow = (t: Task) =>
  html`<li
    tabindex="0"
    data-id=${t.id}
    data-intent-pointerdown=${i.Grab}
    data-intent-pointerup=${i.Drop}
    data-intent-keydown=${i.Move}
    data-intent-focusin=${i.Focus}
  >
    ${t.title}
  </li>`;

const idOf = (el: Element): string => el.getAttribute('data-id') ?? '';

/** Moves the task `id` to the place `to(from)` gives (clamped). */
const moved = (tasks: readonly Task[], id: string, to: (from: number) => number) => {
  const from = tasks.findIndex((t) => t.id === id);
  const task = tasks[from];
  if (task === undefined) return tasks;
  const rest = tasks.filter((t) => t !== task);
  const at = Math.max(0, Math.min(rest.length, to(from)));
  return [...rest.slice(0, at), task, ...rest.slice(at)];
};

export const Sortable = define<State, Msg>('my-sortable', {
  init: () => ({
    tasks: [
      { id: 'a', title: 'Write the brief' },
      { id: 'b', title: 'Review designs' },
    ],
    dragging: undefined,
    focused: undefined,
  }),
  intent: {
    Grab: ({ target }) => ({ _tag: 'Grab', id: idOf(target) }),
    // Released over another item: the dragged one moves there.
    Drop: ({ target }) => ({ _tag: 'Drop', id: idOf(target) }),
    // Alt+ArrowUp/Down moves the focused item; other keys keep their default.
    Move: ({ target, key, event }) => {
      const by = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
      if (by === 0 || !(event as KeyboardEvent).altKey) return undefined;
      event.preventDefault();
      return { _tag: 'Move', id: idOf(target), by };
    },
    Focus: ({ target }) => ({ _tag: 'Focus', id: idOf(target) }),
  },
  update: {
    Grab: (s, m) => ({ ...s, dragging: m.id }),
    Drop: (s, m) => {
      const onto = s.tasks.findIndex((t) => t.id === m.id);
      return s.dragging === undefined
        ? s
        : { ...s, dragging: undefined, tasks: moved(s.tasks, s.dragging, () => onto) };
    },
    Move: (s, m) => ({ ...s, tasks: moved(s.tasks, m.id, (from) => from + m.by) }),
    Focus: (s, m) => ({ ...s, focused: m.id }),
  },
  view: (s) =>
    html`<ul aria-label="Tasks">
      ${each(s.tasks, (t) => t.id, TaskRow)}
    </ul>`,
});
```

- The event type is in the attribute's name, so write it in lower case, as event types are
  (`data-intent-pointerdown`). The name `data-intent-on` is the event list, not an event.
- The component listens for the event types in these names, bound or static, also in list
  rows and `raw()` markup; no `spec.events` needed.
- `data-intent-keydown=${s.editing ? i.Key : nothing}` adds the intent only while editing.
- One intent for several events stays `data-intent` with a `data-intent-on` list, when the
  events share a message (press and release below).

## `IntentInput`

| Field             | Value                                                |
| ----------------- | ---------------------------------------------------- |
| `name`            | the `data-intent` value                              |
| `event`, `target` | the DOM event and the element carrying `data-intent` |
| `value`           | `value` of the input/select/textarea/button          |
| `checked`         | for checkbox and radio                               |
| `formData`        | for a `<form>` intent                                |
| `detail`          | any `CustomEvent`'s `detail` (a child's output)      |
| `key`             | `KeyboardEvent.key` for `keydown`/`keyup`            |
| `newState`        | `'open'`/`'closed'` for `toggle`                     |
| `command`         | invoker command info for `command` intents           |

Read the intent element from `target`, not from the event: Gyral listens on the component's
root, so `event.currentTarget` is that root (the shadow root), and `event.target` is whatever
was hit inside the element (the label's `<span>`, an icon).

## Parsers

A parser returns a message, `undefined` (decline the event), or an `IntentRejected` (via
`form()`/`field()`); it may be async. Validate here so reducers only see valid messages.

```ts
import { define, html } from '@gyral/core';

interface State {
  readonly query: string;
  readonly qty: number;
}
type Msg =
  | { readonly _tag: 'Typed'; readonly query: string }
  | { readonly _tag: 'Qty'; readonly qty: number }
  | { readonly _tag: 'Cancel' };

export const Filters = define<State, Msg>('my-filters', {
  init: () => ({ query: '', qty: 1 }),
  intent: {
    Typed: ({ value }) => ({ _tag: 'Typed', query: value ?? '' }),
    // Ignore anything that isn't a whole number in range.
    Qty: ({ value }) => {
      const qty = Number(value);
      return Number.isInteger(qty) && qty >= 1 && qty <= 99 ? { _tag: 'Qty', qty } : undefined;
    },
    // Only the Escape key cancels.
    Cancel: ({ key }) => (key === 'Escape' ? { _tag: 'Cancel' } : undefined),
  },
  update: {
    Typed: (s, m) => ({ ...s, query: m.query }),
    Qty: (s, m) => ({ ...s, qty: m.qty }),
    Cancel: (s) => ({ ...s, query: '' }),
  },
  view: (s, i) => html`
    <!-- keydown from the input bubbles to this wrapper: Escape clears the search. -->
    <div data-intent=${i.Cancel} data-intent-on="keydown">
      <label>
        Search
        <input type="search" value=${s.query} data-intent=${i.Typed} />
      </label>
    </div>
    <label>Qty <input type="number" min="1" max="99" value=${s.qty} data-intent=${i.Qty} /></label>
  `,
});
```

For a second trigger on the same control, put the second intent on a wrapper element (events
bubble to it: here, `keydown` from the input), or on the control itself with a per-event
attribute (`data-intent-keydown=${i.Cancel}`, above).

### Declining: `undefined` passes the event outward

Lookup starts at the element that was hit and goes outward, and the nearest element with an
intent for the event runs its parser. When that parser returns `undefined` **synchronously**,
it declines: the next element outward with an intent for the same event gets it, up to the
component's root (0.3.1; before, `undefined` ended the lookup). So a container's keyboard
shortcuts and its fields' own keys live together:

```ts
import { define, html } from '@gyral/core';

type Msg =
  | { readonly _tag: 'Move'; readonly by: -1 | 1 }
  | { readonly _tag: 'Rename'; readonly name: string };

export const Toolbar = define<{ readonly at: number }, Msg>('my-toolbar', {
  init: () => ({ at: 0 }),
  intent: {
    // The toolbar owns the arrow keys...
    Move: ({ key }) =>
      key === 'ArrowLeft'
        ? { _tag: 'Move', by: -1 }
        : key === 'ArrowRight'
          ? { _tag: 'Move', by: 1 }
          : undefined,
    // ...except where the field keeps a key: Enter commits, every other key declines (and
    // the arrows reach Move).
    Rename: ({ key, value }) =>
      key === 'Enter' ? { _tag: 'Rename', name: value ?? '' } : undefined,
  },
  update: {
    Move: (s, m) => ({ at: s.at + m.by }),
    Rename: (s) => s,
  },
  view: (_s, i) => html`
    <div role="toolbar" aria-label="Formatting" data-intent-keydown=${i.Move}>
      <input aria-label="Name" data-intent-keydown=${i.Rename} />
    </div>
  `,
});
```

An async parser can't decline: the lookup can't wait for it, so the event stays with it even
if it resolves to `undefined`. Declining never crosses into another component: a nested
component's lookup ends at its own root, and the outer component sees the same event through
its own listener (once). To skip events by where they started rather than by key, read
`event.target` (the element hit) next to `input.target` (the element with the intent).

**Typing a parser.** Each key in `intent` must produce its own variant (`Qty` produces
`{ _tag: 'Qty'; … }`), so don't annotate a parser with the whole union: `(): Msg => …` widens
it, and TypeScript reports a long error ending in "`IntentParser<Msg, …>` is not assignable to
`IntentParser<{ _tag: 'Qty'; … }, …>`". Inside the spec, leave the return type off: the key types
it. A parser written outside the spec needs `_tag: 'Qty' as const` or the variant as its return
type (`Extract<Msg, { _tag: 'Qty' }> | undefined`). The same holds for `child()`, `form()` and
`field()` mappers.

## Props and stores in a parser: `(input, ctx)`

A parser's second argument is the read-only context reducers get: `props` as they are when the
event fires, and `read(store)` for the stores in `spec.stores` (0.3.1). Parsers that don't need
it take one parameter. Use it when the decision must happen during the event, such as whether
to call `preventDefault()`, which an async reducer is too late for:

```ts
import { define, html, prop } from '@gyral/core';

interface Props {
  /** `vertical` lists take ArrowUp/ArrowDown; `horizontal` ones ArrowLeft/ArrowRight. */
  readonly orientation: string;
}
type Msg = { readonly _tag: 'Step'; readonly by: -1 | 1 };

const OPTIONS = ['Inbox', 'Drafts', 'Sent'] as const;
const KEYS: Readonly<Record<string, readonly [string, string]>> = {
  vertical: ['ArrowUp', 'ArrowDown'],
  horizontal: ['ArrowLeft', 'ArrowRight'],
};

export const Folders = define<{ readonly active: number }, Msg, Props>('my-folders', {
  props: { orientation: prop.string({ default: 'vertical' }) },
  init: () => ({ active: 0 }),
  intent: {
    // Only the arrow keys this orientation owns are taken over; the others keep scrolling.
    Step: ({ key, event }, { props }) => {
      const [back, next] = KEYS[props.orientation] ?? KEYS.vertical ?? ['', ''];
      const by = key === back ? -1 : key === next ? 1 : 0;
      if (by === 0) return undefined;
      event.preventDefault();
      return { _tag: 'Step', by };
    },
  },
  update: {
    Step: (s, m) => ({ active: (s.active + m.by + OPTIONS.length) % OPTIONS.length }),
  },
  view: (s, i, { props }) => html`
    <ul
      role="listbox"
      tabindex="0"
      aria-label="Folders"
      aria-orientation=${props.orientation}
      aria-activedescendant=${`folder-${String(s.active)}`}
      data-intent-keydown=${i.Step}
    >
      ${OPTIONS.map(
        (name, n) =>
          html`<li id=${`folder-${String(n)}`} role="option" aria-selected=${n === s.active}>
            ${name}
          </li>`,
      )}
    </ul>
  `,
});
```

Keep parsers pure apart from `preventDefault()`: read, don't write. `form()`, `field()` and
`child()` return one-parameter parsers, so a parser can still call one directly
(`field(schema, toMsg)(input)`).

## One intent, many elements

Several elements can share a tag and carry data in `value`:

```ts
import { define, html } from '@gyral/core';

interface State {
  readonly size: string;
}
type Msg = { readonly _tag: 'Pick'; readonly size: string };

const SIZES = ['S', 'M', 'L'] as const;

export const SizePicker = define<State, Msg>('my-size-picker', {
  init: () => ({ size: 'M' }),
  intent: {
    Pick: ({ value }) =>
      SIZES.some((s) => s === value) && value !== undefined
        ? { _tag: 'Pick', size: value }
        : undefined,
  },
  update: { Pick: (_s, m) => ({ size: m.size }) },
  view: (s, i) =>
    html`${SIZES.map(
      (size) =>
        html`<button
          type="button"
          value=${size}
          aria-pressed=${String(s.size === size)}
          data-intent=${i.Pick}
        >
          ${size}
        </button>`,
    )}`,
});
```

## Several controls, one message

An intent name is a message tag (`data-intent=${i.Category}` needs a `Category` variant in
`Msg`, and `intent: { Category: … }` must produce it) or a name declared with `IntentName<…>`
(next section). Controls that all change one thing don't need a message each. Give them the
same intent and tell them apart by their `name`, as in a search filters panel:

```ts
import { define, html } from '@gyral/core';

interface Filters {
  readonly category: string;
  readonly sort: string;
}
type Msg = { readonly _tag: 'Filter'; readonly field: keyof Filters; readonly value: string };

const FIELDS: readonly (keyof Filters)[] = ['category', 'sort'];
const isField = (name: string): name is keyof Filters => FIELDS.some((f) => f === name);

export const SearchFilters = define<Filters, Msg>('my-search-filters', {
  init: () => ({ category: 'all', sort: 'relevance' }),
  intent: {
    // One parser for every <select>: the name says which filter changed.
    Filter: ({ target, value }) => {
      const name = target.getAttribute('name') ?? '';
      return isField(name) && value !== undefined
        ? { _tag: 'Filter', field: name, value }
        : undefined;
    },
  },
  update: {
    Filter: (s, m) => ({ ...s, [m.field]: m.value }),
  },
  view: (s, i) => html`
    <label>
      Category
      <select name="category" data-intent=${i.Filter}>
        <option value="all" ?selected=${s.category === 'all'}>All</option>
        <option value="books" ?selected=${s.category === 'books'}>Books</option>
      </select>
    </label>
    <label>
      Sort by
      <select name="sort" data-intent=${i.Filter}>
        <option value="relevance" ?selected=${s.sort === 'relevance'}>Relevance</option>
        <option value="price" ?selected=${s.sort === 'price'}>Price</option>
      </select>
    </label>
  `,
});
```

Give each its own message only when the reducers really differ. A name that is neither a tag
nor declared fails to compile with "Object literal may only specify known properties, and
'Category' does not exist in type 'Intents<Msg, object>'" (with props, their type instead of
`object`; plus "Binding element 'value' implicitly has an 'any' type" for its parameters), and
in the view with "Property 'Category' does not exist on type 'IntentNames<Msg>'": add the
variant to `Msg`, declare the name, or use the tag the controls share.

## Intent names that aren't messages: `IntentName<…>`

When several controls each do something different but all end in the same message (a table
toolbar whose Archive, Restore and Duplicate buttons all send one request to the server),
declare their names in the union. Each declared name needs a parser, which may return any
message, and gets no reducer:

```ts
import { define, each, html, intents, type IntentName, type Messages } from '@gyral/core';

interface Doc {
  readonly id: number;
  readonly title: string;
  readonly archived: boolean;
}
type Action =
  { readonly kind: 'archive' | 'restore'; readonly id: number } | { readonly kind: 'duplicate' };
type Msg =
  | { readonly _tag: 'Send'; readonly action: Action }
  | IntentName<'Archive' | 'Restore' | 'Duplicate'>;

interface State {
  readonly docs: readonly Doc[];
  readonly pending: readonly Action[];
}

const i = intents<Msg>(); // declared names are in it, so rows can use them
const idOf = (target: Element): number =>
  Number(target.closest('[data-id]')?.getAttribute('data-id'));
// Helpers that build messages return Messages<Msg>: the union without its intent names.
const send = (action: Action): Messages<Msg> => ({ _tag: 'Send', action });

const Row = (doc: Doc) =>
  html`<li data-id=${doc.id}>
    ${doc.title}
    <button type="button" data-intent=${doc.archived ? i.Restore : i.Archive}>
      ${doc.archived ? 'Restore' : 'Archive'}
    </button>
  </li>`;

export const DocTable = define<State, Msg>('my-doc-table', {
  init: () => ({ docs: [], pending: [] }),
  intent: {
    Archive: ({ target }) => send({ kind: 'archive', id: idOf(target) }),
    Restore: ({ target }) => send({ kind: 'restore', id: idOf(target) }),
    Duplicate: () => send({ kind: 'duplicate' }),
  },
  // One reducer for all three (in an app it also returns the request command).
  update: { Send: (s, m) => ({ ...s, pending: [...s.pending, m.action] }) },
  view: (s) => html`
    <ul>
      ${each(s.docs, (doc) => doc.id, Row)}
    </ul>
    <button type="button" data-intent=${i.Duplicate}>Duplicate</button>
  `,
});
```

Prefer one shared intent (previous section) when one parser that reads `name` is clearer;
declare names when each control's parser differs. Errors: a declared name without a parser
("Property 'Restore' is missing in type … but required"), a reducer for one ("'Archive' does
not exist in type 'Update<…>'"), and a helper typed with the whole union instead of
`Messages<Msg>` ("Type 'IntentName<…>' is not assignable to type 'ParseResult<…>'").

## Press and release (press and hold)

A push-to-talk button (or any press-and-hold control) needs the press and the release. List
both in `data-intent-on` and read `event.type`: one intent, one message with a `down` flag. Add
the `capturePointer()` hook so the release arrives even when the pointer leaves the button
before it lets go (it calls `setPointerCapture` on `pointerdown`). `pointercancel` (the browser
took the touch over for scrolling, say) is a release too. For the keyboard, the same button
lists `keydown keyup` and holds while Space is down; the parser ignores auto-repeat:

```ts
import { capturePointer, define, html } from '@gyral/core';

interface State {
  readonly talking: boolean;
}
type Msg = { readonly _tag: 'Talk'; readonly down: boolean };

const PRESS = new Set(['pointerdown', 'keydown']);

export const PushToTalk = define<State, Msg>('my-push-to-talk', {
  init: () => ({ talking: false }),
  intent: {
    Talk: ({ event, key }) => {
      if (event instanceof KeyboardEvent) {
        if (key !== ' ' || event.repeat) return undefined;
        event.preventDefault(); // no page scroll, no click when Space comes up
      }
      return { _tag: 'Talk', down: PRESS.has(event.type) };
    },
  },
  update: {
    Talk: (_s, m) => ({ talking: m.down }),
  },
  view: (s, i) => html`
    <button
      type="button"
      aria-pressed=${String(s.talking)}
      ${capturePointer()}
      data-intent=${i.Talk}
      data-intent-on="pointerdown pointerup pointercancel keydown keyup"
    >
      ${s.talking ? 'Talking…' : 'Hold to talk'}
    </button>
  `,
});
```

In the app, the reducer would also start and stop the microphone with commands.

- Give the button `touch-action: none` in CSS so a held finger doesn't scroll or zoom, and
  `user-select: none` so a long press doesn't select the label.
- A button that may disappear mid-press (a re-render that drops it) never gets its
  `pointerup`. Also list `lostpointercapture` and treat it as a release, ignoring ones from
  other elements (`event.target !== target`): the event bubbles.
- Capture retargets the pointer's events to the capturing element until release. Because
  `capturePointer()` captures on the element that carries the intent, that intent keeps
  firing. Intents on elements _inside_ an element that holds capture stop firing meanwhile:
  their events now target the capturer. Put `capturePointer()` on the element whose intent
  needs the release, not on a container of other interactive elements.
- Keys reach the button only while it has focus; for a shortcut anywhere on the page, read keys
  in a driver (`subscription()` over `keydown`/`keyup` on `window`, outside-stores.md).

## Messages without intents

Messages that only come from commands (HTTP responses, timers, router) need no parser; leave
them out of `intent`. They still need a reducer in `update`.

## Events of other custom elements

`detail` is set for every `CustomEvent`, so a third-party element (a map, a chart, a date
picker) talks to a component the same way a Gyral child does. Name its event in the intent
attribute and check `detail` in the parser, with a type guard or a Standard Schema:

```ts
import { define, html } from '@gyral/core';

interface Marker {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
}
const isMarker = (u: unknown): u is Marker =>
  typeof u === 'object' &&
  u !== null &&
  'id' in u &&
  typeof u.id === 'string' &&
  'lat' in u &&
  typeof u.lat === 'number' &&
  'lng' in u &&
  typeof u.lng === 'number';

type Msg = { readonly _tag: 'Select'; readonly marker: Marker };

export const StoreFinder = define<{ readonly selected: string }, Msg>('my-store-finder', {
  init: () => ({ selected: '' }),
  intent: {
    // <geo-map> dispatches `marker-select` with the marker as detail.
    Select: ({ detail }) => (isMarker(detail) ? { _tag: 'Select', marker: detail } : undefined),
  },
  update: { Select: (_s, m) => ({ selected: m.marker.id }) },
  view: (s, i) => html`
    <geo-map data-intent-marker-select=${i.Select}></geo-map>
    <p>${s.selected}</p>
  `,
});
```

The element's events must be `CustomEvent`s that bubble, or are dispatched on the element
itself (the intent attribute sits on it). An event name with capitals can't be written in an
attribute name: use `data-intent=${i.Select} data-intent-on="markerSelect"` for those.

## Children's outputs

A parent listens to a child component with `child(ChildClass, (output, el) => msg)`; the child
emits with `outputs<Out>()`'s typed `emit`. Code that isn't a Gyral component listens for
`OUTPUT_EVENT` (`gyral-output`, `detail` is the output); see composition.md. Forms use `form(schema, toMsg)` and single controls `field(schema, toMsg)`; see
forms.md.
