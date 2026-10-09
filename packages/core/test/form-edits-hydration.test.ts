// Live form state in components (view/02-bindings.md "Live form state", view/04-scheduler.md
// "Marking"): a form-state part writes only when the model's value for it changed since its
// last commit. So a render caused by an unrelated message keeps what the user typed or toggled,
// a model change overwrites the edit, a refused edit stays in the control, hydration keeps edits
// made before scripts ran (07), and re-creating the controls with a key resets them. Named
// `-hydration` so it also runs against core's production build (the browser-prod project).
import { afterEach, describe, expect, it } from 'vitest';
import { define, each, html, settled } from '../src/index.js';
import { renderToString } from '../src/server.js';

interface State {
  readonly name: string;
  readonly on: boolean;
  readonly mixed: boolean;
  readonly pick: 'a' | 'b';
  readonly note: string;
  readonly open: boolean;
  readonly modal: boolean;
  readonly other: number;
  readonly formKey: number;
}
type Msg =
  | { readonly _tag: 'Other' }
  | { readonly _tag: 'Set'; readonly state: Partial<State> }
  | { readonly _tag: 'Reset' };

const initial: State = {
  ...{ name: 'Ada', on: false, mixed: true, pick: 'a', note: 'note', open: false },
  ...{ modal: false, other: 0, formKey: 0 },
};

const fields = (s: State) =>
  html`<form>
    <input name="n" value=${s.name} />
    <input type="checkbox" ?checked=${s.on} />
    <input type="checkbox" class="mixed" ?indeterminate=${s.mixed} />
    <select>
      <option ?selected=${s.pick === 'a'}>a</option>
      <option ?selected=${s.pick === 'b'}>b</option>
    </select>
    <textarea>${s.note}</textarea>
    <details ?open=${s.open}><summary>more</summary></details>
    <dialog ?open=${s.modal}>d</dialog>
    <output>${s.other}</output>
  </form>`;

const spec = {
  init: (): State => initial,
  intent: {},
  update: {
    Other: (s: State) => ({ ...s, other: s.other + 1 }),
    Set: (s: State, m: { readonly state: Partial<State> }) => ({ ...s, ...m.state }),
    // The documented force-reset: back to the initial values, and a new key re-creates the form.
    Reset: (s: State) => ({ ...initial, formKey: s.formKey + 1 }),
  },
  view: (s: State) =>
    html`<div>
      ${each(
        [s],
        (x) => x.formKey,
        (x) => fields(x),
      )}
    </div>`,
};
define<State, Msg>()('test-fe-form', spec);

type Host = HTMLElement & { readonly state: State; send(msg: Msg): void };

afterEach(() => {
  document.body.replaceChildren();
});

/** The controls of a rendered form, and a snapshot of their live state. */
function controls(root: ParentNode) {
  const q = (sel: string): Element | null => root.querySelector(sel);
  const c = {
    input: q('input[name=n]') as HTMLInputElement,
    box: q('input[type=checkbox]:not(.mixed)') as HTMLInputElement,
    mixed: q('input.mixed') as HTMLInputElement,
    select: q('select') as HTMLSelectElement,
    area: q('textarea') as HTMLTextAreaElement,
    details: q('details') as HTMLDetailsElement,
    dialog: q('dialog') as HTMLDialogElement,
  };
  const live = () => ({
    name: c.input.value,
    on: c.box.checked,
    mixed: c.mixed.indeterminate,
    pick: c.select.value,
    note: c.area.value,
    open: c.details.open,
    modal: c.dialog.open,
  });
  /** What a user does: type, toggle, pick, open, close. */
  const edit = () => {
    c.input.value = 'Ada Lovelace';
    c.box.checked = true;
    c.mixed.indeterminate = false;
    c.select.value = 'b';
    c.area.value = 'edited';
    c.details.open = true;
    c.dialog.show();
  };
  return { ...c, live, edit };
}

