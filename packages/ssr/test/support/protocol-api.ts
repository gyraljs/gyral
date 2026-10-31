// The declarations protocol 1 relies on (ADR 0034 "What changes the protocol"), as one text
// and its SHA-256, for embedded-protocol.node.test.ts: `SSR_PROTOCOL`, `renderToString` and
// every `RenderOptions` field an embedded entry may pass, and `styleHashes`, which the build
// calls for the manifest's `style_hashes`. Read with the TypeScript checker, so comments and
// formatting don't count, and a re-export resolves to the declaration it names.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ENTRY = fileURLToPath(new URL('../../src/index.ts', import.meta.url));
const NAMES = ['SSR_PROTOCOL', 'renderToString', 'RenderOptions', 'styleHashes'] as const;
const FORMAT: ts.TypeFormatFlags =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType |
  ts.TypeFormatFlags.WriteArrowStyleSignature;

export interface ProtocolApi {
  /** One line per declaration (and per `RenderOptions` field), sorted. */
  readonly text: string;
  readonly sha256: string;
}

function describe(checker: ts.TypeChecker, name: string, symbol: ts.Symbol): string[] {
  const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const [declaration] = target.declarations ?? [];
  if (declaration === undefined) throw new Error(`${name} has no declaration`);
  if (target.flags & ts.SymbolFlags.Interface) {
    return checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(target)).map((field) => {
      const [node] = field.declarations ?? [];
      const readonly =
        node !== undefined && ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Readonly
          ? 'readonly '
          : '';
      const optional = field.flags & ts.SymbolFlags.Optional ? '?' : '';
      const type = checker.typeToString(checker.getTypeOfSymbol(field), undefined, FORMAT);
      return `${name}: ${readonly}${field.name}${optional}: ${type}`;
    });
  }
  const type = checker.getTypeOfSymbolAtLocation(target, declaration);
  return [`${name}: ${checker.typeToString(type, undefined, FORMAT)}`];
}

/** Reads the protocol's declarations from `@gyral/ssr`'s sources. */
export function protocolApi(): ProtocolApi {
  const program = ts.createProgram([ENTRY], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: [],
    strict: true,
    exactOptionalPropertyTypes: true,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(ENTRY);
  const module = source && checker.getSymbolAtLocation(source);
  if (module === undefined) throw new Error('@gyral/ssr: entry point not found');
  const exports = new Map(checker.getExportsOfModule(module).map((s) => [s.name, s]));
  const lines = NAMES.flatMap((name) => {
    const symbol = exports.get(name);
    if (symbol === undefined) throw new Error(`@gyral/ssr no longer exports ${name}`);
    return describe(checker, name, symbol);
  }).sort();
  const text = lines.join('\n');
  return { text, sha256: createHash('sha256').update(text).digest('hex') };
}
