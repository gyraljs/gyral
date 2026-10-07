// Whitespace minification for templates (view/01-templates.md "Whitespace", ADR 0016 addendum).
// Moved from core's template-whitespace.ts (Gyral's own design) into the view layer's
// normalizer, so the compiler, the runtime preparer and the server minify identically.
//
// Rules:
// - Whitespace-only text that contains a newline is removed when it sits next to a template
//   edge, a block-level tag (head-only tags count: <head>, <meta>, <link>, <base>, <title>),
//   or the inside edge of a <button>/<select>/<svg> (never rendered there). Inside <head>,
//   whitespace-only text is always removed, newline or not, between holes too: nothing there
//   renders. Between two inline neighbours (phrasing elements, custom elements, holes,
//   comments) it collapses to one space.
// - Other runs of whitespace in text collapse to one space; a leading or trailing run with a
//   newline next to one of those edges is removed.
// - <pre>, <textarea>, <script>, <style> and <title> contents, tags and attribute values,
//   and comments are copied unchanged. Holes never move: the result has the same number of
//   strings.
// The function is idempotent: minifying minified strings changes nothing.

/** Elements whose box is block-level (or never laid out inline) by default. */
const BLOCK = new Set(
  (
    'address article aside blockquote body caption col colgroup datalist dd details dialog div ' +
    'dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html ' +
    'legend li main menu nav ol optgroup option p pre search section select summary table tbody ' +
    'td tfoot th thead tr ul ' +
    // Head-only elements: never rendered at all, so never inline.
    'base link meta title ' +
    // SVG containers and shapes: whitespace between them is never rendered.
    'circle clippath defs ellipse g line lineargradient marker mask path pattern polygon ' +
    'polyline radialgradient rect stop symbol use'
  ).split(' '),
);

/** Elements whose text content is copied verbatim (whitespace is meaningful or raw text). */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const PRESERVE = 'pre';

/** What sits on one side of a text chunk. */
type Edge = 'template' | 'inline' | 'block';

/**
 * Inline-block controls: they sit inline among their neighbours, but whitespace at the start or
 * end of their own content is never rendered (it is at the edge of their own line box). Same
 * for <svg>: SVG content renders no text outside its text elements.
 */
const INLINE_BOX = new Set(['button', 'select', 'svg']);

/**
 * The edge a tag makes for the text next to it. `inside` is true when the text is inside the
 * element (after its start tag, or before its end tag).
 */
function edgeOfTag(name: string, inside: boolean): Edge {
  const lower = name.toLowerCase();
  if (BLOCK.has(lower)) return 'block';
  return inside && INLINE_BOX.has(lower) ? 'block' : 'inline';
}

const WS = /^[ \t\n\r\f]*$/;
const RUN = /[ \t\n\r\f]+/g;

/** `head`: the text is inside `<head>`, which is never rendered. */
function minifyChunk(text: string, left: Edge, right: Edge, head: boolean): string {
  if (text === '') return text;
  if (WS.test(text)) {
    const removable =
      head ||
      (/[\n\r]/.test(text) &&
        (left === 'template' || right === 'template' || left === 'block' || right === 'block'));
    return removable ? '' : ' ';
  }
  // Mixed text: a leading or trailing run with a newline next to a removable edge goes too.
  const dropStart = left !== 'inline' && /^[ \t\f]*[\n\r]/.test(text);
  const dropEnd = right !== 'inline' && /[\n\r][ \t\n\r\f]*$/.test(text);
  let body = text.replace(RUN, ' ');
  if (dropStart) body = body.replace(/^ /, '');
  if (dropEnd) body = body.replace(/ $/, '');
  return body;
}

const Mode = { Text: 0, Tag: 1, Comment: 2, RawText: 3 } as const;
type Mode = (typeof Mode)[keyof typeof Mode];

