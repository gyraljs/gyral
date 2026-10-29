// The report printed after a run: what changed, then every candidate left as is.
import type { Finding } from './transform.js';

export interface ReportInput {
  readonly release: string;
  readonly dry: boolean;
  readonly files: number;
  readonly changed: readonly string[];
  readonly findings: readonly Finding[];
}

const where = (f: Finding): string => (f.line > 0 ? `${f.file}:${String(f.line)}` : f.file);

export function formatReport({ release, dry, files, changed, findings }: ReportInput): string {
  const verb = dry ? 'would change' : 'changed';
  const lines = [
    `@gyral/codemod ${release}${dry ? ' (dry run: nothing written)' : ''}: ${verb} ${String(changed.length)} of ${String(files)} files`,
    ...changed.map((file) => `  ${file}`),
  ];
  if (findings.length === 0) lines.push('Nothing left to review.');
  else {
    lines.push(`Left as is, to review by hand (${String(findings.length)}):`);
    for (const f of findings) lines.push(`  ${where(f)} [${f.transform}] ${f.reason}`);
  }
  return lines.join('\n');
}
