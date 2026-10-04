// ORDER IS LOAD-BEARING: hydrate support before anything that imports `lit` (ADR 0012).
import '@gyral/ssr/hydrate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import serverHtml from './fixtures/rejected.ssr.html?raw';

// The server's real 422 response for a rejected no-JS submission (server.node.test.ts).
const body = /<body>([\s\S]*)<\/body>/.exec(serverHtml)?.[1] ?? '';

const errors = vi.spyOn(console, 'error');
const warnings = vi.spyOn(console, 'warn');

function host(): HTMLElement {
  const el = document.querySelector('gy-register');
  if (!(el instanceof HTMLElement) || el.shadowRoot === null) throw new Error('no form');
  return el;
}
const input = (id: string): HTMLInputElement => {
  const el = host().shadowRoot?.querySelector(`#${id}`);
  if (!(el instanceof HTMLInputElement)) throw new Error(`no #${id}`);
  return el;
};
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeAll(() => {
  const div = document.createElement('div');
  div.setHTMLUnsafe(body); // parses Declarative Shadow DOM, like a page load
  document.body.append(div);
});

afterAll(() => {
  document.body.replaceChildren();
});

describe('hydrating a rejected no-JS submission', () => {
  it('shows the errors before any component code loads', () => {
    expect(customElements.get('gy-register')).toBeUndefined();
    expect(host().shadowRoot?.querySelector('#name-error')?.textContent).toBe(
      'That name is taken.',
    );
    expect(input('confirm').getAttribute('aria-invalid')).toBe('true');
  });

  it('hydrates in place with the seeded errors in state', async () => {
    const before = input('confirm');
    await import('../src/register.js');
    const el = host() as HTMLElement & {
      updateComplete: Promise<boolean>;
      state: { errors: Record<string, readonly string[]> };
    };
    await el.updateComplete;
    await settle();
    expect(input('confirm')).toBe(before);
    expect(el.state.errors['confirm']).toEqual(['The passwords do not match.']);
    expect(el.hasAttribute('data-gyral-seed')).toBe(false);
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });

  it('mirrors seeded errors to native validity once hydrated, and clears them on input', () => {
    const confirm = input('confirm');
    expect(confirm.validationMessage).toBe('The passwords do not match.');
    confirm.value = 'longenough';
    confirm.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    expect(confirm.validity.customError).toBe(false);
    expect(confirm.hasAttribute('aria-invalid')).toBe(false);
  });
});
