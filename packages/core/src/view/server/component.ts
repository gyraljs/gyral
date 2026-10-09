// Rendering one Gyral component in place (view/06-server.md "Components"): the end of its start
// tag (light mark, seed, island attributes), then its view, inside a declarative shadow root
// with the component's CSS (08 "Server") or as light-DOM children (ADR 0014). The parent's
// children of a shadow component follow in the parent's walk, after the `<template>`.
import {
  ERROR_ATTRIBUTE,
  ISLAND_ATTRIBUTE,
  LIGHT_ATTRIBUTE,
  SEED_ATTRIBUTE,
} from '../attributes.js';
import type { ServerComponent, ServerRendering } from '../registry.js';
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

/**
 * Writes a deferred component; nested components are deferred again. A component that fails
 * (ADR 0024) writes its error view instead, marked `data-gyral-error`, and `onError` hears it.
 */
export function expand(
  { component, input }: Deferred,
  dev: boolean,
  styles: StyleValues | undefined,
  onError: (error: unknown) => void,
): Item[] {
  let rendering = component.render(input);
  let items: Item[];
  try {
    items = write(component, input.scope, rendering, dev, styles);
  } catch (cause) {
    if (component.fallback === undefined || rendering.failed !== undefined) throw cause;
    rendering = component.fallback(cause);
    items = write(component, input.scope, rendering, dev, styles);
  }
  if (rendering.failed !== undefined) onError(rendering.failed);
  return items;
}

function write(
  component: ServerComponent,
  scope: unknown,
  { view, seed, failed }: ServerRendering,
  dev: boolean,
  styles: StyleValues | undefined,
): Item[] {
  const w = new Writer(dev, scope, styles);
  let tail = component.light ? ` ${LIGHT_ATTRIBUTE}` : '';
  // Single-quoted, so the JSON's double quotes stay raw (ADR 0012).
  if (failed === undefined) tail += ` ${SEED_ATTRIBUTE}='${escapeSeed(JSON.stringify(seed))}'`;
  else tail += ` ${ERROR_ATTRIBUTE}`;
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
