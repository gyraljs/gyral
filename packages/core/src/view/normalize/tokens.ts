// Token types shared by the tokenizer (tokenizer.ts, tag-states.ts) and the tree builder
// (tree.ts), plus the tokenizer's states (WHATWG HTML "Tokenization", the subset templates use).

export type ContentMode = 'data' | 'rawtext' | 'rcdata';

/**
 * A static attribute as written: `value` is the raw source, quotes included, or null. `css`:
 * a `style` attribute's decoded value, set by the tree builder (01 "Normalization", step 3).
 */
export interface StaticAttr {
  readonly kind: 'static';
  readonly name: string;
  readonly value: string | null;
  readonly css?: string;
}

/** A bound attribute. `strings` (raw static pieces) only for multi-attributes. */
export interface BoundAttr {
  readonly kind: 'attr' | 'bool' | 'prop' | 'hook';
  readonly name: string;
  readonly strings?: readonly string[];
}

export type AttrToken = StaticAttr | BoundAttr;

export interface StartTag {
  /** Lower-case name, and the name as written. */
  readonly name: string;
  readonly raw: string;
  readonly attrs: AttrToken[];
  selfClosing: boolean;
}

export interface Sink {
  text(raw: string): void;
  comment(raw: string): void;
  doctype(raw: string): void;
  start(tag: StartTag): ContentMode;
  end(name: string): void;
  hole(kind: 'child' | 'text'): void;
  finish(): void;
}

export const S = {
  Data: 0,
  RawText: 1,
  RcData: 2,
  Comment: 3,
  Bogus: 4,
  Doctype: 5,
  BeforeName: 6,
  Name: 7,
  AfterName: 8,
  BeforeValue: 9,
  ValueDq: 10,
  ValueSq: 11,
  ValueUnq: 12,
  AfterValueQ: 13,
  SelfClosing: 14,
  EndTag: 15,
} as const;
export type State = (typeof S)[keyof typeof S];

const WS = /^[\t\n\f\r ]$/;
export const TAG_NAME = /^[A-Za-z][^\t\n\f\r />]*/;
export const isWs = (c: string | undefined): boolean => c !== undefined && WS.test(c);
