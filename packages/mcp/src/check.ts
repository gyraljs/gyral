// check_snippet: typecheck TypeScript against the project's own installed TypeScript and @gyral/*
// types, in memory. TypeScript is an optional peer: the agent's project almost always has it,
// and bundling it would add ~25 MB to every `npx @gyral/mcp`.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type * as TS from 'typescript';
import { formatSuggestions, lintGyral, type Suggestion } from './diagnose.js';
import { explainTs } from './explain-ts.js';

export interface CheckResult {
  /** False when the check couldn't run (no package.json or TypeScript). */
  readonly ran: boolean;
  readonly ok: boolean;
  /** Human-readable: diagnostics with suggested fixes, or why the check couldn't run. */
  readonly report: string;
  /** Concrete fixes for the type errors and Gyral mistakes found. */
  readonly suggestions: readonly Suggestion[];
}

const LOOP =
  'Apply the fixes, then call check_snippet again with the whole module until it reports no problems.';

/** The "Suggested fixes" part of a report, or '' when there are none. */
function fixes(suggestions: readonly Suggestion[]): string {
  return suggestions.length === 0
    ? ''
    : `\n\nSuggested fixes:\n${formatSuggestions(suggestions)}\n\n${LOOP}`;
}

/** Explained TypeScript errors first, then source-level findings not already explained. */
function merge(typed: readonly Suggestion[], linted: readonly Suggestion[]): Suggestion[] {
  const seen = new Set(typed.map((s) => `${s.rule}:${String(s.line)}`));
  return [...typed, ...linted.filter((s) => !seen.has(`${s.rule}:${String(s.line)}`))];
}

function loadTypeScript(projectDir: string): typeof TS | undefined {
  try {
    const require = createRequire(join(projectDir, 'package.json'));
    return require('typescript') as typeof TS;
  } catch {
    return undefined;
  }
}

const DEFAULTS = {
  target: 'ES2022',
  module: 'ESNext',
  moduleResolution: 'bundler',
  lib: ['ES2023', 'DOM', 'DOM.Iterable'],
  strict: true,
  skipLibCheck: true,
  types: [],
};

/** Gyral's recommended options, overridden by the project's tsconfig.json when it has one. */
function options(ts: typeof TS, projectDir: string): TS.CompilerOptions {
  const defaults = ts.convertCompilerOptionsFromJson(DEFAULTS, projectDir).options;
  const configPath = ts.findConfigFile(projectDir, (f) => ts.sys.fileExists(f));
  const project =
    configPath === undefined
      ? {}
      : ts.parseJsonConfigFileContent(
          ts.readConfigFile(configPath, (f) => ts.sys.readFile(f)).config,
          ts.sys,
          projectDir,
        ).options;
  return { ...defaults, ...project, noEmit: true, skipLibCheck: true, incremental: false };
}

/** Typechecks `code` as if it were `src/__snippet__.ts` in `projectDir`. */
export function checkSnippet(code: string, projectDir: string): CheckResult {
  const linted = lintGyral(code);
  if (!existsSync(join(projectDir, 'package.json'))) {
    return {
      ran: false,
      ok: false,
      report: `No package.json in ${projectDir}. Run the server from your project directory (or set GYRAL_PROJECT_DIR).${fixes(linted)}`,
      suggestions: linted,
    };
  }
  const ts = loadTypeScript(projectDir);
  if (ts === undefined) {
    return {
      ran: false,
      ok: false,
      report: `TypeScript isn't installed in ${projectDir}; install it (npm i -D typescript) to check snippets.${fixes(linted)}`,
      suggestions: linted,
    };
  }
  const file = join(projectDir, 'src', '__gyral_snippet__.ts');
  const compilerOptions = options(ts, projectDir);
  const host = ts.createCompilerHost(compilerOptions);
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  host.getSourceFile = (name, ...rest) => (name === file ? source : getSourceFile(name, ...rest));
  host.fileExists = (name) => name === file || fileExists(name);
  host.readFile = (name) => (name === file ? code : readFile(name));

  const program = ts.createProgram({ rootNames: [file], options: compilerOptions, host });
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file === undefined || d.file.fileName === file);
  const errors = linted.filter((s) => s.severity !== 'hint');
  if (diagnostics.length === 0 && errors.length === 0) {
    const hints = linted.length === 0 ? '' : `\n\nHints:\n${formatSuggestions(linted)}`;
    return {
      ran: true,
      ok: true,
      report: `No type errors (TypeScript ${ts.version}) and no common Gyral mistakes found.${hints}`,
      suggestions: linted,
    };
  }
  const read = diagnostics.map((d) => {
    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    const line =
      d.file === undefined || d.start === undefined
        ? undefined
        : d.file.getLineAndCharacterOfPosition(d.start);
    return { d, message, line };
  });
  const lines = read
    .slice(0, 20)
    .map(({ d, message, line }) =>
      line === undefined
        ? `TS${String(d.code)}: ${message}`
        : `${String(line.line + 1)}:${String(line.character + 1)} TS${String(d.code)}: ${message}`,
    );
  const typed = read.flatMap(({ d, message, line }): Suggestion[] => {
    const explained = explainTs({ code: d.code, message });
    if (explained === undefined) return [];
    return [line === undefined ? explained : { ...explained, line: line.line + 1 }];
  });
  // One suggestion per rule and line: a single mistake can raise several errors.
  const unique = typed.filter(
    (s, n) => typed.findIndex((t) => t.rule === s.rule && t.line === s.line) === n,
  );
  const suggestions = merge(unique, linted);
  const more = diagnostics.length > 20 ? `\n…and ${String(diagnostics.length - 20)} more.` : '';
  const head =
    diagnostics.length === 0
      ? `No type errors (TypeScript ${ts.version}), but Gyral mistakes were found.`
      : `${String(diagnostics.length)} type error(s) (TypeScript ${ts.version}):\n${lines.join('\n')}${more}`;
  return {
    ran: true,
    ok: false,
    report: `${head}${fixes(suggestions)}`,
    suggestions,
  };
}
