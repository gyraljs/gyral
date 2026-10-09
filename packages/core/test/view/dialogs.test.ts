// Dialogs and popovers from state (view/02-bindings.md "Dialogs and popovers", gyral-1zd.27):
// `?modal` opens a <dialog> with showModal() and closes it with close(); `?popover-open` shows
// and hides a [popover] element. The dialog's close and cancel events reach intents, and the
// platform returns focus to the opener.
import { afterEach, describe, expect, it } from 'vitest';
import { define, html, settled } from '../../src/index.js';
import { renderToString } from '../../src/server.js';

interface State {
  readonly open: boolean;
  readonly tip: boolean;
  readonly closes: number;
}
type Msg =
  | { readonly _tag: 'Open' }
  | { readonly _tag: 'Close' }
  | { readonly _tag: 'Closed' }
  | { readonly _tag: 'Tip'; readonly on: boolean };

const Dialogs = define<State, Msg>()('test-dialogs', {
  init: () => ({ open: false, tip: false, closes: 0 }),
  intent: {
    Open: () => ({ _tag: 'Open' }),
    Close: () => ({ _tag: 'Close' }),
    Closed: () => ({ _tag: 'Closed' }),
  },
  update: {
    Open: (s) => ({ ...s, open: true }),
    Close: (s) => ({ ...s, open: false }),
    Closed: (s) => ({ ...s, open: false, closes: s.closes + 1 }),
    Tip: (s, m) => ({ ...s, tip: m.on }),
  },
  view: (s, i) => html`
    <button id="opener" type="button" data-intent=${i.Open}>open</button>
    <dialog ?modal=${s.open} data-intent-on="close" data-intent=${i.Closed}>
      <p>Settings</p>
      <button id="done" type="button" data-intent=${i.Close}>done</button>
    </dialog>
    <div id="tip" popover="manual" ?popover-open=${s.tip}>Saved</div>
  `,
});

type DialogsElement = InstanceType<typeof Dialogs> & {
  readonly state: State;
  send(msg: Msg): void;
};

let el: DialogsElement | undefined;
afterEach(() => {
  el?.remove();
  el = undefined;
});

async function mount(): Promise<[DialogsElement, ShadowRoot]> {
  el = new Dialogs();
  document.body.append(el);
  await settled();
  return [el, el.shadowRoot as ShadowRoot];
}

describe('?modal', () => {
  it('opens a dialog as a modal and closes it as the state changes', async () => {
    const [host, root] = await mount();
    const dialog = root.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    host.send({ _tag: 'Open' });
    await settled();
    expect(dialog.open).toBe(true);
    expect(dialog.matches(':modal')).toBe(true);
    host.send({ _tag: 'Close' });
    await settled();
    expect(dialog.open).toBe(false);
  });

  it('sends the dialog close event to its intent, so a native close updates the model', async () => {
    const [host, root] = await mount();
    const dialog = root.querySelector('dialog') as HTMLDialogElement;
    host.send({ _tag: 'Open' });
    await settled();
    dialog.close(); // as Escape or a form[method=dialog] would
    await new Promise((resolve) => setTimeout(resolve)); // the close event is a queued task
    await settled();
    expect(host.state).toMatchObject({ open: false, closes: 1 });
  });

  it('returns focus to the element that had it before opening', async () => {
    const [host, root] = await mount();
    const opener = root.querySelector('#opener') as HTMLButtonElement;
    opener.focus();
    host.send({ _tag: 'Open' });
    await settled();
    host.send({ _tag: 'Close' });
    await settled();
    expect(root.activeElement).toBe(opener);
  });
});

describe('?popover-open', () => {
  it('shows and hides a popover as the state changes', async () => {
    const [host, root] = await mount();
    const tip = root.querySelector('#tip') as HTMLElement;
    expect(tip.matches(':popover-open')).toBe(false);
    host.send({ _tag: 'Tip', on: true });
    await settled();
    expect(tip.matches(':popover-open')).toBe(true);
    host.send({ _tag: 'Tip', on: false });
    await settled();
    expect(tip.matches(':popover-open')).toBe(false);
  });
});

describe('server output', () => {
  it('writes neither binding as an attribute; the browser opens them after hydration', () => {
    const out = renderToString(
      html`<dialog ?modal=${true}>x</dialog>
        <div popover ?popover-open=${true}>y</div>`,
      { dev: false },
    );
    expect(out).not.toMatch(/modal|popover-open|\sopen/);
  });
});
