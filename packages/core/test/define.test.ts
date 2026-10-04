import { afterEach, describe, expect, it } from 'vitest';
import { LitElement } from 'lit';
import { define, html } from '../src/index.js';

interface Todo {
  readonly draft: string;
  readonly items: readonly string[];
  readonly done: boolean;
}

type Msg =
  | { readonly _tag: 'Add'; readonly text: string }
  | { readonly _tag: 'Draft'; readonly text: string }
  | { readonly _tag: 'Toggle'; readonly done: boolean }
  | { readonly _tag: 'Clear' };

const TodoEl = define<Todo, Msg>('test-todo', {
  init: () => ({ draft: '', items: [], done: false }),
  intent: {
    Add: ({ formData }) => {
      const text = formData?.get('text');
      return typeof text === 'string' && text !== '' ? { _tag: 'Add', text } : undefined;
    },
    Draft: ({ value }) => ({ _tag: 'Draft', text: value ?? '' }),
    Toggle: ({ checked }) => ({ _tag: 'Toggle', done: checked === true }),
    Clear: () => ({ _tag: 'Clear' }),
  },
  update: {
    Add: (s, m) => ({ ...s, items: [...s.items, m.text] }),
    Draft: (s, m) => ({ ...s, draft: m.text }),
    Toggle: (s, m) => ({ ...s, done: m.done }),
    Clear: (s) => ({ ...s, items: [] }),
  },
  view: (s, i) => html`
    <form data-intent=${i.Add}>
      <input name="text" data-intent=${i.Draft} />
      <button>Add</button>
    </form>
    <input type="checkbox" data-intent=${i.Toggle} />
    <ul data-intent=${i.Clear}>
      ${s.items.map((t) => html`<li>${t}</li>`)}
    </ul>
    <test-child></test-child>
  `,
});

define<{ readonly n: number }, { readonly _tag: 'Clear' }>('test-child', {
  init: () => ({ n: 0 }),
  intent: { Clear: () => ({ _tag: 'Clear' }) },
  update: { Clear: (s) => ({ n: s.n + 1 }) },
  view: (s, i) => html`<button data-intent=${i.Clear}>${s.n}</button>`,
});

async function mount(): Promise<InstanceType<typeof TodoEl>> {
  const el = new TodoEl();
  document.body.append(el);
  await el.updateComplete;
  return el;
}

function q<T extends Element>(root: Element, selector: string, type: new () => T): T {
  const found = root.shadowRoot?.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`missing ${type.name} ${selector}`);
  return found;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('define()', () => {
  it('turns a form submission into a parsed message', async () => {
    const el = await mount();
    q(el, 'input[name=text]', HTMLInputElement).value = 'milk';
    q(el, 'form', HTMLFormElement).requestSubmit();
    await el.updateComplete;
    expect(el.state.items).toEqual(['milk']);
    expect(q(el, 'li', HTMLLIElement).textContent).toBe('milk');
  });

  it('ignores messages the parser rejects', async () => {
    const el = await mount();
    q(el, 'form', HTMLFormElement).requestSubmit();
    expect(el.state.items).toEqual([]);
  });

  it('reads value on input and checked on change', async () => {
    const el = await mount();
    const input = q(el, 'input[name=text]', HTMLInputElement);
    input.value = 'eg';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    q(el, 'input[type=checkbox]', HTMLInputElement).click();
    expect(el.state.draft).toBe('eg');
    expect(el.state.done).toBe(true);
  });

  it('isolates intents inside nested components', async () => {
    const el = await mount();
    el.send({ _tag: 'Add', text: 'keep' });
    const child = q(el, 'test-child', LitElement);
    await child.updateComplete;
    q(child, 'button', HTMLButtonElement).click();
    expect(el.state.items).toEqual(['keep']);
  });

  it('exposes the spec for pure tests', () => {
    const next = TodoEl.spec.update.Add(
      { draft: '', items: [], done: false },
      {
        _tag: 'Add',
        text: 'x',
      },
      { props: {} },
    );
    expect(next).toEqual({ draft: '', items: ['x'], done: false });
  });
});
