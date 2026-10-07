// Module text helpers for the template compiler: offsets to line/column, code frames for build
// errors, and string splicing with a source map (no magic-string: @gyral/core has no runtime
// dependencies, and Vite doesn't expose one to plugins).

export interface Position {
  /** 1-based. */
  readonly line: number;
  /** 0-based. */
  readonly column: number;
}

export class Lines {
  private readonly starts: number[] = [0];

  constructor(readonly code: string) {
    for (let k = code.indexOf('\n'); k !== -1; k = code.indexOf('\n', k + 1)) {
      this.starts.push(k + 1);
    }
  }

  position(offset: number): Position {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.starts[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - (this.starts[lo] ?? 0) };
  }

  /** Two lines of context around `offset`, with a caret under it (Vite prints it). */
  frame(offset: number, end = offset + 1): string {
    const { line, column } = this.position(offset);
    const lines = this.code.split('\n');
    const first = Math.max(1, line - 2);
    const last = Math.min(lines.length, line + 2);
    const width = String(last).length;
    const out: string[] = [];
    for (let n = first; n <= last; n++) {
      const text = lines[n - 1] ?? '';
      out.push(`${n === line ? '>' : ' '} ${String(n).padStart(width)} | ${text}`);
      if (n === line) {
        const span = Math.max(1, Math.min(end - offset, text.length - column));
        out.push(`  ${' '.repeat(width)} | ${' '.repeat(column)}${'^'.repeat(span)}`);
      }
    }
    return out.join('\n');
  }
}

export interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface SourceMap {
  readonly version: 3;
  readonly sources: string[];
  readonly names: string[];
  readonly mappings: string;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(value: number): string {
  let v = value < 0 ? (-value << 1) | 1 : value << 1;
  let out = '';
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v > 0) digit |= 32;
    out += B64[digit] ?? '';
  } while (v > 0);
  return out;
}

/**
 * Applies non-overlapping `edits` to `lines.code` and maps the result back to it: a segment at
 * the start of every output line and at every edit boundary (line-level precision, like
 * magic-string without `hires`).
 */
export function splice(
  lines: Lines,
  edits: readonly Edit[],
  file: string,
): { code: string; map: SourceMap } {
  const { code } = lines;
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let out = '';
  const mapLines: string[][] = [[]];
  let genCol = 0;
  let prev = { line: 0, column: 0 };
  let prevGenCol = 0;

  const mark = (offset: number): void => {
    const { line, column } = lines.position(offset);
    const at = { line: line - 1, column };
    const row = mapLines.at(-1);
    if (row === undefined) return;
    if (row.length === 0) prevGenCol = 0;
    row.push(
      vlq(genCol - prevGenCol) + 'A' + vlq(at.line - prev.line) + vlq(at.column - prev.column),
    );
    prevGenCol = genCol;
    prev = at;
  };

  const write = (text: string, origin: number, original: boolean): void => {
    let from = 0;
    mark(origin);
    for (let nl = text.indexOf('\n'); nl !== -1; nl = text.indexOf('\n', from)) {
      out += text.slice(from, nl + 1);
      from = nl + 1;
      mapLines.push([]);
      genCol = 0;
      mark(original ? origin + from : origin);
    }
    out += text.slice(from);
    genCol += text.length - from;
  };

  let pos = 0;
  for (const edit of sorted) {
    if (edit.start > pos) write(code.slice(pos, edit.start), pos, true);
    if (edit.text !== '') write(edit.text, edit.start, false);
    pos = Math.max(pos, edit.end);
  }
  if (pos < code.length) write(code.slice(pos), pos, true);
  return {
    code: out,
    map: {
      version: 3,
      sources: [file],
      names: [],
      mappings: mapLines.map((r) => r.join(',')).join(';'),
    },
  };
}
