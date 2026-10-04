import { describe, expect, it } from 'vitest';
import serverHtml from './fixtures/rejected.ssr.html?raw';

// The no-JS path (server.node.test.ts golden file) and the JS path (form() intent in the
// browser) must render the same error markup: one schema, one reducer, one view (ADR 0008).

const body = /<body>([\s\S]*)<\/body>/.exec(serverHtml)?.[1] ?? '';
const rejected = {
  name: 'admin',
  email: 'mike@example.com',
  password: 'longenough',
  confirm: 'different!',
};

/** Structure + sorted attributes + text; ignores Lit's comment markers and whitespace. */
function canonical(node: Node): string {
  if (node instanceof Text) return node.data.replace(/\s+/g, ' ').trim();
  if (!(node instanceof Element)) return '';
  const attrs = [...node.attributes]
    .map((a) => `${a.name}="${a.value}"`)
    .sort()
    .join(' ');
  const children = [...node.childNodes].map(canonical).filter((s) => s !== '');
  return `<${node.localName} ${attrs}>${children.join('')}</${node.localName}>`;
}

function serverForm(): string {
  // Parsed detached and before the component is defined, so nothing upgrades or hydrates.
  const div = document.createElement('div');
  div.setHTMLUnsafe(body);
  const form = div.querySelector('gy-register')?.shadowRoot?.querySelector('form');
  if (form == null) throw new Error('no server form');
  return canonical(form);
}

describe('JS and no-JS rejections render the same markup', () => {
  it('matches the server golden file after a client-side submit', async () => {
    const expected = serverForm();
    await import('../src/register.js');
    const el = document.createElement('gy-register');
    document.body.append(el);
    await el.updateComplete;
    const root = el.shadowRoot;
    for (const [name, value] of Object.entries(rejected)) {
      const field = root?.querySelector(`input[name=${name}]`);
      if (field instanceof HTMLInputElement) field.value = value;
    }
    root?.querySelector('form')?.requestSubmit();
    await new Promise((r) => setTimeout(r, 20));
    await el.updateComplete;
    const form = root?.querySelector('form');
    if (form == null) throw new Error('no client form');
    expect(el.state.errors).toEqual({
      name: ['That name is taken.'],
      confirm: ['The passwords do not match.'],
    });
    expect(canonical(form)).toBe(expected);
  });
});
