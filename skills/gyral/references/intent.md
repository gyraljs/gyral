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
and goes outward: the nearest element with an intent for that event wins. A card table, where
one card element handles the pointer, the keyboard and focus without wrapper elements:

```ts
import { define, each, html, intents } from '@gyral/core';

interface Card {
  readonly id: string;
  readonly face: string;
}
interface State {
  readonly cards: readonly Card[];
  readonly held: string | undefined;
  readonly focused: string | undefined;
}
type Msg =
  | { readonly _tag: 'Grab'; readonly id: string }
  | { readonly _tag: 'Drop'; readonly id: string }
  | { readonly _tag: 'Flip'; readonly id: string }
  | { readonly _tag: 'Focus'; readonly id: string };

const i = intents<Msg>();

const CardRow = (c: Card) =>
  html`<li
    tabindex="0"
    data-id=${c.id}
    data-intent-pointerdown=${i.Grab}
    data-intent-pointerup=${i.Drop}
    data-intent-keydown=${i.Flip}
    data-intent-focusin=${i.Focus}
  >
    ${c.face}
  </li>`;

const idOf = (el: Element): string => el.getAttribute('data-id') ?? '';

export const Table = define<State, Msg>('my-card-table', {
  init: () => ({ cards: [{ id: 'a', face: 'A♠' }], held: undefined, focused: undefined }),
  intent: {
    Grab: ({ target }) => ({ _tag: 'Grab', id: idOf(target) }),
    Drop: ({ target }) => ({ _tag: 'Drop', id: idOf(target) }),
    // Space or Enter flips the focused card; other keys keep their default.
    Flip: ({ target, key, event }) => {
      if (key !== ' ' && key !== 'Enter') return undefined;
      event.preventDefault();
      return { _tag: 'Flip', id: idOf(target) };
    },
    Focus: ({ target }) => ({ _tag: 'Focus', id: idOf(target) }),
  },
  update: {
    Grab: (s, m) => ({ ...s, held: m.id }),
    Drop: (s) => ({ ...s, held: undefined }),
    Flip: (s) => s,
    Focus: (s, m) => ({ ...s, focused: m.id }),
  },
  view: (s) =>
    html`<ul aria-label="Table">
      ${each(s.cards, (c) => c.id, CardRow)}
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
| `detail`          | a child component's output                           |
| `key`             | `KeyboardEvent.key` for `keydown`/`keyup`            |
| `newState`        | `'open'`/`'closed'` for `toggle`                     |
| `command`         | invoker command info for `command` intents           |

