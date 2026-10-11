// The template rules (view/09-template-rules.md) as a check that reports where it stopped, for
// tools that point at the markup (the ESLint plugin, @gyral/core/eslint). It runs the same
// steps as `analyze` (normalize.ts) up to the last one that can fail: minify whitespace, then
// tokenize and build the tree (emit and the id never throw). Like the compiler and the runtime,
// it stops at a template's first error: the tokenizer can't recover from one.
import { TemplateError } from './errors.js';
import { Source } from './source.js';
import { tokenize, type ContentMode, type Sink, type StartTag } from './tokenizer.js';
import { TreeBuilder } from './tree.js';
import { minifyStrings } from './whitespace.js';

/** A position in the minified strings: string index, offset in that string. */
export type At = readonly [index: number, offset: number];

/** A template's first rule violation, and where the normalizer was when it found it. */
export interface TemplateIssue {
  /** The same error `normalize(strings)` throws. */
  readonly error: TemplateError;
  /** The whitespace-minified strings the rules read (as many as the input). */
  readonly strings: readonly string[];
  /** Where reading stopped. */
  readonly at: At;
  /**
   * Where the token the error is about starts, when the tree builder found it in a tag, an end
   * tag or a run of text (the token ends at `at`). Undefined when the tokenizer found it at
   * `at` itself, or at a child hole (then `at` is the end of the string before the hole).
   */
  readonly from: At | undefined;
}

/** Forwards tokens to the tree builder, remembering where the current token started. */
class Tracker implements Sink {
  mark: At = [0, 0];
  from: At | undefined;

  constructor(
    private readonly src: Source,
    private readonly tree: TreeBuilder,
  ) {}

  /** A token starts at `mark`; an error before `after` is about it (a child hole: the hole). */
  private before(about = true): void {
    this.from = about ? this.mark : undefined;
  }

  private after(): void {
    this.from = undefined;
    this.mark = [this.src.i, this.src.pos];
  }

  text(raw: string): void {
    this.before();
    this.tree.text(raw);
    this.after();
  }
  comment(raw: string): void {
    this.before();
    this.tree.comment(raw);
    this.after();
  }
  doctype(raw: string): void {
    this.before();
    this.tree.doctype(raw);
    this.after();
  }
  start(tag: StartTag): ContentMode {
    this.before();
    const mode = this.tree.start(tag);
    this.after();
    return mode;
  }
  end(name: string): void {
    this.before();
    this.tree.end(name);
    this.after();
  }
  hole(kind: 'child' | 'text'): void {
    this.before(false);
    this.tree.hole(kind);
    this.after();
  }
  finish(): void {
    this.before();
    this.tree.finish();
    this.after();
  }
}

/**
 * The template's first rule violation, or undefined when `normalize` would accept it. `svg`: an
 * svg template's strings (`` svg`…` ``).
 */
export function checkTemplate(strings: readonly string[], svg = false): TemplateIssue | undefined {
  const normalized = minifyStrings(strings);
  const src = new Source(normalized, undefined);
  const tracker = new Tracker(src, new TreeBuilder(src, svg));
  try {
    tokenize(src, tracker);
  } catch (error) {
    if (!(error instanceof TemplateError)) throw error;
    return { error, strings: normalized, at: [src.i, src.pos], from: tracker.from };
  }
  return undefined;
}
