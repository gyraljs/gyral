// Lit-specific: delete at the view-layer swap (gyral-g1r.12, ADR 0018).
import { render } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';
import { define, directive, ElementDirective, html, keyed, settled } from '../src/index.js';

const applied: { tag: string; value: string }[] = [];

class Mark extends ElementDirective<[value: string]> {
  apply(el: Element, [value]: [value: string]): void {
    applied.push({ tag: el.localName, value });
    el.setAttribute('data-mark', value);
  }
}
const mark = directive(Mark);

type Msg = { readonly _tag: 'Next' };

const Host = define<{ readonly n: number }, Msg>('test-element-directive', {
  init: () => ({ n: 0 }),
  intent: { Next: () => ({ _tag: 'Next' }) },
  update: { Next: (s) => ({ n: s.n + 1 }) },
  view: (s) =>
    html`<p ${mark(`v${String(s.n)}`)}>x</p>
      ${keyed(s.n, html`<span>${s.n}</span>`)}`,
});

afterEach(() => {
  applied.length = 0;
  document.body.replaceChildren();
});

describe('ElementDirective and keyed', () => {
  it('applies to its element on every render with typed arguments', async () => {
    const el = new Host();
    document.body.append(el);
    await settled();
    el.send({ _tag: 'Next' });
    await settled();
    expect(applied).toEqual([
      { tag: 'p', value: 'v0' },
      { tag: 'p', value: 'v1' },
    ]);
    expect(el.shadowRoot?.querySelector('p')?.getAttribute('data-mark')).toBe('v1');
  });

  it('refuses non-element positions with a helpful error', () => {
    // Child position: the base class rejects it when Lit creates the directive.
    expect(() => {
      render(html`<p>${mark('x')}</p>`, document.createElement('div'));
    }).toThrow(/must be used on an element/);
  });

  it('keyed() replaces the element when the key changes', async () => {
    const el = new Host();
    document.body.append(el);
    await settled();
    const first = el.shadowRoot?.querySelector('span');
    el.send({ _tag: 'Next' });
    await settled();
    expect(el.shadowRoot?.querySelector('span')).not.toBe(first);
  });
});
