// HTML tokenizer over a template's static strings (view/01-templates.md "Normalization" step 1),
// after the WHATWG HTML tokenizer states: data, tag open, tag name, before/after attribute
// name, attribute value (double/single/unquoted), self-closing start tag, comment, bogus
// comment, DOCTYPE, RAWTEXT (<script>, <style>, …) and RCDATA (<textarea>, <title>). The state
// at each hole decides its kind (view/02-bindings.md) or a rule violation (rules 1, 2, 3, 5).
// Start-tag states live in tag-states.ts. The tree builder (tree.ts) receives the tokens and
// picks the content mode after each start tag.
import { msg } from './rules.js';
import type { Source } from './source.js';
import { TagStates } from './tag-states.js';
import { isWs, S, TAG_NAME, type Sink, type State } from './tokens.js';

export type { AttrToken, ContentMode, Sink, StartTag } from './tokens.js';

/** Tokenizes `src.strings`, sending tokens and holes to `sink`. */
export function tokenize(src: Source, sink: Sink): void {
  new Tokenizer(src, sink).run();
}

class Tokenizer extends TagStates {
  private text = '';

  run(): void {
    const { src } = this;
    for (src.i = 0; src.i < src.strings.length; src.i++) {
      const s = src.strings[src.i] ?? '';
      src.pos = 0;
      while (src.pos < s.length) this.step(s);
      if (!src.last) this.hole();
    }
    this.finish();
  }

  private flushText(): void {
    if (this.text !== '') this.sink.text(this.text);
    this.text = '';
  }

  private step(s: string): void {
    const { src } = this;
    switch (this.state) {
      case S.Data: {
        this.data(s);
        return;
      }
      case S.RawText:
      case S.RcData: {
        this.rawText(s);
        return;
      }
      case S.Comment: {
        this.comment(s);
        return;
      }
      case S.Bogus:
      case S.Doctype: {
        const end = s.indexOf('>', src.pos);
        this.buf += s.slice(src.pos, end < 0 ? s.length : end + 1);
        src.pos = end < 0 ? s.length : end + 1;
        if (end < 0) return;
        if (this.state === S.Doctype) this.sink.doctype(this.buf);
        else this.sink.comment(this.buf);
        this.state = S.Data;
        return;
      }
      case S.EndTag: {
        const end = s.indexOf('>', src.pos);
        src.pos = end < 0 ? s.length : end + 1;
        if (end < 0) return;
        this.state = S.Data;
        this.sink.end(this.buf);
        return;
      }
      default:
        this.tagChar(s.charAt(src.pos));
    }
  }

  private data(s: string): void {
    const { src } = this;
    const lt = s.indexOf('<', src.pos);
    if (lt < 0) {
      this.text += s.slice(src.pos);
      src.pos = s.length;
      return;
    }
    this.text += s.slice(src.pos, lt);
    src.pos = lt;
    const next = s.charAt(lt + 1);
    const rest = s.slice(lt + 1);
    if (next === '' || (next === '/' && lt + 2 === s.length)) {
      if (!src.last) src.fail(2, msg.dynamicTag());
      this.literal(s.length - lt);
      return;
    }
    if (rest.startsWith('!--')) {
      this.open(S.Comment, '<!--', 4);
      return;
    }
    if (/^!doctype/i.test(rest)) {
      this.open(S.Doctype, '', 0);
      return;
    }
    if (next === '!' || next === '?') {
      this.open(S.Bogus, '', 0);
      return;
    }
    if (next === '/') {
      const name = TAG_NAME.exec(s.slice(lt + 2));
      if (name === null) return src.fail(7, msg.badEndTag());
      this.flushText();
      src.pos = lt + 2 + name[0].length;
      if (src.pos === s.length && !src.last) src.fail(2, msg.dynamicTag());
      this.buf = name[0].toLowerCase();
      this.state = S.EndTag;
      return;
    }
    const name = TAG_NAME.exec(rest);
    if (name === null) {
      this.literal(1);
      return;
    }
    this.flushText();
    src.pos = lt + 1 + name[0].length;
    if (src.pos === s.length && !src.last) src.fail(2, msg.dynamicTag());
    this.tag = { name: name[0].toLowerCase(), raw: name[0], attrs: [], selfClosing: false };
    this.state = S.BeforeName;
  }

  private literal(length: number): void {
    const { src } = this;
    const s = src.strings[src.i] ?? '';
    this.text += s.slice(src.pos, src.pos + length);
    src.pos += length;
  }

  private open(state: State, buf: string, skip: number): void {
    this.flushText();
    this.state = state;
    this.buf = buf;
    this.src.pos += skip;
  }

  private comment(s: string): void {
    const { src } = this;
    // `<!-->` and `<!--->` are complete (empty) comments.
    if (this.buf === '<!--') {
      const abrupt = s.startsWith('>', src.pos) ? 1 : s.startsWith('->', src.pos) ? 2 : 0;
      if (abrupt > 0) {
        this.endComment(s, src.pos + abrupt);
        return;
      }
    }
    const a = s.indexOf('-->', src.pos);
    const b = s.indexOf('--!>', src.pos);
    if (a < 0 && b < 0) {
      this.buf += s.slice(src.pos);
      src.pos = s.length;
      return;
    }
    const end = b < 0 || (a >= 0 && a < b) ? a + 3 : b + 4;
    this.endComment(s, end);
  }

  private endComment(s: string, end: number): void {
    this.buf += s.slice(this.src.pos, end);
    this.src.pos = end;
    this.sink.comment(this.buf);
    this.state = S.Data;
  }

  private rawText(s: string): void {
    const { src } = this;
    const lower = s.toLowerCase();
    let from = src.pos;
    for (;;) {
      const at = lower.indexOf(`</${this.rawEnd}`, from);
      const after = at < 0 ? '' : s.charAt(at + 2 + this.rawEnd.length);
      if (at < 0 || after === '') {
        this.text += s.slice(src.pos);
        src.pos = s.length;
        return;
      }
      if (isWs(after) || after === '/' || after === '>') {
        this.text += s.slice(src.pos, at);
        src.pos = at;
        this.flushText();
        this.state = S.Data;
        return;
      }
      from = at + 1;
    }
  }

  /** The hole after string `src.i`: its kind depends on the state. */
  private hole(): void {
    const { src } = this;
    switch (this.state) {
      case S.Data:
      case S.RcData:
        this.flushText();
        this.sink.hole(this.state === S.Data ? 'child' : 'text');
        break;
      case S.RawText:
        src.fail(3, msg.inRawText(this.rawEnd));
        break;
      case S.Comment:
      case S.Bogus:
        src.fail(3, msg.inComment());
        break;
      case S.Doctype:
        src.fail(3, msg.inDoctype());
        break;
      case S.EndTag:
        src.fail(2, msg.dynamicTag());
        break;
      default:
        this.holeInTag();
    }
  }

  private finish(): void {
    const { src } = this;
    src.i = src.strings.length - 1;
    src.pos = (src.strings[src.i] ?? '').length;
    if (this.state === S.Comment || this.state === S.Bogus || this.state === S.Doctype) {
      src.fail(7, msg.unterminated('comment'));
    }
    if (this.state > S.Doctype) src.fail(7, msg.unterminated('tag'));
    this.flushText();
    this.sink.finish();
  }
}
