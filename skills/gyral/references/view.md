# Views

`view(state, intents, ctx)` returns a Lit `html` template. It is a pure function: no event
handlers, no `this`, no fetching, no reading the DOM. Compute derived values in plain helper
functions of state.

## Template rules

- Name intents: `data-intent=${i.Save}`. Never `@click=${…}` or other closures.
- Text and attributes: `${value}`, `attr=${value}`; drop an attribute with `nothing`.
- Live form values: `.value=${s.text}` (property binding), so the control follows the model.
- **Boolean form state: `?checked=${liveBoolean(s.on)}`**, also `?selected`, `?open`. Never
  `.checked=${s.on}`: Lit SSR serializes it as `checked="false"`, which checks the box.
- Keyed lists that reorder or remove: `repeat(items, (it) => it.id, (it) => html`…`)`.
- Force a fresh element when an id changes: `keyed(id, html`…`)`.
- Classes and inline custom properties: `classMap({...})`, `styleMap({ '--w': '10px' })`.
- `<textarea>` content can't be bound: use the `textarea()` directive.
- Accessible names across shadow boundaries: `${labelledBy('heading-id')}`.
- Model errors on native validity: `${invalid(errors)}` (see forms.md).

## Example with the directives

```ts
import { classMap, define, html, liveBoolean, repeat, textarea } from '@gyral/core';

interface Todo {
  readonly id: number;
  readonly text: string;
  readonly done: boolean;
}
interface State {
  readonly todos: readonly Todo[];
  readonly note: string;
}
type Msg =
  | { readonly _tag: 'Toggle'; readonly id: number }
  | { readonly _tag: 'Note'; readonly note: string };

export const Todos = define<State, Msg>('my-todos', {
  init: () => ({ todos: [{ id: 1, text: 'Write docs', done: false }], note: '' }),
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
  view: (s, i) => html`
    <ul aria-label="Todos">
      ${repeat(
        s.todos,
        (t) => t.id,
        (t) =>
          html`<li class=${classMap({ done: t.done })}>
            <label>
              <input
                type="checkbox"
                value=${t.id}
                ?checked=${liveBoolean(t.done)}
                data-intent=${i.Toggle}
              />
              ${t.text}
            </label>
          </li>`,
      )}
    </ul>
    <label for="note">Note</label>
    ${textarea({ value: s.note, attrs: { id: 'note', name: 'note', rows: 3, 'data-intent': i.Note } })}
  `,
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
