// The start-tag states of the template tokenizer (WHATWG HTML: before/after attribute name,
// attribute name, before attribute value, attribute value in double/single/no quotes, after
// attribute value, self-closing start tag), and what a hole means in each: an attribute,
// multi-attribute, boolean, property or hook (view/02-bindings.md), or rule 1, 2 or 5
// (view/09-template-rules.md). tokenizer.ts adds the data, comment and raw text states.
import { msg } from './rules.js';
import type { Source } from './source.js';
import { isWs, S, type Sink, type StartTag, type State } from './tokens.js';

export abstract class TagStates {
  protected state: State = S.Data;
  protected buf = '';
  protected rawEnd = '';
  protected tag: StartTag = { name: '', raw: '', attrs: [], selfClosing: false };
  private attrName = '';
  private pieces: string[] = [];

  constructor(
    protected readonly src: Source,
    protected readonly sink: Sink,
  ) {}

  protected tagChar(c: string): void {
    this.src.pos += 1;
    switch (this.state) {
      case S.BeforeName:
        if (isWs(c)) return;
        if (c === '/') this.state = S.SelfClosing;
        else if (c === '>') this.emitTag();
        else this.startName(c);
        return;
      case S.Name:
        if (isWs(c)) this.state = S.AfterName;
        else if (c === '=') this.state = S.BeforeValue;
        else if (c === '/' || c === '>') this.endValueless(c);
        else this.attrName += c;
        return;
      case S.AfterName:
        if (isWs(c)) return;
        if (c === '=') this.state = S.BeforeValue;
        else if (c === '/' || c === '>') this.endValueless(c);
        else {
          this.pushStatic(null);
          this.startName(c);
        }
        return;
      case S.BeforeValue:
        if (isWs(c)) return;
        this.buf = '';
        this.pieces = [];
        if (c === '"') this.state = S.ValueDq;
        else if (c === "'") this.state = S.ValueSq;
        else if (c === '>') {
          this.pushStatic('""');
          this.emitTag();
        } else {
          this.buf = c;
          this.state = S.ValueUnq;
        }
        return;
      case S.ValueDq:
      case S.ValueSq:
        if (c === (this.state === S.ValueDq ? '"' : "'")) this.endQuoted(c);
        else this.buf += c;
        return;
      case S.ValueUnq:
        if (isWs(c) || c === '>') {
          this.pushStatic(this.buf);
          this.state = S.BeforeName;
          if (c === '>') this.emitTag();
        } else this.buf += c;
        return;
      default:
        // AfterValueQ and SelfClosing: `>` ends the tag, anything else starts a new attribute.
        if (c === '>') {
          this.tag.selfClosing = this.state === S.SelfClosing;
          this.emitTag();
        } else if (c === '/') this.state = S.SelfClosing;
        else if (!isWs(c)) this.startName(c);
        else this.state = S.BeforeName;
    }
  }

  private startName(c: string): void {
    this.attrName = c;
    this.state = S.Name;
  }

  private endValueless(c: string): void {
    this.pushStatic(null);
    if (c === '>') this.emitTag();
    else this.state = S.SelfClosing;
  }

  private pushStatic(value: string | null): void {
    this.tag.attrs.push({ kind: 'static', name: this.attrName, value });
  }

  private endQuoted(quote: string): void {
    this.state = S.AfterValueQ;
    if (this.pieces.length === 0) {
      this.pushStatic(quote + this.buf + quote);
      return;
    }
    this.pieces.push(this.buf);
    const single = this.pieces.length === 2 && this.pieces[0] === '' && this.pieces[1] === '';
    this.pushBound(single ? undefined : this.pieces);
  }

  /** A bound attribute named `attrName`; `strings` for a multi-attribute. */
  private pushBound(strings: readonly string[] | undefined): void {
    const name = this.attrName;
    const prefix = name.charAt(0);
    if (prefix === '@') this.src.fail(1, msg.eventBinding(name));
    if (prefix === '?' || prefix === '.') {
      if (strings !== undefined) this.src.fail(5, msg.notSingle(name));
      const kind = prefix === '?' ? 'bool' : 'prop';
      this.tag.attrs.push({ kind, name: name.slice(1) });
      return;
    }
    this.tag.attrs.push(
      strings === undefined ? { kind: 'attr', name } : { kind: 'attr', name, strings },
    );
  }

  private emitTag(): void {
    const mode = this.sink.start(this.tag);
    this.rawEnd = this.tag.name;
    this.state = mode === 'data' ? S.Data : mode === 'rawtext' ? S.RawText : S.RcData;
  }

  /** A hole in a start tag (after string `src.i`). */
  protected holeInTag(): void {
    const { src } = this;
    const next = src.strings[src.i + 1] ?? '';
    const c = next.charAt(0);
    const event = this.attrName.startsWith('@');
    switch (this.state) {
      case S.Name:
        if (event) src.fail(1, msg.eventBinding(this.attrName));
        src.fail(2, msg.dynamicName());
        break;
      case S.BeforeValue: {
        // The template ending here is rule 7 (unterminated tag), reported by the tokenizer.
        const atEnd = c === '' && src.i + 1 === src.strings.length - 1;
        const ends = isWs(c) || c === '>' || next.startsWith('/>') || atEnd;
        if (!event && !ends) src.fail(5, msg.unquoted(this.attrName));
        this.pushBound(undefined);
        this.state = S.BeforeName;
        break;
      }
      case S.ValueUnq:
        if (event) src.fail(1, msg.eventBinding(this.attrName));
        src.fail(5, msg.unquoted(this.attrName));
        break;
      case S.ValueDq:
      case S.ValueSq:
        if (event) src.fail(1, msg.eventBinding(this.attrName));
        this.pieces.push(this.buf);
        this.buf = '';
        break;
      default:
        // Before an attribute name: an element hook.
        if (this.state === S.AfterName) this.pushStatic(null);
        if (c !== '' && !isWs(c) && c !== '>' && c !== '/') src.fail(2, msg.dynamicName());
        this.tag.attrs.push({ kind: 'hook', name: '' });
        this.state = S.BeforeName;
    }
  }
}
