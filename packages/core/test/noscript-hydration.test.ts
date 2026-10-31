// Components with a <noscript> notice in their views (gyral-qqa, view/07-hydration.md "The
// parallel walk"): real server output (renderOnServer) for a shadow and a light host hydrates
// in place, without a mismatch (a throw in development, G0063 in production; `hydrated` fails
// on either), keeps the server's notice and stays interactive. Runs against development and
// production builds of core (the browser and browser-prod projects).
import { afterEach, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { hydrated, mountSsr, type MountedSsr } from '../../testing/src/ssr.js';
import { settled } from '../src/index.js';

let page: MountedSsr | undefined;
afterEach(() => {
  page?.unmount();
  page = undefined;
});

const rootOf = (host: Element): ParentNode => host.shadowRoot ?? host;

it('hydrates shadow and light hosts whose views hold a <noscript> notice', async () => {
  const output = await commands.renderOnServer({
    module: './fixtures/noscript.ts',
    export: 'page',
  });
  expect(output).toContain(
    '<noscript><p>Recording needs JavaScript. <a href="/upload">Upload a file</a> instead.</p></noscript>',
  );
  page = mountSsr(output);
  const hosts = ['test-noscript-recorder', 'test-noscript-prefs'].map((tag) => {
    const host = page?.root.querySelector(tag);
    if (host === null || host === undefined) throw new Error(`no ${tag}`);
    return host;
  });
  const server = hosts.map((host) => {
    const root = rootOf(host);
    const notice = root.querySelector('noscript');
    const button = root.querySelector('button');
    if (notice === null || button === null) throw new Error('no server notice or button');
    // The page's parser (scripting on) made the notice one Text node.
    expect([...notice.childNodes].map((n) => n.nodeType)).toEqual([Node.TEXT_NODE]);
    return { notice, text: notice.firstChild, button };
  });
  await import('./fixtures/noscript.js');
  await hydrated(page); // throws on a mismatch or any console error or warning
  for (const [k, host] of hosts.entries()) {
    const was = server[k];
    if (was === undefined) throw new Error('no server nodes');
    expect(host.hasAttribute('data-gyral-seed')).toBe(false);
    const root = rootOf(host);
    expect(root.querySelector('noscript')).toBe(was.notice);
    expect([...was.notice.childNodes]).toEqual([was.text]);
    expect(root.querySelector('button')).toBe(was.button);
    was.button.click();
    await settled();
    expect(was.button.textContent.trim()).toBe('Stop');
    expect(was.button.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('noscript')).toBe(was.notice);
  }
}, 60_000);
