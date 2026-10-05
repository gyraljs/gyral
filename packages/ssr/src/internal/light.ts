// Light-DOM components on the server (docs/design-docs/0014-light-dom.md).
//
// Lit SSR only writes a component's view inside a Declarative Shadow DOM template. For
// `shadow: false` components the renderer below brackets the view with two markers, and
// LightFilter rewrites the stream: the DSD wrapper and the markers are dropped (the view
// becomes the element's plain children), and Lit's hydration comments inside light regions
// are hidden (`<!--gyral:lit-part …-->`) so an ancestor's hydrate() walk ignores them. Each
// light host reveals its own markers on its first client update and hydrates in place
// (ADR 0014 addendum). Nested shadow components keep their DSD and markers as they are.
import { HIDDEN_MARKER, isLightComponent } from '@gyral/core';
import { LitElementRenderer } from '@lit-labs/ssr';
import type { RenderInfo } from '@lit-labs/ssr';

const OPEN = '<!--gyral:light-->';
const CLOSE = '<!--/gyral:light-->';

type Thunked = NonNullable<ReturnType<LitElementRenderer['renderShadow']>>;

export class GyralLightRenderer extends LitElementRenderer {
  static override matchesClass(ctor: typeof HTMLElement): boolean {
    return isLightComponent(ctor);
  }

  override renderShadow(renderInfo: RenderInfo): Thunked | undefined {
    const view = super.renderShadow(renderInfo);
    return view === undefined ? undefined : [OPEN, ...view, CLOSE];
  }
}

// Tokens that change nesting or are dropped. Each is one `<…>` with no `<` inside.
const TOKEN =
  /<template\b[^>]*>|<\/template>|<!--\/?gyral:light-->|<!--\/?lit-(?:part|node)\b[^>]*-->/g;

type Frame = 'light' | 'template';

/** Rewrites streamed HTML so light-DOM views come out as plain children (see above). */
export class LightFilter {
  #buffer = '';
  readonly #stack: Frame[] = [];
  /** A `<template …>` held back until we know whether a light view starts inside it. */
  #heldTemplate: string | undefined;
  #dropNextTemplateClose = false;

  push(text: string): string {
    this.#buffer += text;
    // Keep an unfinished `<…` for the next chunk.
    const open = this.#buffer.lastIndexOf('<');
    const cut = open !== -1 && !this.#buffer.includes('>', open) ? open : this.#buffer.length;
    const ready = this.#buffer.slice(0, cut);
    this.#buffer = this.#buffer.slice(cut);
    return this.#rewrite(ready);
  }

  flush(): string {
    const rest = this.#rewrite(this.#buffer);
    this.#buffer = '';
    return rest + this.#release();
  }

  #release(): string {
    const held = this.#heldTemplate ?? '';
    if (held !== '') this.#stack.push('template');
    this.#heldTemplate = undefined;
    return held;
  }

  #rewrite(text: string): string {
    let out = '';
    let last = 0;
    for (const match of text.matchAll(TOKEN)) {
      const token = match[0];
      const between = text.slice(last, match.index);
      last = match.index + token.length;
      if (between !== '') out += this.#release() + between;
      out += this.#token(token);
    }
    const tail = text.slice(last);
    return tail === '' ? out : out + this.#release() + tail;
  }

  #token(token: string): string {
    if (token === OPEN) {
      // The DSD wrapper of a light view: drop both. Its close tag goes with CLOSE.
      this.#heldTemplate = undefined;
      this.#stack.push('light');
      return '';
    }
    const released = this.#release();
    if (token.startsWith('<template')) {
      this.#heldTemplate = token;
      return released;
    }
    if (token === CLOSE) {
      this.#stack.pop();
      this.#dropNextTemplateClose = true;
      return released;
    }
    if (token === '</template>') {
      if (this.#dropNextTemplateClose) {
        this.#dropNextTemplateClose = false;
        return released;
      }
      this.#stack.pop();
      return released + token;
    }
    // A Lit hydration comment: hidden inside light regions, kept as is elsewhere.
    return this.#stack.at(-1) === 'light'
      ? released + token.replace('<!--', `<!--${HIDDEN_MARKER}`)
      : released + token;
  }
}
