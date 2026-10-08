// view/08-styles.md "Style attributes under a strict CSP" (0.3.1, gyral-dyn.5): in a document
// whose policy is `style-src 'self'` (no 'unsafe-inline'), Gyral's own client renderer, loaded
// into that document, applies bound, multi and static style attributes and their updates, and
// hydration applies the server's blocked style attributes again; `setAttribute('style', …)`
// stays blocked, which proves the policy is enforced. Chromium in `pnpm check`; Firefox and
// WebKit too with `pnpm vitest run --config packages/core/test/view/browsers.config.ts`.
import { afterEach, describe, expect, it } from 'vitest';
import { renderToString } from '../../src/server.js';
import { DEV, html, type hydrate, type render } from '../../src/view/index.js';

interface Gyral {
  html: typeof html;
  render: typeof render;
  hydrate: typeof hydrate;
}
type Win = Window & typeof globalThis & { gyral?: Gyral; violations?: number };

const VIEW = new URL('../../src/view/index.ts', import.meta.url).href;

const view = (h: typeof html, w: number, c: string) =>
  h`<div style=${`--w: ${String(w)}px`}>
    <p style="inline-size: ${w}px; color: ${c}">a</p>
    <i style="color: rgb(0, 0, 255)">b</i>
    <svg style="fill: rgb(255, 0, 0)"><rect style=${`opacity: ${String(w / 10)}`} /></svg>
  </div>`;

/** An iframe whose CSP is `style-src 'self'`, with the server's HTML and Gyral loaded in it. */
async function strict(server: string): Promise<{ win: Win; doc: Document; gyral: Gyral }> {
  const iframe = document.createElement('iframe');
  iframe.srcdoc =
    `<!doctype html><meta http-equiv="Content-Security-Policy" content="style-src 'self'">` +
    `<div id="server">${server}</div><div id="client"></div><b id="control"></b>` +
    `<script>window.violations = 0; document.addEventListener('securitypolicyviolation', ` +
    `() => { window.violations += 1; });</script>` +
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

/** What `root`'s styles compute to: one entry per styled element. */
function computed(win: Win, root: Element): string[] {
  const style = (sel: string) => win.getComputedStyle(root.querySelector(sel) as Element);
  return [
    style('div').getPropertyValue('--w'),
    `${style('p').inlineSize} ${style('p').color}`,
    style('i').color,
    style('svg').fill,
    style('rect').opacity,
  ];
}

const styled = (w: number, c: string) => [
  `${String(w)}px`,
  `${String(w)}px ${c}`,
  'rgb(0, 0, 255)',
  'rgb(255, 0, 0)',
  String(w / 10),
];

afterEach(() => {
  document.body.replaceChildren();
});

describe("style attributes under `style-src 'self'`", () => {
  it('client renders and updates apply; setAttribute stays blocked', async () => {
    const { win, doc, gyral } = await strict('');
    const control = doc.getElementById('control') as HTMLElement;
    control.setAttribute('style', 'color: rgb(9, 9, 9)');
    expect(win.getComputedStyle(control).color).not.toBe('rgb(9, 9, 9)');
    const seen = await violations(win);
    expect(seen).toBeGreaterThan(0);

    const root = doc.getElementById('client') as HTMLElement;
    gyral.render(view(gyral.html, 3, 'rgb(1, 2, 3)'), root);
    expect(computed(win, root)).toEqual(styled(3, 'rgb(1, 2, 3)'));
    gyral.render(view(gyral.html, 4, 'rgb(4, 5, 6)'), root);
    expect(computed(win, root)).toEqual(styled(4, 'rgb(4, 5, 6)'));
    expect(await violations(win)).toBe(seen);
  });

  it("hydration applies the server's blocked style attributes, then updates apply", async () => {
    const server = renderToString(view(html, 3, 'rgb(1, 2, 3)'), { dev: DEV });
    const { win, doc, gyral } = await strict(server);
    const root = doc.getElementById('server') as HTMLElement;
    expect(computed(win, root)).not.toEqual(styled(3, 'rgb(1, 2, 3)'));
    const seen = await violations(win);
    expect(seen).toBeGreaterThan(0);

    gyral.hydrate(view(gyral.html, 3, 'rgb(1, 2, 3)'), root);
    expect(computed(win, root)).toEqual(styled(3, 'rgb(1, 2, 3)'));
    gyral.render(view(gyral.html, 4, 'rgb(4, 5, 6)'), root);
    expect(computed(win, root)).toEqual(styled(4, 'rgb(4, 5, 6)'));
    expect(await violations(win)).toBe(seen);
  });
});
