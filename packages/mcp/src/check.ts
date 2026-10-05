// check_snippet: typecheck TypeScript against the project's own installed TypeScript and @gyral/*
// types, in memory. TypeScript is an optional peer: the agent's project almost always has it,
// and bundling it would add ~25 MB to every `npx @gyral/mcp`.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type * as TS from 'typescript';

export interface CheckResult {
  /** False when the check couldn't run (no package.json or TypeScript). */
  readonly ran: boolean;
  readonly ok: boolean;
  /** Human-readable: diagnostics, or why the check couldn't run. */
  readonly report: string;
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
  useDefineForClassFields: false,
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
  if (!existsSync(join(projectDir, 'package.json'))) {
    return {
      ran: false,
      ok: false,
      report: `No package.json in ${projectDir}. Run the server from your project directory (or set GYRAL_PROJECT_DIR).`,
    };
  }
  const ts = loadTypeScript(projectDir);
  if (ts === undefined) {
    return {
      ran: false,
      ok: false,
      report: `TypeScript isn't installed in ${projectDir}; install it (npm i -D typescript) to check snippets.`,
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
  if (diagnostics.length === 0) {
    return { ran: true, ok: true, report: `No type errors (TypeScript ${ts.version}).` };
  }
  const lines = diagnostics.slice(0, 20).map((d) => {
    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    if (d.file === undefined || d.start === undefined) return `TS${String(d.code)}: ${message}`;
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    return `${String(line + 1)}:${String(character + 1)} TS${String(d.code)}: ${message}`;
  });
  const more = diagnostics.length > 20 ? `\n…and ${String(diagnostics.length - 20)} more.` : '';
  return {
    ran: true,
    ok: false,
    report: `${String(diagnostics.length)} type error(s) (TypeScript ${ts.version}):\n${lines.join('\n')}${more}`,
  };
}
