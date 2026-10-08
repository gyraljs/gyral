// ADR 0020 in a browser: a page from `renderPage({ csp: { styleAttributes: 'hash' } })`, loaded
// into a document under the header it produced, paints its static, bound and custom-property
// `style` attributes before hydration, in light DOM and in a declarative shadow root, with no
// violations; hydration then has nothing to repair. A value past `maxStyleHashes` stays
// blocked until hydration applies it. Chromium in `pnpm check`; Firefox and WebKit with
// `pnpm vitest run --config packages/core/test/view/browsers.config.ts`.
import { afterEach, describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { development as DEV } from '@gyral/core/server';
import { recordSpec } from '../../core/src/server-specs.js';
import type { hydrate, html as viewHtml } from '../../core/src/view/index.js';
import { renderPage } from '../src/index.js';

interface Gyral {
  html: typeof viewHtml;
  hydrate: typeof hydrate;
}
type Win = Window & typeof globalThis & { gyral?: Gyral; violations?: number; writes?: number };

const VIEW = new URL('../../core/src/view/index.ts', import.meta.url).href;

// Recorded for the server renderer only, as define() does outside the browser: the iframe
// gets the declarative shadow root and paints it without the component being defined.
recordSpec('sah-card', {
  init: () => ({ n: 0 }),
  intent: {},
  update: {},
  view: () => html`<p style="color: rgb(0, 128, 0)">card</p>`,
});

const view = (h: typeof html, w: number) =>
  h`<div style=${`--w: ${String(w)}px`}>
    <p style="inline-size: ${w}px; color: rgb(1, 2, 3)">a</p>
    <i style="color: rgb(0, 0, 255)">b</i>
  </div>`;

/**
 * The page and its header, loaded into an iframe with the header as a meta policy (placed
 * first in the head, so it governs everything the parser builds), plus Gyral's view layer.
 */
async function load(max?: number): Promise<{ win: Win; doc: Document; gyral: Gyral }> {
  const res = renderPage({
    title: 't',
    dev: DEV,
    body: html`<main id="app">${view(html, 3)}</main>
      <sah-card></sah-card>`,
    csp: { styleAttributes: 'hash', ...(max === undefined ? {} : { maxStyleHashes: max }) },
  });
  const policy = res.headers.get('content-security-policy') ?? '';
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  const watch =
    `<script>window.violations = 0; document.addEventListener('securitypolicyviolation', ` +
    `() => { window.violations += 1; });</script>`;
  const page = (await res.text()).replace('<head>', `<head>${meta}${watch}`);
  const iframe = document.createElement('iframe');
  iframe.srcdoc = page.replace(
    '</body>',
    `<script type="module">import * as g from ${JSON.stringify(VIEW)}; window.gyral = g;</script></body>`,
  );
  document.body.append(iframe);
  const win = iframe.contentWindow as Win;
  await expect.poll(() => win.gyral, { timeout: 10_000 }).toBeDefined();
  return { win, doc: iframe.contentDocument as Document, gyral: win.gyral as Gyral };
}

async function violations(win: Win): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return win.violations ?? 0;
}

function computed(win: Win, doc: Document): string[] {
  const app = doc.getElementById('app') as HTMLElement;
  const style = (el: Element) => win.getComputedStyle(el);
  const card = doc.querySelector('sah-card')?.shadowRoot?.querySelector('p');
  return [
    style(app.querySelector('div') as Element).getPropertyValue('--w'),
    `${style(app.querySelector('p') as Element).inlineSize} ${style(app.querySelector('p') as Element).color}`,
    style(app.querySelector('i') as Element).color,
    card == null ? 'no shadow root' : style(card).color,
  ];
}

const painted = ['3px', '3px rgb(1, 2, 3)', 'rgb(0, 0, 255)', 'rgb(0, 128, 0)'];

/** Counts CSSOM `cssText` writes in `win` from now on (hydration's re-write, view/08). */
function countWrites(win: Win): void {
  const proto = win.CSSStyleDeclaration.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'cssText') as PropertyDescriptor;
  win.writes = 0;
  Object.defineProperty(proto, 'cssText', {
    ...desc,
    set(this: CSSStyleDeclaration, value: string) {
      win.writes = (win.writes ?? 0) + 1;
      desc.set?.call(this, value);
    },
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("renderPage({ csp: { styleAttributes: 'hash' } }) in a browser (ADR 0020)", () => {
  it('paints every server style attribute before hydration, with no violations', async () => {
    const { win, doc, gyral } = await load();
    expect(computed(win, doc)).toEqual(painted);
    expect(await violations(win)).toBe(0);

    countWrites(win);
    gyral.hydrate(view(gyral.html, 3), doc.getElementById('app') as HTMLElement);
    expect(computed(win, doc)).toEqual(painted);
    expect(win.writes).toBe(0);
    expect(await violations(win)).toBe(0);
  });

  it('leaves a value past maxStyleHashes blocked until hydration applies it', async () => {
    const { win, doc, gyral } = await load(1);
    expect(computed(win, doc)).not.toEqual(painted);
    expect(await violations(win)).toBeGreaterThan(0);

    gyral.hydrate(view(gyral.html, 3), doc.getElementById('app') as HTMLElement);
    expect(computed(win, doc).slice(0, 3)).toEqual(painted.slice(0, 3));
  });
});
