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
Other event types must be listed in `spec.events` (e.g. `['pointerdown']`).

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

One element carries one `data-intent`. For a second trigger on the same control, put the
second intent on a wrapper element: events bubble to it (here, `keydown` from the input).

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

## Messages without intents

Messages that only come from commands (HTTP responses, timers, router) need no parser; leave
them out of `intent`. They still need a reducer in `update`.

## Children's outputs

A parent listens to a child component with `child(ChildClass, (output, el) => msg)`; see
composition.md. Forms use `form(schema, toMsg)` and single controls `field(schema, toMsg)`; see
forms.md.