Read the intent element from `target`, not from the event: Gyral listens on the component's
root, so `event.currentTarget` is that root (the shadow root), and `event.target` is whatever
was hit inside the element (the label's `<span>`, an icon).

## Parsers

A parser returns a message, `undefined` (ignore the event), or an `IntentRejected` (via
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

**Typing a parser.** Each key in `intent` must produce its own variant (`Qty` produces
`{ _tag: 'Qty'; … }`), so don't annotate a parser with the whole union: `(): Msg => …` widens
it, and TypeScript reports a long error ending in "`IntentParser<Msg>` is not assignable to
`IntentParser<{ _tag: 'Qty'; … }>`". Inside the spec, leave the return type off: the key types
it. A parser written outside the spec needs `_tag: 'Qty' as const` or the variant as its return
type (`Extract<Msg, { _tag: 'Qty' }> | undefined`). The same holds for `child()`, `form()` and
`field()` mappers.

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

Intent names are message tags: `data-intent=${i.Level}` needs a `Level` variant in `Msg`, and
`intent: { Level: … }` must produce it. Controls that all change one thing don't need a
message each. Give them the same intent and tell them apart by their `name`:

```ts
import { define, html } from '@gyral/core';

interface Setup {
  readonly level: string;
  readonly pace: string;
}
type Msg = { readonly _tag: 'Setup'; readonly field: keyof Setup; readonly value: string };

const FIELDS: readonly (keyof Setup)[] = ['level', 'pace'];
const isField = (name: string): name is keyof Setup => FIELDS.some((f) => f === name);

export const GameSetup = define<Setup, Msg>('my-game-setup', {
  init: () => ({ level: 'easy', pace: 'normal' }),
  intent: {
    // One parser for every <select>: the name says which field changed.
    Setup: ({ target, value }) => {
      const name = target.getAttribute('name') ?? '';
      return isField(name) && value !== undefined
        ? { _tag: 'Setup', field: name, value }
        : undefined;
    },
  },
  update: {
    Setup: (s, m) => ({ ...s, [m.field]: m.value }),
  },
  view: (s, i) => html`
    <label>
      Level
      <select name="level" data-intent=${i.Setup}>
        <option value="easy" ?selected=${s.level === 'easy'}>Easy</option>
        <option value="hard" ?selected=${s.level === 'hard'}>Hard</option>
      </select>
    </label>
    <label>
      Pace
      <select name="pace" data-intent=${i.Setup}>
        <option value="normal" ?selected=${s.pace === 'normal'}>Normal</option>
        <option value="fast" ?selected=${s.pace === 'fast'}>Fast</option>
      </select>
    </label>
  `,
});
```

Give each its own message only when the reducers really differ. A name that isn't a tag fails
to compile with "Object literal may only specify known properties, and 'Level' does not exist
in type 'Intents<Msg>'" (plus "Binding element 'value' implicitly has an 'any' type" for its
parameters), and in the view with "Property 'Level' does not exist on type
'IntentNames<Msg>'": add the variant to `Msg`, or use the tag the controls share.

## Press and release (hold to move)

A hold-to-move button needs the press and the release. List both in `data-intent-on` and read
`event.type`: one intent, one message with a `down` flag. Add the `capturePointer()` hook so
the release arrives even when the pointer leaves the button before it lets go (it calls
`setPointerCapture` on `pointerdown`). `pointercancel` (the browser took the touch over for
scrolling, say) is a release too. For the keyboard, a focusable element lists
`keydown keyup`; the parser ignores auto-repeat:

```ts
import { capturePointer, define, html } from '@gyral/core';

type Dir = 'left' | 'right';
interface State {
  readonly held: Dir | undefined;
}
type Msg = { readonly _tag: 'Hold'; readonly dir: Dir; readonly down: boolean };

const KEYS: Readonly<Record<string, Dir>> = { ArrowLeft: 'left', ArrowRight: 'right' };

export const Pad = define<State, Msg>('my-pad', {
  init: () => ({ held: undefined }),
  intent: {
    Hold: ({ event, target, key }) => {
      if (event instanceof KeyboardEvent) {
        const dir = key === undefined ? undefined : KEYS[key];
        if (dir === undefined || event.repeat) return undefined;
        event.preventDefault(); // no scrolling while the arrow is held
        return { _tag: 'Hold', dir, down: event.type === 'keydown' };
      }
      const dir = target.getAttribute('data-dir') === 'left' ? 'left' : 'right';
      return { _tag: 'Hold', dir, down: event.type === 'pointerdown' };
    },
  },
  update: {
    // A release only clears the direction it belongs to.
    Hold: (s, m) => ({ held: m.down ? m.dir : s.held === m.dir ? undefined : s.held }),
  },
  view: (s, i) => html`
    <div
      role="group"
      tabindex="0"
      aria-label="Paddle"
      data-intent=${i.Hold}
      data-intent-on="keydown keyup"
    >
      ${(['left', 'right'] as const).map(
        (dir) =>
          html`<button
            type="button"
            data-dir=${dir}
            aria-pressed=${String(s.held === dir)}
            ${capturePointer()}
            data-intent=${i.Hold}
            data-intent-on="pointerdown pointerup pointercancel"
          >
            ${dir}
          </button>`,
      )}
    </div>
  `,
});
```

- Pointer events bubble to the wrapper too, but the nearest element with `data-intent` whose
  list names the event wins: the button for pointer events, the wrapper for keys.
- Give the buttons `touch-action: none` in CSS so a held finger doesn't scroll or zoom, and
  `user-select: none` so a long press doesn't select the label.
- A button that may disappear mid-press (a re-render that drops it) never gets its
  `pointerup`. Also list `lostpointercapture` and treat it as a release, ignoring ones from
  other elements (`event.target !== target`): the event bubbles.
- Capture retargets the pointer's events to the capturing element until release. Because
  `capturePointer()` captures on the element that carries the intent, that intent keeps
  firing. Intents on elements _inside_ an element that holds capture stop firing meanwhile:
  their events now target the capturer. Put `capturePointer()` on the element whose intent
  needs the release, not on a container of other interactive elements.
- Pressing a key while the wrapper isn't focused does nothing; for keys anywhere on the page,
  read them in a driver (`subscription()` over `keydown`/`keyup` on `window`,
  outside-stores.md).

## Messages without intents

Messages that only come from commands (HTTP responses, timers, router) need no parser; leave
them out of `intent`. They still need a reducer in `update`.

## Children's outputs

A parent listens to a child component with `child(ChildClass, (output, el) => msg)`; the child
emits with `outputs<Out>()`'s typed `emit`. Code that isn't a Gyral component listens for
`OUTPUT_EVENT` (`gyral-output`, `detail` is the output); see composition.md. Forms use `form(schema, toMsg)` and single controls `field(schema, toMsg)`; see
forms.md.
