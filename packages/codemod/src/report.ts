// The report printed after a run: what changed, then every candidate left as is.
import type { Finding } from './transform.js';

export interface ReportInput {
  readonly release: string;
  readonly dry: boolean;
  readonly files: number;
  readonly changed: readonly string[];
  readonly unformatted: readonly string[];
  readonly findings: readonly Finding[];
}

const where = (f: Finding): string => (f.line > 0 ? `${f.file}:${String(f.line)}` : f.file);

export function formatReport(input: ReportInput): string {
  const { release, dry, files, changed, unformatted, findings } = input;
  const verb = dry ? 'would change' : 'changed';
  const plain = new Set(unformatted);
  const lines = [
    `@gyral/codemod ${release}${dry ? ' (dry run: nothing written)' : ''}: ${verb} ${String(changed.length)} of ${String(files)} files`,
    ...changed.map((file) => `  ${file}${plain.has(file) ? ' (not formatted)' : ''}`),
  ];
  if (plain.size > 0) {
    lines.push(
      'Run your formatter on the files marked "not formatted": the app has no Prettier, or they ' +
        "didn't pass it before the rewrite.",
    );
  } else if (changed.length > 0) lines.push("Formatted with the app's Prettier.");
  if (findings.length === 0) lines.push('Nothing left to review.');
  else {
    lines.push(`Left as is, to review by hand (${String(findings.length)}):`);
    for (const f of findings) lines.push(`  ${where(f)} [${f.transform}] ${f.reason}`);
  }
  return lines.join('\n');
}
