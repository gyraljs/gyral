// Native bindings share the post-commit queue on runtime, compiled and hydrated DOM.
import { afterEach, expect, it, vi } from 'vitest';
import '../../src/index.js'; // register native bindings on the runtime path
import { compiled, html, hydrate, normalize, render, renderBatch } from '../../src/view/index.js';
import { clientObject } from './helpers.js';
import { cleanup, container, serverDom } from './hydrate-helpers.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const view = (on: boolean) => html`
  <dialog ?modal=${on} aria-label="Confirm action">
    ${html`<button type="button">Confirm</button>`}
  </dialog>
  <p popover="manual" ?popover-open=${on}>Saved</p>
`;

it('opens a nested compiled template synchronously after all dynamic children are inserted', () => {
  const root = container();
  const template = clientObject(
    normalize(['<dialog ?modal=', ' aria-label="Confirm action">', '</dialog>']),
    true,
  );
  render(compiled(template, [true, html`<button type="button">Confirm</button>`]), root);
  const dialog = root.querySelector('dialog') as HTMLDialogElement;
  expect(dialog.matches(':modal')).toBe(true);
  expect(dialog.querySelector('button')?.isConnected).toBe(true);
  expect(document.activeElement).toBe(dialog.querySelector('button'));
});

it.each([false, true])(
  'hydrates server output (dev=%s) in place and preserves native-close/model-change semantics',
  (dev) => {
    const root = serverDom(view(true), dev);
    const dialog = root.querySelector('dialog') as HTMLDialogElement;
    const button = dialog.querySelector('button');
    const popover = root.querySelector('p') as HTMLElement;
    expect(dialog.open).toBe(false);
    hydrate(view(true), root);
    expect(root.querySelector('dialog')).toBe(dialog);
    expect(dialog.querySelector('button')).toBe(button);
    expect(dialog.matches(':modal')).toBe(true);
    expect(popover.matches(':popover-open')).toBe(true);
    dialog.close();
    popover.hidePopover();
    render(view(true), root); // unchanged model never reopens a user-closed element
    expect(dialog.open).toBe(false);
    expect(popover.matches(':popover-open')).toBe(false);
    render(view(false), root);
    render(view(true), root);
    expect(dialog.matches(':modal')).toBe(true);
    expect(popover.matches(':popover-open')).toBe(true);
    render(view(false), root);
    expect(dialog.open).toBe(false);
    expect(popover.matches(':popover-open')).toBe(false);
  },
);

it('uses the latest committed value when the same part updates twice before client calls run', () => {
  const root = container();
  const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
  renderBatch(() => {
    render(view(true), root);
    render(view(false), root);
  });
  expect(show).not.toHaveBeenCalled();
  expect(root.querySelector('dialog')?.hasAttribute('open')).toBe(false);
  expect(root.querySelector('p')?.matches(':popover-open')).toBe(false);
});

it('discards opening when the node leaves the root before client calls run', () => {
  const root = container();
  const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
  renderBatch(() => {
    render(view(true), root);
    render(null, root);
  });
  expect(show).not.toHaveBeenCalled();
  expect(root.childNodes).toHaveLength(0);
});

it('drops native actions queued by a render that fails before insertion', () => {
  const root = container();
  const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
  const failure = new Error('later part failed');
  const broken = {
    toString: () => {
      throw failure;
    },
  };
  expect(() => {
    render(
      html`<dialog ?modal=${true}></dialog>
        <p .textContent=${broken}></p>`,
      root,
    );
  }).toThrow(failure);
  render(html`<p>Recovered</p>`, root);
  expect(show).not.toHaveBeenCalled();
  expect(root.textContent).toBe('Recovered');
});
