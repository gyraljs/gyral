// gyral-c5o: native opening must wait for the newly committed DOM to be connected.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { define, focus, html, keyed, settled } from '../../src/index.js';
import { collectErrors, type Collected } from '../collect-errors.js';

interface State {
  readonly open: boolean;
  readonly key: number;
}
type Msg = { readonly _tag: 'Open' } | { readonly _tag: 'Close' } | { readonly _tag: 'Replace' };
const update = {
  Open: (s: State): [State, ReturnType<typeof focus>[]] => [
    { ...s, open: true },
    [focus('#confirm')],
  ],
  Close: (s: State) => ({ ...s, open: false }),
  Replace: (s: State) => ({ ...s, key: s.key + 1 }),
};
const dialogView = (open: boolean) => html`
  <dialog ?modal=${open} aria-label="Confirm action">
    <button type="button">Cancel</button>
    <button id="confirm" type="button">Confirm</button>
  </dialog>
`;
const Conditional = define<State, Msg>()('test-modal-conditional', {
  init: () => ({ open: false, key: 0 }),
  intent: { Open: true },
  update,
  view: (s, i) =>
    s.open ? dialogView(true) : html`<button type="button" data-intent=${i.Open}>Open</button>`,
});
const Keyed = define<State, Msg>()('test-modal-keyed', {
  init: () => ({ open: false, key: 0 }),
  update,
  view: (s) => keyed(s.key, dialogView(s.open)),
});
const InitiallyOpen = define<State, Msg>()('test-modal-initial', {
  init: () => ({ open: true, key: 0 }),
  update,
  view: (s) => dialogView(s.open),
});
const Content = define()('test-modal-content', {
  view: () => html`<button type="button">Nested confirmation</button>`,
});
const WithChild = define()('test-modal-child', {
  view: () =>
    html`<dialog ?modal=${true} aria-label="Confirm action">
      <test-modal-content></test-modal-content>
    </dialog>`,
});

let collected: Collected;
let connected: boolean[];
// eslint-disable-next-line @typescript-eslint/unbound-method -- .call below supplies the native dialog receiver
const nativeShowModal = HTMLDialogElement.prototype.showModal;
beforeEach(() => {
  collected = collectErrors();
  connected = [];
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    connected.push(this.isConnected);
    nativeShowModal.call(this);
  });
});
afterEach(() => {
  document.body.replaceChildren();
  collected.stop();
  vi.restoreAllMocks();
});

it('inserts a conditional dialog before opening it, then runs the requested focus command', async () => {
  const el = new Conditional();
  document.body.append(el);
  await settled();
  const root = el.shadowRoot as ShadowRoot;
  (root.querySelector('button') as HTMLButtonElement).click();
  await settled();
  expect(collected.text()).toBe('');
  const dialog = root.querySelector('dialog') as HTMLDialogElement;
  expect(dialog.isConnected).toBe(true);
  expect(dialog.matches(':modal')).toBe(true);
  expect(root.activeElement).toBe(dialog.querySelector('#confirm'));
  expect(connected).toEqual([true]);
});

it('opens a keyed replacement after insertion and closes it when the model turns false', async () => {
  const el = new Keyed();
  document.body.append(el);
  await settled();
  el.send({ _tag: 'Open' });
  await settled();
  const root = el.shadowRoot as ShadowRoot;
  const first = root.querySelector('dialog') as HTMLDialogElement;
  expect(first.matches(':modal')).toBe(true);
  el.send({ _tag: 'Replace' });
  await settled();
  expect(collected.text()).toBe('');
  const replacement = root.querySelector('dialog') as HTMLDialogElement;
  expect(replacement).not.toBe(first);
  expect(first.isConnected).toBe(false);
  expect(replacement.matches(':modal')).toBe(true);
  expect(connected).toEqual([true, true]);
  el.send({ _tag: 'Close' });
  await settled();
  expect(root.querySelector('dialog')).toBe(replacement);
  expect(replacement.open).toBe(false);
});

it('opens an initially true modal after the component is inserted', async () => {
  const el = new InitiallyOpen();
  document.body.append(el);
  await settled();
  expect(collected.text()).toBe('');
  const dialog = el.shadowRoot?.querySelector('dialog') as HTMLDialogElement;
  expect(dialog.isConnected).toBe(true);
  expect(dialog.matches(':modal')).toBe(true);
  expect(dialog.querySelector('button')).not.toBeNull();
  expect(connected).toEqual([true]);
});

it('opens only after nested child components have rendered in the same flush', async () => {
  const children: Element[] = [];
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    const button = this.querySelector('test-modal-content')?.shadowRoot?.querySelector('button');
    if (button !== undefined && button !== null) children.push(button);
    nativeShowModal.call(this);
  });
  const el = new WithChild();
  document.body.append(el);
  await settled();
  expect(collected.text()).toBe('');
  expect(children).toHaveLength(1);
  expect(children[0]?.isConnected).toBe(true);
  expect(el.shadowRoot?.querySelector('dialog')?.matches(':modal')).toBe(true);
  expect(el.shadowRoot?.querySelector('test-modal-content')).toBeInstanceOf(Content);
});
