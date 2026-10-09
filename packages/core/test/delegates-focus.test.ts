// `shadow: { delegatesFocus: true }` (gyral-dyn.26, view/05-element.md "Focus"): the shadow root delegates
// focus, so focusing the host, or a parent's focus() command naming it, lands on the host's
// first focusable element. Server-rendered hosts get it from shadowrootdelegatesfocus.
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import { define, focus, html, settled, type ShadowOption } from '../src/index.js';

type FieldMsg = never;

define<object, FieldMsg>()('test-df-field', {
  shadow: { delegatesFocus: true },
  init: () => ({}),
  intent: {},
  update: {},
  view: () => html`<label>Name <input id="name" /></label>`,
});

define<object, FieldMsg>()('test-df-plain', {
  init: () => ({}),
  intent: {},
  update: {},
  view: () => html`<label>Name <input id="name" /></label>`,
});

type Msg = { readonly _tag: 'Edit' };

const Form = define<object, Msg>()('test-df-form', {
  init: () => ({}),
  intent: { Edit: () => ({ _tag: 'Edit' }) },
  update: { Edit: (s) => [s, [focus('test-df-field')]] },
  view: (_s, i) => html`
    <button data-intent=${i.Edit}>Edit</button>
    <test-df-field></test-df-field>
  `,
});

type Host = HTMLElement & { readonly shadowRoot: ShadowRoot };

const inner = (host: Element): Element | null | undefined =>
  host.shadowRoot?.querySelector('#name');

afterEach(() => {
  document.body.replaceChildren();
});

describe('delegatesFocus', () => {
  it('attaches a shadow root that delegates focus', async () => {
    const el = document.createElement('test-df-field') as Host;
    document.body.append(el);
    await settled();
    expect(el.shadowRoot.delegatesFocus).toBe(true);
    el.focus();
    expect(el.shadowRoot.activeElement).toBe(inner(el));
    expect(el.matches(':focus')).toBe(true);
  });

  it('is off by default', async () => {
    const el = document.createElement('test-df-plain') as Host;
    document.body.append(el);
    await settled();
    expect(el.shadowRoot.delegatesFocus).toBe(false);
    el.focus();
    expect(el.shadowRoot.activeElement).toBeNull();
  });

  it("lets a parent's focus() command reach the child's first focusable element", async () => {
    const form = new Form() as Host;
    document.body.append(form);
    await settled();
    form.shadowRoot.querySelector('button')?.click();
    await settled();
    const field = form.shadowRoot.querySelector('test-df-field') as Host;
    expect(field.shadowRoot.activeElement).toBe(inner(field));
  });

  it('hydrates a server-rendered host whose declarative root delegates focus', async () => {
    const root = document.createElement('div');
    root.setHTMLUnsafe(
      `<test-df-field data-gyral-seed='{"props":{}}'><template shadowrootmode="open" ` +
        `shadowrootdelegatesfocus><label>Name <input id="name"></label></template></test-df-field>`,
    );
    const el = root.firstElementChild as Host;
    const serverInput = el.shadowRoot.querySelector('#name');
    document.body.append(root);
    await settled();
    expect(el.shadowRoot.delegatesFocus).toBe(true);
    expect(inner(el)).toBe(serverInput);
    el.focus();
    expect(el.shadowRoot.activeElement).toBe(serverInput);
  });
});

describe('ShadowOption', () => {
  it('is exported, so a shared spec helper can type the option', () => {
    expectTypeOf<{ delegatesFocus: true }>().toExtend<ShadowOption>();
    expectTypeOf<false>().toExtend<ShadowOption>();
    expectTypeOf<'open'>().not.toExtend<ShadowOption>();
  });
});
