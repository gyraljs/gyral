// Rendering one Gyral component in place (view/06-server.md "Components"): the end of its start
// tag (light mark, seed, island attributes), then its view, inside a declarative shadow root
// with the component's CSS (08 "Server") or as light-DOM children (ADR 0014). The parent's
// children of a shadow component follow in the parent's walk, after the `<template>`.
import { ISLAND_ATTRIBUTE, LIGHT_ATTRIBUTE, SEED_ATTRIBUTE } from '../attributes.js';
import type { ServerComponent } from '../registry.js';
import { escapeSeed, styleSafe } from './escape.js';
import { ROOT, Writer, type Deferred, type Item, type StyleValues } from './writer.js';

const styleTexts = new WeakMap<ServerComponent, string>();

/**
 * The text of a shadow component's `<style>` (its CSS texts joined by newlines, `</style`
 * escaped), exactly as written, so `styleHashes()` hashes what the browser sees. `''`: none.
 */
export function styleText(component: ServerComponent): string {
  let text = styleTexts.get(component);
  if (text === undefined) {
    text = styleSafe(component.styles.join('\n'));
    styleTexts.set(component, text);
  }
  return text;
}

/** Writes a deferred component; nested components are deferred again. */
export function expand(
  { component, input }: Deferred,
  dev: boolean,
  styles: StyleValues | undefined,
): Item[] {
  const { view, seed } = component.render(input);
  const w = new Writer(dev, input.scope, styles);
  let tail = component.light ? ` ${LIGHT_ATTRIBUTE}` : '';
  // Single-quoted, so the JSON's double quotes stay raw (ADR 0012).
  tail += ` ${SEED_ATTRIBUTE}='${escapeSeed(JSON.stringify(seed))}'`;
  if (component.hydrate !== 'load') {
    tail += ` defer-hydration ${ISLAND_ATTRIBUTE}="${component.hydrate}"`;
  }
  w.write(`${tail}>`);
  if (component.light) {
    w.child(view, undefined, ROOT);
    return w.done();
  }
  const css = styleText(component);
  const focus = component.delegatesFocus === true ? ' shadowrootdelegatesfocus' : '';
  w.write(`<template shadowrootmode="open"${focus}>${css === '' ? '' : `<style>${css}</style>`}`);
  w.child(view, undefined, ROOT);
  w.write('</template>');
  return w.done();
}
