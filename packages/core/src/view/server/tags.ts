// Start tags and custom elements for the server renderer (view/06-server.md "Writing a template
// result", "Components"): attribute, boolean and hook holes, and what a custom element's
// `open`/`openEnd`/`close` segments do. A Gyral component's start tag is written here, but
// its content (seed, shadow root, view) is deferred: the walk returns strings with the
// deferred components between them, and `render` (index.ts) expands each one in its own step,
// so every component boundary is a chunk boundary. A provider (`<gyral-stores>`) is a plain
// element that gives its subtree a scope until its end tag.
import type { Segment } from '../normalize/types.js';
import {
  serverComponent,
  serverProvider,
  type ServerComponent,
  type ServerProvider,
  type ServerRenderInput,
} from '../registry.js';
import { hookSpec, type HookResult } from '../render/hooks.js';
import { badHook } from '../render/warn.js';
import { escapeAttr, onlyWhitespace } from './escape.js';
import { absent, attrText, checkAttrName, lightChildrenError, multiText } from './values.js';

/** A component whose content is written later, in its own render step. */
export interface Deferred {
  readonly component: ServerComponent;
  readonly input: ServerRenderInput;
}

/**
 * A render's `style` attribute values for a CSP (ADR 0020): each distinct value as the DOM sees
 * it (decoded), mapped to where it was first written (the template's `loc` or id; `''` when
 * neither is known).
 */
export type StyleValues = Map<string, string>;

/** What a walk produces: markup, with deferred components in document order. */
export type Item = string | Deferred;

/** A custom element's start tag while its attribute holes are written. */
export interface Opening {
  readonly tag: string;
  readonly component: ServerComponent | undefined;
  readonly provider: ServerProvider | undefined;
  readonly attributes: Record<string, string>;
  readonly properties: Record<string, unknown>;
}

/** An open custom element until its end tag: plain, a provider, or a light component. */
export type Frame =
  | { readonly k: 'plain' }
  | { readonly k: 'provider'; readonly outer: unknown }
  | { readonly k: 'light'; readonly tag: string; readonly items: number };

export const PLAIN: Frame = { k: 'plain' };

export class Markup {
  protected buf = '';
  protected readonly items: Item[] = [];

  /** The template being written, for `styles` (its `loc` or id). */
  protected where = '';

  /**
   * `dev`: development markers and checks. `scope`: the nearest provider's scope, passed to
   * components (undefined: the request's). `styles`: collects every `style` value written.
   */
  constructor(
    protected readonly dev: boolean,
    protected scope: unknown,
    protected readonly styles?: StyleValues,
  ) {}

  /** Records a `style` value the DOM will see (empty values declare nothing). */
  protected style(value: string): void {
    if (value !== '' && this.styles !== undefined && !this.styles.has(value)) {
      this.styles.set(value, this.where);
    }
  }

  write(markup: string): void {
    this.buf += markup;
  }

  /** The markup and deferred components written so far. */
  done(): Item[] {
    this.flush();
    return this.items;
  }

  private flush(): void {
    if (this.buf !== '') this.items.push(this.buf);
    this.buf = '';
  }

  /** `name=${v}` or `name="a ${v} b"`; returns the index of the next value. */
  protected attr(
    s: Extract<Segment, { k: 'attr' }>,
    values: readonly unknown[],
    at: number,
    opening: Opening | undefined,
  ): number {
    const { name, strings } = s;
    const value =
      strings === undefined
        ? attrText(values[at], s, name, this.dev)
        : multiText(values, at, strings, s, name, this.dev);
    if (value !== null) this.valued(name, value, opening);
    return at + (strings === undefined ? 1 : strings.length - 1);
  }

  private valued(name: string, value: string, opening: Opening | undefined): void {
    this.buf += ` ${name}="${escapeAttr(value)}"`;
    if (name === 'style') this.style(value);
    if (opening !== undefined) opening.attributes[name] = value;
  }

  /** A present boolean attribute (`?name`, or `true` from a hook's server half). */
  protected bare(name: string, opening: Opening | undefined): void {
    this.buf += ` ${name}`;
    if (opening !== undefined) opening.attributes[name] = '';
  }

  /** An element hook: its server half's attributes (02 "Element hooks"). */
  protected hook(v: unknown, opening: Opening | undefined): void {
    if (absent(v)) return;
    const spec = hookSpec(v);
    if (spec === undefined) {
      if (this.dev) badHook(v);
      return;
    }
    const attributes = spec.server?.((v as HookResult).args) ?? {};
    for (const [name, value] of Object.entries(attributes)) {
      checkAttrName(name);
      if (value === true) this.bare(name, opening);
      else this.valued(name, value, opening);
    }
  }

  /** A custom element's start tag: a Gyral component, a provider, or a plain element. */
  protected open(
    tag: string,
    html: string,
    attrs: readonly (readonly [string, string])[],
  ): Opening | undefined {
    this.buf += html;
    const component = serverComponent(tag);
    const provider = component === undefined ? serverProvider(tag) : undefined;
    if (component === undefined && provider === undefined) return undefined;
    return { tag, component, provider, attributes: Object.fromEntries(attrs), properties: {} };
  }

  protected openEnd(opening: Opening | undefined): Frame {
    if (opening === undefined) {
      this.buf += '>';
      return PLAIN;
    }
    const { attributes, properties } = opening;
    const messages = properties['initialMessages'];
    const input: ServerRenderInput = {
      attributes,
      properties,
      initialMessages: Array.isArray(messages) ? (messages as readonly unknown[]) : undefined,
      scope: this.scope,
    };
    if (opening.provider !== undefined) {
      const provided = opening.provider.open(input);
      for (const [name, value] of Object.entries(provided.attributes)) {
        this.buf += ` ${name}="${escapeAttr(value)}"`;
      }
      this.buf += '>';
      const frame: Frame = { k: 'provider', outer: this.scope };
      this.scope = provided.scope;
      return frame;
    }
    const component = opening.component as ServerComponent; // Sound: open() set one of the two.
    this.flush();
    this.items.push({ component, input });
    return component.light ? { k: 'light', tag: opening.tag, items: this.items.length } : PLAIN;
  }

  protected close(frame: Frame, tag: string): void {
    if (frame.k === 'provider') this.scope = frame.outer;
    else if (frame.k === 'light') {
      // Whitespace-only children are dropped; anything else is an error (ADR 0014).
      if (this.items.length !== frame.items || !onlyWhitespace(this.buf)) {
        lightChildrenError(frame.tag);
      }
      this.buf = '';
    }
    this.buf += `</${tag}>`;
  }
}
