// The strings being normalized and the tokenizer's position in them, so every rule violation
// (view/09-template-rules.md) can quote the markup it is about.
import { TemplateError } from './errors.js';

const HOLE = '${…}';

export class Source {
  /** Index of the string being read, and the offset in it. */
  i = 0;
  pos = 0;

  constructor(
    readonly strings: readonly string[],
    readonly loc: string | undefined,
  ) {}

  get last(): boolean {
    return this.i === this.strings.length - 1;
  }

  /** The markup around the current position, with holes shown as `${…}`. */
  near(): string {
    const s = this.strings[this.i] ?? '';
    let before = s.slice(Math.max(0, this.pos - 40), this.pos);
    if (this.pos < 40 && this.i > 0) {
      before = (this.strings[this.i - 1] ?? '').slice(this.pos - 40) + HOLE + before;
    }
    let after = s.slice(this.pos, this.pos + 20);
    if (this.pos + 20 > s.length && !this.last) {
      after += HOLE + (this.strings[this.i + 1] ?? '').slice(0, 20 - after.length);
    }
    return `${before}${after}`.replace(/\s+/g, ' ').trim();
  }

  /** Throws rule `rule`'s error, quoting the markup at the current position. */
  fail(rule: number, message: string): never {
    throw new TemplateError(rule, message, this.loc, this.near());
  }
}
