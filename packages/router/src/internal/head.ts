// The client half of the head model (ADR 0019): makes the document's managed <head> elements
// (marked with data-gyral-head) match a `Head`. Keyed and minimal: an element whose tag,
// attributes, text and position already match is not touched, so the first navigation after
// hydration adopts the server's elements and writes nothing. Bundled only by apps that call
// setHead(), which puts `applyHead` in internal/head-slot.ts.
import { type Head } from '@gyral/core';
import { HEAD_ATTRIBUTE, headEntries, type HeadEntry } from '@gyral/core/internal';

let warned = false;

/** Makes `el` match `entry`; false when its JSON-LD text couldn't be written. */
function sync(el: Element, entry: HeadEntry): boolean {
  // A key names every attribute but `href`/`content` (core's headEntries), so an element found
  // by its key never carries attributes the entry lacks: only values can differ.
  for (const [name, value] of entry.attributes) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }
  if (entry.text !== undefined && el.textContent !== entry.text) {
    try {
      el.textContent = entry.text;
    } catch {
      // Enforced Trusted Types refuse a plain string as a script's text, even for a data block.
      // Crawlers read the server's JSON-LD; the client skips the update (ADR 0019).
      if (!warned) {
        warned = true;
        console.warn('gyral router: setHead() skipped JSON-LD, Trusted Types are enforced.');
      }
      return false;
    }
  }
  return true;
}

export function applyHead(doc: Document, head: Head): void {
  if (doc.title !== head.title) doc.title = head.title;
  const root = doc.documentElement;
  if (head.lang !== undefined && root.lang !== head.lang) root.lang = head.lang;
  if (head.dir !== undefined && root.dir !== head.dir) root.dir = head.dir;

  const managed = new Map<string, Element>();
  for (const el of doc.head.querySelectorAll(`[${HEAD_ATTRIBUTE}]`)) {
    managed.set(el.getAttribute(HEAD_ATTRIBUTE) ?? '', el);
  }
  // Managed elements follow <title>, in entry order.
  let previous: Element | null = doc.head.querySelector('title');
  for (const entry of headEntries(head)) {
    let el = managed.get(entry.key);
    managed.delete(entry.key);
    const fresh = el?.localName !== entry.tag;
    if (fresh) {
      el?.remove();
      el = doc.createElement(entry.tag);
      el.setAttribute(HEAD_ATTRIBUTE, entry.key);
    }
    if (el === undefined || (!sync(el, entry) && fresh)) continue;
    if (previous === null) doc.head.prepend(el);
    else if (previous.nextElementSibling !== el) previous.after(el);
    previous = el;
  }
  // Whatever the new head doesn't name goes: a noindex or JSON-LD can't outlive its page.
  for (const el of managed.values()) el.remove();
}
