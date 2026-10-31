// <noscript> in a view (gyral-qqa; view/09-template-rules.md "<noscript> since 0.3.10",
// view/07-hydration.md "The parallel walk"): the server writes the notice as markup, which the
// page's parser (scripting on) turns into one Text node; hydration adopts the element as it
// is, without walking its content; a client render creates it empty, so its markup never goes
// live. Runs against development and production builds of core (browser, browser-prod).
import { afterEach, describe, expect, it } from 'vitest';
import { renderToString } from '../../src/server.js';
import { html, hydrate, render } from '../../src/view/index.js';
import { canon, cleanup, container, nodesOf, serverDom } from './hydrate-helpers.js';

afterEach(cleanup);

const RED = 'rgb(255, 0, 0)';
const LINE =
  '<p>Recording needs JavaScript. <a href="/upload">Upload a file</a> instead&nbsp;&rarr;</p>';

interface Rec {
  readonly recording: boolean;
  readonly seconds: number;
  readonly reason: string;
}
const idle: Rec = { recording: false, seconds: 0, reason: 'mic' };
const busy: Rec = { recording: true, seconds: 3, reason: 'upload' };

// gathered-wishes' shape: a notice next to the interactive content it stands in for.
const recorder = (s: Rec) =>
  html`<section class="rec">
    <noscript data-reason=${s.reason}
      ><style>
        .rec button {
          color: rgb(255, 0, 0);
        }
      </style>
      <p>
        Recording needs JavaScript. <a href="/upload">Upload a file</a> instead&nbsp;&rarr;
      </p></noscript
    >
    <button type="button" aria-pressed=${s.recording ? 'true' : 'false'}>
      ${s.recording ? 'Stop' : 'Record'}
    </button>
    <output>${s.seconds}</output>
  </section>`;

const one = (root: ParentNode, selector: string): Element => {
  const el = root.querySelector(selector);
  if (el === null) throw new Error(`no ${selector}`);
  return el;
};

describe('<noscript> in a view (gyral-qqa)', () => {
  it('is written by the server as markup, which the page parser makes one Text node', () => {
    const out = renderToString(recorder(idle));
    const notice = /<noscript data-reason="mic">([\s\S]*)<\/noscript>/.exec(out)?.[1];
    expect(notice).toMatch(/^<style>[\s\S]*color: rgb\(255, 0, 0\);[\s\S]*<\/style>/);
    expect(notice?.endsWith(LINE)).toBe(true);
    const ns = one(serverDom(recorder(idle)), 'noscript');
    expect([...ns.childNodes].map((n) => n.nodeType)).toEqual([Node.TEXT_NODE]);
    expect(ns.textContent).toBe(notice);
  });

  it('hydrates: the element is adopted as it is, its content neither walked nor compared', () => {
    for (const dev of [true, false]) {
      const root = serverDom(recorder(idle), dev);
      const ns = one(root, 'noscript');
      const text = ns.firstChild;
      const before = nodesOf(root);
      hydrate(recorder(idle), root);
      expect(nodesOf(root)).toEqual(before);
      render(recorder(busy), root);
      const button = one(root, 'button');
      expect(button.textContent.trim()).toBe('Stop');
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(one(root, 'output').textContent).toBe('3');
      // The element's own attribute is a part; its content stays the server's.
      expect(ns.getAttribute('data-reason')).toBe('upload');
      expect(one(root, 'noscript')).toBe(ns);
      expect([...ns.childNodes]).toEqual([text]);
      expect(nodesOf(root).filter((n) => n.nodeType === 1)).toEqual(
        before.filter((n) => n.nodeType === 1),
      );
      cleanup();
    }
  });

  it('client-renders the <noscript> empty, so its <style> never applies (no live markup)', () => {
    const root = container();
    render(recorder(idle), root);
    const ns = one(root, 'noscript');
    expect(ns.childNodes).toHaveLength(0);
    expect(ns.getAttribute('data-reason')).toBe('mic');
    expect(getComputedStyle(one(root, 'button')).color).not.toBe(RED);
    render(recorder(busy), root);
    expect(one(root, 'noscript')).toBe(ns);
    expect(ns.childNodes).toHaveLength(0);
    expect(one(root, 'output').textContent).toBe('3');
  });

  it('hydrates a notice in a nested template, between holes, and switches it out', () => {
    const view = (s: Rec) =>
      html`<p>${s.seconds}</p>
        ${
          s.recording
            ? html`<p>Recording…</p>`
            : html`<noscript><p>Needs JavaScript</p></noscript>${s.reason}`
        }
        <b>${s.reason}</b>`;
    for (const dev of [true, false]) {
      const root = serverDom(view(idle), dev);
      const ns = one(root, 'noscript');
      hydrate(view(idle), root);
      expect(one(root, 'noscript')).toBe(ns);
      expect(ns.textContent).toBe('<p>Needs JavaScript</p>');
      render(view(busy), root);
      expect(root.querySelector('noscript')).toBeNull();
      render(view(idle), root);
      // A client-rendered instance: exactly a fresh client render, its <noscript> empty.
      const fresh = container();
      render(view(idle), fresh);
      expect(canon(root)).toBe(canon(fresh));
      expect(one(root, 'noscript').childNodes).toHaveLength(0);
      cleanup();
    }
  });

  it('rejects a binding inside <noscript>: rule 3, before anything renders', () => {
    const root = container();
    expect(() => {
      // eslint-disable-next-line gyral/template -- the rule error under test
      render(html`<noscript><p>${'x'}</p></noscript>`, root);
    }).toThrow(/template rule 3\].*inside <noscript>/);
    expect(root.childNodes).toHaveLength(0);
  });
});
