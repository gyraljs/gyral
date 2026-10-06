// view/README.md "Conformance", property 1: the server string for a template result, parsed by
// the browser (which also attaches declarative shadow roots), has the same DOM as the client
// rendering of the same result into a fresh root: structure, attributes, text, and form state
// by its live properties. Components render on both sides (shadow and light).
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { html, settled } from '../../src/index.js';
import { renderToString } from '../../src/server.js';
import { render, type ChildValue } from '../../src/view/index.js';
import './conformance-components.js';
import { view } from './server-arbitrary.js';

/** Server-only attributes: hydration's inputs, not part of the view (06 "Components"). */
const SERVER_ONLY = new Set(['data-gyral-seed', 'data-gyral-light']);

/** Live form state, compared by property (README "Conformance"). */
function live(el: Element): string {
  if (el instanceof HTMLInputElement) return ` .value=${el.value} .checked=${String(el.checked)}`;
  if (el instanceof HTMLOptionElement) return ` .selected=${String(el.selected)}`;
  if (el instanceof HTMLTextAreaElement) return ` .value=${JSON.stringify(el.value)}`;
  return '';
}

/**
 * A canonical form of a subtree: adjacent text merged and empty text dropped (the parser joins
 * what the client keeps apart), development markers dropped, shadow roots included without
 * their `<style>` (the client adopts a shared sheet instead, 08).
 */
function canon(parent: ParentNode, shadow = false): string {
  let out = '';
  let text = '';
  const flush = () => {
    if (text !== '') out += JSON.stringify(text);
    text = '';
  };
  for (const node of parent.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node as Text).data;
      continue;
    }
    if (node.nodeType === Node.COMMENT_NODE) {
      const data = (node as Comment).data;
      if (data.startsWith('gyral:')) continue;
      flush();
      out += `<!--${data}-->`;
      continue;
    }
    const el = node as Element;
    if (shadow && el.localName === 'style') continue;
    flush();
    const attrs = [...el.attributes]
      .filter((a) => !SERVER_ONLY.has(a.name))
      .map((a) => ` ${a.name}=${JSON.stringify(a.value)}`)
      .sort()
      .join('');
    const root = el.shadowRoot === null ? '' : `#shadow(${canon(el.shadowRoot, true)})`;
    const content = el instanceof HTMLTemplateElement ? canon(el.content) : canon(el);
    out += `<${el.localName}${attrs}${live(el)}>${root}${content}</${el.localName}>`;
  }
  flush();
  return out;
}

let containers: HTMLElement[] = [];

afterEach(() => {
  for (const c of containers) c.remove();
  containers = [];
});

async function client(value: ChildValue): Promise<string> {
  const root = document.createElement('div');
  containers.push(root);
  document.body.append(root);
  render(value, root);
  await settled();
  return canon(root);
}

function server(value: ChildValue, dev: boolean): string {
  // A document without a browsing context: no element upgrades or hydrates, but declarative
  // shadow roots are attached, as on a page load. (Chromium's Document.parseHTMLUnsafe drops
  // comments, so it can't be used here.)
  const doc = document.implementation.createHTMLDocument('');
  doc.body.setHTMLUnsafe(renderToString(value, { dev }));
  return canon(doc.body);
}

describe('server equals client (view/README.md "Conformance", property 1)', () => {
  it('matches a hand-written case with every hole kind and both component modes', async () => {
    const value = html`<div class="a ${'b'}" title=${`"<&>'`}>${'x & y'} ${42}</div>
      <cf-shadow label="L" .items=${['i<1>', 'i2']}><b>slotted</b></cf-shadow
      ><cf-light n=${2}></cf-light>`;
    expect(server(value, true)).toBe(await client(value));
  });

  it('holds for generated template results', async () => {
    await fc.assert(
      fc.asyncProperty(view, fc.boolean(), async (value, dev) => {
        const expected = await client(value);
        expect(server(value, dev)).toBe(expected);
        for (const c of containers) c.remove();
        containers = [];
      }),
      { numRuns: 150 },
    );
  });
});
