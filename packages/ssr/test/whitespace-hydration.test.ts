import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { settled } from '@gyral/core';
import serverHtml from './fixtures/whitespace.ssr.html?raw';

interface Live extends HTMLElement {
  send(msg: { _tag: 'Rename'; name: string }): void;
}

let page: MountedSsr | undefined;
const errors = vi.spyOn(console, 'error');

const el = (tag: string): Live => {
  const found = document.querySelector(tag);
  if (!(found instanceof HTMLElement)) throw new Error(`no ${tag}`);
  return found as Live;
};
const root = (tag: string): ParentNode => el(tag).shadowRoot ?? el(tag);

beforeAll(async () => {
  page = mountSsr(serverHtml);
  await import('./support/whitespace.js');
  await hydrated(page);
});

afterAll(() => {
  page?.unmount();
  errors.mockRestore();
});

// Re-enable in Phase 4/5 (gyral-g1r.9 / gyral-g1r.10): needs the Gyral server renderer / hydration.
describe.skip('indented templates hydrate in place (gyral-9rf)', () => {
  it('hydrates without mismatch and stays live', async () => {
    const before = root('test-ws-table').querySelector('tr');
    el('test-ws-table').send({ _tag: 'Rename', name: 'Grace' });
    await settled();
    expect(root('test-ws-table').querySelector('tr')).toBe(before);
    expect(root('test-ws-table').querySelector('b')?.textContent).toBe('Grace');
    expect(errors).not.toHaveBeenCalled();
  });

  it('keeps inline spacing and <pre> text', () => {
    const p = root('test-ws-table').querySelector('.greeting');
    expect(p?.textContent.replace(/\s+/g, ' ').trim()).toBe('Hello Grace again');
    // The HTML parser drops the newline right after <pre>; the rest is kept verbatim.
    expect(root('test-ws-table').querySelector('pre')?.textContent).toBe('  keep   this\n');
    const light = root('test-ws-light').querySelector('.greeting');
    expect(light?.textContent.replace(/\s+/g, ' ').trim()).toBe('Hello Ada again');
  });

  it('builds 13 nodes per table row: 6 elements, 3 texts, 4 Lit markers', () => {
    const row = root('test-ws-table').querySelector('tr');
    if (row === null) throw new Error('no row');
    const nodes: Node[] = [];
    const walk = (n: Node): void => {
      for (const c of n.childNodes) {
        nodes.push(c);
        walk(c);
      }
    };
    nodes.push(row);
    walk(row);
    const count = (type: number): number => nodes.filter((n) => n.nodeType === type).length;
    expect(count(Node.ELEMENT_NODE)).toBe(6);
    expect(count(Node.TEXT_NODE)).toBe(3);
    expect(count(Node.COMMENT_NODE)).toBe(4);
    expect(nodes).toHaveLength(13);
  });
});
