// Tree builder for the normalizer (view/01-templates.md "Normalization"): turns the tokenizer's
// tokens into the tree the HTML parser builds for valid markup (WHATWG "tree construction":
// namespaces, void elements, raw text, the leading newline of <pre>/<listing>/<textarea>), so
// part paths match the browser's DOM. Markup the parser would repair is an error instead of
// being modelled (rule 7, repairs.ts), as are rules 3, 4, 6, 10, 12 and 13. An svg template's
// top level is SVG content, as if inside an <svg> (01 "svg templates", svg.ts).
import { decodeRefs, unquote } from './entities.js';
import {
  breaksOutOfForeign,
  contextOf,
  rootContext,
  startRepair,
  textRepair,
  type Context,
  type Ns,
} from './repairs.js';
import { formStateFix, msg, SVG_ONLY, VOID } from './rules.js';
import type { Source } from './source.js';
import { HTML_ONLY, namespacedAttr, SVG_HTML_POINT, svgAttr } from './svg.js';
import type { AttrToken, ContentMode, Sink, StartTag } from './tokenizer.js';

export interface ElementNode {
  readonly type: 'el';
  /** Lower-case name, and the name as written. */
  readonly name: string;
  readonly raw: string;
  readonly ns: Ns;
  /** Static and bound attributes; bound names normalized, multi strings decoded. */
  readonly attrs: readonly AttrToken[];
  /** A custom element's static attributes, decoded (server props); undefined otherwise. */
  readonly props: readonly (readonly [string, string])[] | undefined;
  /** No end tag: a void element, or a self-closed SVG/MathML element. */
  readonly empty: boolean;
  readonly children: TreeNode[];
  /** For <template>: the context its first start tag chose. */
  inner?: Context;
}

export type TreeNode =
  | ElementNode
  | { readonly type: 'text'; readonly raw: string }
  | { readonly type: 'comment'; readonly raw: string }
  | { readonly type: 'doctype'; readonly raw: string }
  | { readonly type: 'hole'; readonly kind: 'child' | 'text' };

const RAWTEXT = new Set('script style xmp iframe noembed noframes noscript plaintext'.split(' '));
const RCDATA = new Set(['textarea', 'title']);
const LEADING_NEWLINE = new Set(['pre', 'listing', 'textarea']);
const DOCUMENT = new Set(['html', 'head', 'body']);

function integrationPoint(el: ElementNode): boolean {
  if (el.ns === 'svg') return SVG_HTML_POINT.test(el.name);
  return el.ns === 'math' && /^(mi|mo|mn|ms|mtext)$/.test(el.name);
}

export class TreeBuilder implements Sink {
  readonly root: TreeNode[] = [];
  server = false;
  private readonly stack: ElementNode[] = [];
  private rootCtx: Context | undefined;
  /** The <pre>/<listing>/<textarea> whose first newline the parser drops, if just opened. */
  private fresh: ElementNode | undefined;

  /** `svg`: an svg template, whose top level is SVG content (01 "svg templates"). */
  constructor(
    private readonly src: Source,
    private readonly svg = false,
  ) {}

  private get children(): TreeNode[] {
    return this.stack.at(-1)?.children ?? this.root;
  }

  private context(): { ctx: Context; atRoot: boolean } {
    const top = this.stack.at(-1);
    if (top === undefined) return { ctx: this.rootCtx ?? 'body', atRoot: true };
    if (top.ns !== 'html') return { ctx: 'body', atRoot: false };
    if (top.name === 'template') return { ctx: top.inner ?? 'body', atRoot: true };
    return { ctx: contextOf(top.name), atRoot: false };
  }

  private inTemplate(): boolean {
    return this.stack.some((el) => el.ns === 'html' && el.name === 'template');
  }

