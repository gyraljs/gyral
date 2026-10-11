// gyral-cps: opening a modal focuses a control and can synchronously deliver an intent.
import { afterEach, expect, it } from 'vitest';
import { define, focus, html, settled } from '../src/index.js';

interface State {
  readonly open: boolean;
  readonly focuses: number;
}
type Msg = { readonly _tag: 'Open' } | { readonly _tag: 'Focused' };
const view = (s: State, i: { readonly Focused: 'Focused' }) => html`
  <dialog ?modal=${s.open} aria-label="Confirm action">
    <button type="button" data-intent-on="focusin" data-intent=${i.Focused}>Confirm</button>
    ${s.focuses > 0 ? html`<button id="revised" type="button">Updated target</button>` : null}
    <output>${s.focuses}</output>
  </dialog>
`;
const Probe = define<State, Msg>()('test-modal-focus-intent', {
  init: () => ({ open: false, focuses: 0 }),
  intent: { Focused: true },
  update: {
    Open: (s) => ({ ...s, open: true }),
    Focused: (s) => ({ ...s, focuses: s.focuses + 1 }),
  },
  view,
});
const Redirect = define<State, Msg>()('test-modal-focus-command', {
  init: () => ({ open: false, focuses: 0 }),
  intent: { Focused: true },
  update: {
    Open: (s) => ({ ...s, open: true }),
    Focused: (s) => [{ ...s, focuses: s.focuses + 1 }, [focus('#revised')]],
  },
  view,
});
afterEach(() => {
  document.body.replaceChildren();
});

it('renders the focus intent and settles within the same flush as native modal opening', async () => {
  const el = new Probe();
  document.body.append(el);
  await settled();
  el.send({ _tag: 'Open' });
  await settled();
  const root = el.shadowRoot as ShadowRoot;
  expect(root.querySelector('dialog')?.matches(':modal')).toBe(true);
  expect(el.state.focuses).toBe(1);
  expect(root.querySelector('output')?.textContent).toBe('1');
  expect(root.activeElement).toBe(root.querySelector('button'));
});

it('renders a focus intent before running its command targeting newly inserted content', async () => {
  const el = new Redirect();
  document.body.append(el);
  await settled();
  el.send({ _tag: 'Open' });
  await settled();
  const root = el.shadowRoot as ShadowRoot;
  expect(el.state.focuses).toBe(1);
  expect(root.querySelector('output')?.textContent).toBe('1');
  expect(root.activeElement).toBe(root.querySelector('#revised'));
});