interface Scan {
  mode: Mode;
  /** Quote char while inside an attribute value in a tag, else ''. */
  quote: string;
  /** Name of the tag being read (lower case), and whether it is a closing tag. */
  tagName: string;
  closing: boolean;
  /** Raw-text element we are inside (its contents are copied verbatim). */
  rawName: string;
  /** Depth of open <pre> elements: text is copied verbatim while > 0. */
  preDepth: number;
  /** Inside <head> (until </head> or <body>). */
  head: boolean;
  /** Edge type of the boundary before the current text chunk. */
  left: Edge;
}

const TAG_START = /^<(\/?)([A-Za-z!?][^\s/>]*)/;

/** Minify one segment, carrying the HTML scan state across bindings. */
function minifySegment(segment: string, state: Scan, last: boolean): string {
  let out = '';
  let chunk = '';
  const flushText = (right: Edge): void => {
    out += state.preDepth > 0 ? chunk : minifyChunk(chunk, state.left, right, state.head);
    chunk = '';
  };
  let i = 0;
  while (i < segment.length) {
    const ch = segment.charAt(i);
    if (state.mode === Mode.Comment) {
      if (segment.startsWith('-->', i)) {
        out += '-->';
        i += 3;
        state.mode = Mode.Text;
        state.left = 'inline';
      } else {
        out += ch;
        i += 1;
      }
      continue;
    }
    if (state.mode === Mode.RawText) {
      const close = `</${state.rawName}`;
      if (segment.slice(i, i + close.length).toLowerCase() === close) {
        state.mode = Mode.Text;
        state.left = 'inline';
        continue; // the closing tag is read in Text mode
      }
      out += ch;
      i += 1;
      continue;
    }
    if (state.mode === Mode.Tag) {
      out += ch;
      i += 1;
      if (state.quote !== '') {
        if (ch === state.quote) state.quote = '';
      } else if (ch === '"' || ch === "'") {
        state.quote = ch;
      } else if (ch === '>') {
        endTag(state, out.endsWith('/>'));
      }
      continue;
    }
    // Text mode.
    if (ch === '<' && segment.startsWith('<!--', i)) {
      flushText('inline');
      state.mode = Mode.Comment;
      out += '<!--';
      i += 4;
      continue;
    }
    const tag = ch === '<' ? TAG_START.exec(segment.slice(i)) : null;
    if (tag !== null) {
      const name = (tag[2] ?? '').toLowerCase();
      const closing = tag[1] === '/';
      flushText(edgeOfTag(name, closing));
      state.closing = closing;
      state.tagName = name;
      state.mode = Mode.Tag;
      out += tag[0];
      i += tag[0].length;
      continue;
    }
    chunk += ch;
    i += 1;
  }
  if (state.mode === Mode.Text) {
    flushText(last ? 'template' : 'inline');
    state.left = 'inline'; // the next segment starts after a binding
  }
  return out;
}

function endTag(state: Scan, selfClosing: boolean): void {
  const name = state.tagName;
  state.mode = Mode.Text;
  state.left = edgeOfTag(name, !state.closing && !selfClosing);
  if (name === 'head' && !selfClosing) state.head = !state.closing;
  if (name === 'body') state.head = false;
  if (name === PRESERVE) {
    if (state.closing) state.preDepth = Math.max(0, state.preDepth - 1);
    else if (!selfClosing) state.preDepth += 1;
  }
  if (!state.closing && !selfClosing && RAW_TEXT.has(name)) {
    state.mode = Mode.RawText;
    state.rawName = name;
  }
}

/** Minified copy of template strings (same length, bindings unmoved). Idempotent. */
export function minifyStrings(strings: readonly string[]): string[] {
  const state: Scan = {
    mode: Mode.Text,
    quote: '',
    tagName: '',
    closing: false,
    rawName: '',
    preDepth: 0,
    head: false,
    left: 'template',
  };
  return strings.map((segment, index) =>
    minifySegment(segment, state, index === strings.length - 1),
  );
}
