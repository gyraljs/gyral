// Helpers for the client renderer's conformance tests (view/02-bindings.md, view/03-lists.md).
import { render, type ChildValue } from '../../src/view/index.js';

/** A fresh, connected container. */
export function mount(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

/** The markup `value` renders into a fresh container. */
export function fresh(value: ChildValue): string {
  const el = document.createElement('div');
  render(value, el);
  return el.innerHTML;
}

/** Renders `value` into `el` and returns the resulting markup. */
export function draw(el: Element | ShadowRoot | DocumentFragment, value: ChildValue): string {
  render(value, el);
  return el instanceof DocumentFragment ? [...el.childNodes].map(markup).join('') : el.innerHTML;
}

function markup(node: Node): string {
  if (node instanceof Element) return node.outerHTML;
  if (node instanceof Comment) return `<!--${node.data}-->`;
  return node.textContent ?? '';
}

/** Records attribute and child-list mutations under `el` (to prove writes are skipped). */
export function watch(el: Node): { take(): MutationRecord[] } {
  const observer = new MutationObserver(() => undefined);
  observer.observe(el, { attributes: true, childList: true, characterData: true, subtree: true });
  return { take: () => observer.takeRecords() };
}