const edited = {
  ...{ name: 'Ada Lovelace', on: true, mixed: false, pick: 'b', note: 'edited' },
  ...{ open: true, modal: true },
};
const shown = (s: State) => ({
  ...{ name: s.name, on: s.on, mixed: s.mixed, pick: s.pick, note: s.note },
  ...{ open: s.open, modal: s.modal },
});

async function mounted(): Promise<{ el: Host; c: ReturnType<typeof controls> }> {
  const el = document.createElement('test-fe-form') as Host;
  document.body.append(el);
  await settled();
  return { el, c: controls(el.shadowRoot as ShadowRoot) };
}

describe('live form state in a component', () => {
  it('an unrelated re-render keeps every edit', async () => {
    const { el, c } = await mounted();
    expect(c.live()).toEqual(shown(initial));
    c.edit();
    el.send({ _tag: 'Other' });
    await settled();
    expect(el.shadowRoot?.querySelector('output')?.textContent).toBe('1');
    expect(c.live()).toEqual(edited);
  });

  it('a model change overwrites the edit, for that part only', async () => {
    const { el, c } = await mounted();
    c.edit();
    el.send({ _tag: 'Set', state: { name: 'Grace', note: 'n2' } });
    await settled();
    expect(c.live()).toEqual({ ...edited, name: 'Grace', note: 'n2' });
    // The other parts: the model agrees with the edits (nothing to write), then moves back.
    el.send({ _tag: 'Set', state: { on: true, mixed: false, pick: 'b', open: true, modal: true } });
    await settled();
    expect(c.live()).toEqual({ ...edited, name: 'Grace', note: 'n2' });
    el.send({ _tag: 'Set', state: { ...shown(initial), name: 'Grace', note: 'n2' } });
    await settled();
    expect(c.live()).toEqual({ ...shown(initial), name: 'Grace', note: 'n2' });
  });

  it('compares with the last commit: a change undone before the render writes nothing', async () => {
    const { el, c } = await mounted();
    c.edit();
    el.send({ _tag: 'Set', state: { name: 'Grace', on: true } });
    el.send({ _tag: 'Set', state: { name: 'Ada', on: false } });
    await settled(); // one render, with the committed values: the edits stay
    expect(c.live()).toEqual(edited);
  });

  it('a refused edit stays in the control (the model did not change)', async () => {
    const { el, c } = await mounted();
    c.input.value = 'refused';
    el.send({ _tag: 'Set', state: {} }); // the reducer keeps the state
    await settled();
    expect(el.state.name).toBe('Ada');
    expect(c.input.value).toBe('refused');
  });

  it('force-reset: a new key re-creates the controls with the model values', async () => {
    const { el, c } = await mounted();
    c.edit();
    el.send({ _tag: 'Reset' });
    await settled();
    const fresh = controls(el.shadowRoot as ShadowRoot);
    expect(fresh.input).not.toBe(c.input);
    expect(fresh.live()).toEqual(shown(initial));
  });
});

describe('live form state after hydration (07 "Form state")', () => {
  it('keeps edits made before scripts ran until the model changes', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const view = renderToString(spec.view(initial), { dev: false });
    // The page as the server wrote it, edited by the user before the component is defined.
    root.setHTMLUnsafe(
      `<test-fe-pending data-gyral-light data-gyral-seed='{"props":{}}'>${view}</test-fe-pending>`,
    );
    const c = controls(root);
    c.edit();
    define<State, Msg>()('test-fe-pending', { ...spec, shadow: false });
    await settled();
    const el = root.firstElementChild as Host;
    expect(controls(el).input).toBe(c.input); // hydrated in place
    // Hydration sets ?indeterminate from the model: no attribute carries it (07).
    expect(c.live()).toEqual({ ...edited, mixed: true });
    el.send({ _tag: 'Other' });
    await settled();
    expect(c.live()).toEqual({ ...edited, mixed: true });
    el.send({ _tag: 'Set', state: { name: 'Grace' } });
    await settled();
    expect(c.live()).toEqual({ ...edited, mixed: true, name: 'Grace' });
  });
});