  text(raw: string): void {
    const text = this.fresh !== undefined && raw.startsWith('\n') ? raw.slice(1) : raw;
    this.fresh = undefined;
    if (text === '') return;
    const { ctx, atRoot } = this.context();
    const repair = textRepair(text, ctx, atRoot);
    if (repair !== undefined) this.src.fail(7, repair);
    this.children.push({ type: 'text', raw: text });
  }

  comment(raw: string): void {
    this.fresh = undefined;
    this.children.push({ type: 'comment', raw });
  }

  doctype(raw: string): void {
    this.fresh = undefined;
    if (this.svg) this.src.fail(10, msg.htmlInSvg('!doctype', true));
    this.server = true;
    this.children.push({ type: 'doctype', raw });
  }

  hole(kind: 'child' | 'text'): void {
    this.fresh = undefined;
    if (this.inTemplate()) this.src.fail(3, msg.inTemplate());
    this.children.push({ type: 'hole', kind });
  }

  start(tag: StartTag): ContentMode {
    this.fresh = undefined;
    const { name } = tag;
    const ns = this.namespace(tag);
    if (ns === 'html') this.checkHtml(tag);
    if (this.inTemplate() && tag.attrs.some((a) => a.kind !== 'static')) {
      this.src.fail(3, msg.inTemplate());
    }
    const empty = ns === 'html' ? VOID.has(name) : tag.selfClosing;
    const custom = ns === 'html' && name.includes('-');
    const el: ElementNode = {
      type: 'el',
      name,
      raw: tag.raw,
      ns,
      attrs: this.attributes(tag, ns),
      props: custom ? this.props(tag) : undefined,
      empty,
      children: [],
    };
    this.children.push(el);
    if (empty) return 'data';
    this.stack.push(el);
    if (ns !== 'html') return 'data';
    if (LEADING_NEWLINE.has(name)) this.fresh = el;
    return RAWTEXT.has(name) ? 'rawtext' : RCDATA.has(name) ? 'rcdata' : 'data';
  }

  private namespace(tag: StartTag): Ns {
    const parent = this.stack.at(-1);
    if (parent === undefined ? !this.svg : parent.ns === 'html' || integrationPoint(parent)) {
      return tag.name === 'svg' ? 'svg' : tag.name === 'math' ? 'math' : 'html';
    }
    // An svg template's top level: SVG content, as inside the <svg> it renders in.
    if (parent === undefined) {
      const fontAttr = tag.attrs.some((a) => /^(color|face|size)$/i.test(a.name));
      if (breaksOutOfForeign(tag.name, fontAttr) || HTML_ONLY.has(tag.name)) {
        this.src.fail(10, msg.htmlInSvg(tag.raw, true));
      }
      return 'svg';
    }
    if (parent.name === 'annotation-xml' && tag.name === 'svg') return 'svg';
    if (parent.ns === 'svg' && HTML_ONLY.has(tag.name)) {
      this.src.fail(10, msg.htmlInSvg(tag.raw, false));
    }
    const fontAttr = tag.attrs.some((a) => /^(color|face|size)$/i.test(a.name));
    if (breaksOutOfForeign(tag.name, fontAttr)) {
      this.src.fail(
        7,
        msg.repaired(
          `<${tag.name}> inside <${parent.ns}> ends the <${parent.ns}> element`,
          `Put HTML inside <foreignObject>, or move it out of the <${parent.ns}>.`,
        ),
      );
    }
    return parent.ns;
  }

