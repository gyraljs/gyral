// view/08-styles.md "Server" (to verify in Phase 4): a CSP `style-src` hash allows a `<style>`
// inside a declarative shadow root, a `<style>` without its hash is blocked, and `style-src`
// does not block constructed (adopted) sheets. Chromium only, like the rest of the browser suite.
import { describe, expect, it } from 'vitest';
import { styleHash } from '../../src/server.js';

const ALLOWED = 'p { color: rgb(1, 2, 3); }';
const BLOCKED = 'p { color: rgb(4, 5, 6); }';

async function frame(csp: string): Promise<HTMLIFrameElement> {
  const iframe = document.createElement('iframe');
  iframe.srcdoc =
    `<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<x-a><template shadowrootmode="open"><style>${ALLOWED}</style><p>a</p></template></x-a>` +
    `<x-b><template shadowrootmode="open"><style>${BLOCKED}</style><p>b</p></template></x-b>`;
  const loaded = new Promise((resolve) => {
    iframe.addEventListener('load', resolve);
  });
  document.body.append(iframe);
  await loaded;
  return iframe;
}

const colorIn = (iframe: HTMLIFrameElement, tag: string): string => {
  const win = iframe.contentWindow as Window & typeof globalThis;
  const p = iframe.contentDocument?.querySelector(tag)?.shadowRoot?.querySelector('p');
  return p == null ? 'missing' : win.getComputedStyle(p).color;
};

describe('CSP hashes for declarative-shadow-root styles (08 "Server")', () => {
  it('allow a hashed <style>, block an unhashed one, and leave adopted sheets alone', async () => {
    const iframe = await frame(`style-src ${await styleHash(ALLOWED)}`);
    expect(colorIn(iframe, 'x-a')).toBe('rgb(1, 2, 3)');
    expect(colorIn(iframe, 'x-b')).not.toBe('rgb(4, 5, 6)');

    const win = iframe.contentWindow as Window & typeof globalThis;
    const sheet = new win.CSSStyleSheet();
    sheet.replaceSync('p { color: rgb(7, 8, 9); }');
    const root = iframe.contentDocument?.querySelector('x-b')?.shadowRoot;
    if (root == null) throw new Error('no shadow root');
    root.adoptedStyleSheets = [sheet];
    expect(colorIn(iframe, 'x-b')).toBe('rgb(7, 8, 9)');
    iframe.remove();
  });
});
