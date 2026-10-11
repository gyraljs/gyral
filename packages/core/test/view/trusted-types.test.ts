// view/01-templates.md "Instantiation" and view/02-bindings.md "`raw(html)`" under Trusted Types
// (gyral-ei9): in a document whose policy is `require-trusted-types-for 'script'; trusted-types
// gyral`, Gyral's client renderer, loaded into that document, parses html templates, svg
// fragments and raw() markup through its `gyral` policy, and updates them, with no violation; a
// bare `innerHTML` string assignment stays blocked, which proves the policy is enforced.
// Chromium in `pnpm check`; Firefox and WebKit too with
// `pnpm vitest run --config packages/core/test/view/browsers.config.ts`.
import { afterEach, describe, expect, it } from 'vitest';
import type { html, raw, render, svg } from '../../src/view/index.js';

interface Gyral {
  html: typeof html;
  svg: typeof svg;
  raw: typeof raw;
  render: typeof render;
}
type Win = Window & typeof globalThis & { gyral?: Gyral; violations?: number; warnings?: string[] };

const VIEW = new URL('../../src/view/index.ts', import.meta.url).href;

/** An iframe with `csp` (default: enforce Trusted Types, allow only `gyral`), with Gyral in it. */
async function enforced(
  csp = "require-trusted-types-for 'script'; trusted-types gyral",
): Promise<{ win: Win; doc: Document; gyral: Gyral }> {
  const iframe = document.createElement('iframe');
  iframe.srcdoc =
    `<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<div id="client"></div>` +
    `<script>window.violations = 0; document.addEventListener('securitypolicyviolation', ` +
    `() => { window.violations += 1; }); window.warnings = []; ` +
    `console.warn = (...a) => { window.warnings.push(String(a[0])); };</script>` +
    `<script type="module">import * as g from ${JSON.stringify(VIEW)}; window.gyral = g;</script>`;
  document.body.append(iframe);
  const win = iframe.contentWindow as Win;
  await expect.poll(() => win.gyral, { timeout: 10_000 }).toBeDefined();
  return { win, doc: iframe.contentDocument as Document, gyral: win.gyral as Gyral };
}

/** Lets queued `securitypolicyviolation` events fire, then counts them. */
async function violations(win: Win): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return win.violations ?? 0;
}

const view = (g: Gyral, label: string, n: number, markup: string) =>
  g.html`<section aria-label=${label}>
    <p>${label}: ${n}</p>
    <svg viewBox="0 0 10 10">${g.svg`<circle cx="5" cy="5" r=${n} />`}</svg>
    <div>${g.raw(markup)}</div>
  </section>`;

afterEach(() => {
  document.body.replaceChildren();
});

describe("templates and raw() under `require-trusted-types-for 'script'`", () => {
  it('a bare innerHTML string is refused in that document', async () => {
    const { win, doc } = await enforced();
    const control = doc.createElement('template');
    expect(() => {
      control.innerHTML = '<b>blocked</b>';
    }).toThrow();
    expect(control.content.childNodes).toHaveLength(0);
    expect(await violations(win)).toBeGreaterThan(0);
  });

  it('renders and updates html, svg and raw() through the gyral policy', async () => {
    const { win, doc, gyral } = await enforced();
    const root = doc.getElementById('client') as HTMLElement;

    gyral.render(view(gyral, 'Count', 1, '<b>one</b>'), root);
    expect(root.querySelector('p')?.textContent).toBe('Count: 1');
    expect(root.querySelector('circle')?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(root.querySelector('circle')?.getAttribute('r')).toBe('1');
    expect(root.querySelector('div')?.innerHTML).toBe('<!----><b>one</b>');

    gyral.render(view(gyral, 'Count', 2, '<i>two</i>'), root);
    expect(root.querySelector('p')?.textContent).toBe('Count: 2');
    expect(root.querySelector('circle')?.getAttribute('r')).toBe('2');
    expect(root.querySelector('div')?.innerHTML).toBe('<!----><i>two</i>');

    expect(await violations(win)).toBe(0);
  });

  // gyral-dyn.30: a CSP that lists other policies but not `gyral`, without enforcing Trusted
  // Types, worked on 0.3.0; creating the policy throws there, so Gyral falls back to strings.
  it("renders when the page's policy list leaves gyral out and Trusted Types aren't enforced", async () => {
    const { win, doc, gyral } = await enforced('trusted-types app-policy');
    const root = doc.getElementById('client') as HTMLElement;
    gyral.render(view(gyral, 'Count', 1, '<b>one</b>'), root);
    expect(root.querySelector('p')?.textContent).toBe('Count: 1');
    gyral.render(view(gyral, 'Count', 2, '<i>two</i>'), root);
    expect(root.querySelector('div')?.innerHTML).toBe('<!----><i>two</i>');
    expect(win.warnings?.filter((w) => w.includes('trusted-types gyral'))).toHaveLength(1);
  });
});