  private checkHtml(tag: StartTag): void {
    const { name } = tag;
    if (SVG_ONLY.has(name)) this.src.fail(10, msg.svgOnly(tag.raw));
    if (DOCUMENT.has(name)) this.server = true;
    if (tag.selfClosing && !VOID.has(name)) this.src.fail(6, msg.selfClosing(tag.raw));
    const top = this.stack.at(-1);
    if (top === undefined) this.rootCtx ??= rootContext(name);
    else if (top.ns === 'html' && top.name === 'template') top.inner ??= rootContext(name);
    const { ctx, atRoot } = this.context();
    const hidden = tag.attrs.some(
      (a) =>
        a.kind === 'static' &&
        a.name.toLowerCase() === 'type' &&
        /^["']?hidden["']?$/i.test(a.value ?? ''),
    );
    const repair = startRepair(name, ctx, atRoot, this.stack, hidden);
    if (repair !== undefined) this.src.fail(7, repair);
  }

  /**
   * Bound names as the parser spells them (not properties): lower case on HTML elements, SVG's
   * camelCase on SVG elements (svg.ts); rules 4, 7 (duplicates), 10 (namespaced), 13. A
   * static `style` gets its decoded value (`css`): the client applies it as a part (emit.ts).
   */
  private attributes(tag: StartTag, ns: Ns): AttrToken[] {
    const seen = new Set<string>();
    // A nested <template>'s content is out of the parts' reach: its static styles stay.
    const reach = !this.inTemplate();
    return tag.attrs.map((a) => {
      const name =
        a.kind === 'prop' || ns === 'math'
          ? a.name
          : ns === 'html'
            ? a.name.toLowerCase()
            : svgAttr(a.name);
      if (a.kind === 'prop' && ns === 'html') {
        const fix = formStateFix(tag.name, a.name);
        if (fix !== undefined) this.src.fail(4, msg.formState(tag.name, a.name, fix));
      }
      if ((a.kind === 'attr' || a.kind === 'bool') && ns !== 'html' && namespacedAttr(a.name)) {
        this.src.fail(10, msg.namespacedAttr(a.name));
      }
      if (a.kind !== 'prop' && a.kind !== 'hook') {
        const key = ns === 'math' ? a.name : a.name.toLowerCase();
        if (seen.has(key)) {
          this.src.fail(
            7,
            msg.repaired(
              `${key} appears twice on <${tag.raw}>, and the parser keeps only the first`,
              `Write it once; to mix static and dynamic text, quote one value: ${key}="a \${…}".`,
            ),
          );
        }
        seen.add(key);
      }
      if (a.kind === 'static') {
        if (!reach || a.name.toLowerCase() !== 'style') return a;
        return { ...a, css: a.value === null ? '' : this.decode(unquote(a.value)) };
      }
      const strings = a.strings?.map((s) => this.decode(s));
      return strings === undefined ? { kind: a.kind, name } : { kind: a.kind, name, strings };
    });
  }

  private props(tag: StartTag): [string, string][] {
    return tag.attrs.flatMap((a) =>
      a.kind === 'static'
        ? [[a.name.toLowerCase(), a.value === null ? '' : this.decode(unquote(a.value))]]
        : [],
    );
  }

  private decode(raw: string): string {
    return decodeRefs(raw, (ref) => this.src.fail(13, msg.charRef(ref)));
  }

  end(name: string): void {
    this.fresh = undefined;
    const top = this.stack.at(-1);
    if (top?.name === name) {
      this.close(top);
      return;
    }
    if (VOID.has(name) && name !== 'br') return; // ignored by the parser
    const open = this.stack.some((el) => el.name === name);
    this.src.fail(
      7,
      open && top !== undefined
        ? msg.repaired(
            `</${name}> while <${top.raw}> is still open`,
            `Close </${top.raw}> first (end tags must match their start tags).`,
          )
        : msg.repaired(
            `</${name}> has no matching start tag${name === 'br' || name === 'p' ? `, so the parser creates an empty <${name}>` : ''}`,
            name === 'br' ? 'Write <br>.' : 'Remove it.',
          ),
    );
  }

  private close(el: ElementNode): void {
    this.stack.pop();
    const hasText = el.children.some((c) => c.type === 'hole' && c.kind === 'text');
    if (hasText && el.children.length !== 1) this.src.fail(12, msg.textContent(el.raw));
  }

  finish(): void {
    for (let el = this.stack.at(-1); el !== undefined; el = this.stack.at(-1)) this.close(el);
  }
}
