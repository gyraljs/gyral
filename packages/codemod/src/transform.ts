// One file through one release's transforms.
import MagicString from 'magic-string';
import { lineOf, parseModule } from './ast.js';
import { moduleFacts } from './facts.js';
import { RELEASES } from './transforms/index.js';

/** A candidate the codemod left as is: where, which transform, and why. */
export interface Finding {
  /** Relative to where the codemod ran, with `/` separators. */
  readonly file: string;
  readonly line: number;
  /** The transform's id, or `parse` for a file that didn't parse. */
  readonly transform: string;
  readonly reason: string;
}

export interface FileResult {
  readonly file: string;
  readonly before: string;
  readonly after: string;
  readonly findings: readonly Finding[];
}

/**
 * Runs `release`'s transforms over one module's source. `file` names it in findings and picks
 * the parser plugins (TypeScript for .ts/.mts/.tsx, JSX for .tsx/.jsx). Throws for an unknown
 * release.
 */
export function transformSource(release: string, code: string, file: string): FileResult {
  const transforms = RELEASES[release];
  if (transforms === undefined) throw new Error(`no transforms for release ${release}`);
  const parsed = parseModule(code, file);
  if (!parsed.ok) {
    const reason = `left as is: it doesn't parse (${parsed.error})`;
    return {
      file,
      before: code,
      after: code,
      findings: [{ file, line: 0, transform: 'parse', reason }],
    };
  }
  const { ast } = parsed;
  const facts = moduleFacts(ast);
  const edit = new MagicString(code);
  const findings: Finding[] = [];
  for (const transform of transforms) {
    transform.run({
      path: file,
      code,
      ast,
      facts,
      edit,
      report: (node, reason) => {
        findings.push({ file, line: lineOf(node), transform: transform.id, reason });
      },
    });
  }
  findings.sort((a, b) => a.line - b.line);
  return { file, before: code, after: edit.toString(), findings };
}
