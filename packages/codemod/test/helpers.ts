import { expect } from 'vitest';
import { transformSource } from '../src/index.js';

/**
 * A fixture module: the template without its first newline and common indentation, so a
 * fixture reads like the file it stands for.
 */
export function source(strings: TemplateStringsArray, ...values: readonly string[]): string {
  const text = strings.reduce((out, part, i) => out + part + (values[i] ?? ''), '');
  const lines = text
    .replace(/^\n/, '')
    .replace(/\n\s*$/, '')
    .split('\n');
  const indents = lines.filter((l) => l.trim() !== '').map((l) => /^ */.exec(l)?.[0].length ?? 0);
  const indent = Math.min(...indents);
  return `${lines.map((l) => l.slice(indent)).join('\n')}\n`;
}

export interface Migrated {
  readonly code: string;
  /** `line [transform] reason` for each candidate left as is. */
  readonly findings: readonly string[];
}

/** Runs the 0.3.8 transforms once, and checks that a second run changes nothing. */
export function migrate(code: string, file = 'src/app.ts'): Migrated {
  const first = transformSource('0.3.8', code, file);
  const second = transformSource('0.3.8', first.after, file);
  expect(second.after, 'a second run changes nothing').toBe(first.after);
  const findings = first.findings.map((f) => `${String(f.line)} [${f.transform}] ${f.reason}`);
  return { code: first.after, findings };
}

/** A module the transforms must leave exactly as it is. */
export function expectUnchanged(code: string, file = 'src/app.ts'): readonly string[] {
  const { code: after, findings } = migrate(code, file);
  expect(after).toBe(code);
  return findings;
}
