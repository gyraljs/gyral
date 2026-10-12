// Public API lookup: one symbol's declaration and doc comment, by name, with suggestions.
import type { ApiEntry, InternalType } from './types.js';

/** Edit distance, for "did you mean" suggestions. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j] ?? 0;
      row[j] = Math.min(
        above + 1,
        (row[j - 1] ?? 0) + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = above;
    }
  }
  return row[b.length] ?? 0;
}

const inPackage = (entry: ApiEntry, pkg: string | undefined): boolean =>
  pkg === undefined ||
  entry.specifier === pkg ||
  entry.specifier === `@gyral/${pkg}` ||
  entry.specifier.startsWith(`${pkg.startsWith('@') ? pkg : `@gyral/${pkg}`}/`);

export interface ApiResult {
  readonly matches: readonly ApiEntry[];
  readonly suggestions: readonly string[];
}

/** `define()`, `Update<S, M>`, `typeof form`, `` `each` `` → the bare name. */
export function bareName(symbol: string): string {
  return symbol
    .trim()
    .replace(/^`|`$/g, '')
    .replace(/^typeof\s+/, '')
    .replace(/^@gyral\/[\w/-]+[#:.]/, '')
    .replace(/\(\)$/, '')
    .replace(/<.*>$/s, '')
    .trim();
}

/** How close `name` is to `wanted` (lower is closer), or undefined when it isn't close. */
function closeness(wanted: string, name: string): number | undefined {
  const a = wanted.toLowerCase();
  const b = name.toLowerCase();
  if (b.startsWith(a) || a.startsWith(b)) return 0;
  if (b.includes(a) || a.includes(b)) return 1;
  const d = distance(a, b);
  return d <= Math.max(2, Math.floor(a.length / 3)) ? d + 1 : undefined;
}

/**
 * Exact matches first (a name can be exported from more than one entry point), else close
 * names: prefixes, substrings, then small edit distances; failing all of those, the three
 * nearest names, so a miss always points somewhere.
 */
export function findApi(api: readonly ApiEntry[], symbol: string, pkg?: string): ApiResult {
  const wanted = bareName(symbol);
  const scoped = api.filter((e) => inPackage(e, pkg));
  const exact = scoped.filter((e) => e.name === wanted);
  if (exact.length > 0) return { matches: exact, suggestions: [] };
  const folded = scoped.filter((e) => e.name.toLowerCase() === wanted.toLowerCase());
  if (folded.length > 0) return { matches: folded, suggestions: [] };
  const names = [...new Set(scoped.map((e) => e.name))];
  const ranked = names
    .map((name) => ({ name, d: closeness(wanted, name) }))
    .filter((s): s is { name: string; d: number } => s.d !== undefined)
    .sort((a, b) => a.d - b.d || a.name.length - b.name.length || a.name.localeCompare(b.name));
  const nearest =
    ranked.length > 0
      ? ranked
      : names
          .map((name) => ({ name, d: distance(wanted.toLowerCase(), name.toLowerCase()) }))
          .sort((a, b) => a.d - b.d || a.name.localeCompare(b.name))
          .slice(0, 3);
  return { matches: [], suggestions: nearest.map((s) => s.name).slice(0, 8) };
}

/** Specific advice for internal types agents look up, beyond the generic advice. */
const INTERNAL_HINTS: Readonly<Record<string, string>> = {
  SpecBody:
    "Use `ComponentSpec<State, Msg, Props, IntentName>` (or one field: `ComponentSpec<…>['view']`).",
  InitField: "Use `ComponentSpec<State, Msg>['init']`.",
  IntentField: "Use `ComponentSpec<State, Msg>['intent']`, or `Intents<Msg>` for the table.",
  UpdateField:
    "Use `Update<State, Msg>` (each entry is a `Reducer`), or `ComponentSpec<State, Msg>['update']`.",
  TagOnly:
    '`true` in `intent` sends `{ _tag: K }` for a message with no other fields; any other message needs a parser (`IntentParser<Variant<Msg, K>>`).',
  TrueOnlyForFieldlessMessage:
    'This is the error type behind "true only sends a message with no fields": write a parser for that intent instead of `true`.',
  In: 'Use `StandardSchemaV1.InferInput<typeof schema>` (`StandardSchemaV1` is exported by @gyral/core).',
  Out: 'Use `StandardSchemaV1.InferOutput<typeof schema>` (`StandardSchemaV1` is exported by @gyral/core).',
  Refined:
    'Use `ReturnType<typeof prop.string>` (any `prop.*` builder), or `Prop<T>` for a builder of `T`.',
  Scalar:
    "Use `Prop<T>` (the `prop.*` builders return it) or `PropsOf<typeof C>` for a component's props.",
  WithSchema:
    'The `prop.json`/`prop.value` overloads that take a Standard Schema first; they return `Prop<T>`.',
  Parsed:
    "Use `Awaited<ReturnType<typeof parse>>` (from @gyral/testing), or the component's `Msg` union.",
  SpecOf: 'Pass the component class (`parse(Counter, …)`) or its `.spec`.',
  Named: "Any driver, or `{ name: 'driver-name' }`.",
  ChildPart: 'View-layer internals: hold a `TemplateResult` (or `ListResult` from `each`) instead.',
  HookPart: 'View-layer internals: element hooks return `HookResult` (`defineHook`).',
  TemplateObject: 'View-layer internals: use `TemplateResult`.',
  Constructor: 'Use `GyralElementClass` (what `define()` returns), or `typeof MyComponent`.',
  DevtoolsPanel: 'Use `MountedDevtools` (what `mountDevtools()` returns).',
  Param: "Use `Params<'/posts/:id'>` from @gyral/router (the params of one path).",
};

/** The generic way to name a type through the export that uses it. */
function throughUser(user: string, name: string): string {
  const match = /^(\w+) \((\w+), ([^)]+)\)$/.exec(user);
  if (match === null) return `through \`${user}\``;
  const [, symbol = '', kind = '', specifier = ''] = match;
  if (kind === 'function')
    return `through \`${symbol}\` (${specifier}): \`Parameters<typeof ${symbol}>[n]\` for a parameter, \`ReturnType<typeof ${symbol}>\` for its result`;
  return `through \`${symbol}\` (${specifier}): \`${symbol}<…>['field']\` for the part that is a \`${name}\``;
}

/** An answer for a name that is a known unexported type, or undefined. */
export function explainInternal(
  internal: readonly InternalType[] | undefined,
  symbol: string,
): string | undefined {
  const wanted = bareName(symbol);
  const entry = internal?.find((t) => t.name === wanted);
  if (entry === undefined) return undefined;
  const users = entry.usedBy.slice(0, 4);
  const lines = [
    `\`${entry.name}\` is not exported by any @gyral/* entry point.`,
    entry.from === undefined
      ? `It is an internal helper type used by ${users.map((u) => `\`${u}\``).join(', ')}.`
      : `It comes from \`${entry.from}\`: \`import type { ${entry.name} } from '${entry.from}';\` (used by ${users.map((u) => `\`${u}\``).join(', ')}).`,
  ];
  const hint = INTERNAL_HINTS[entry.name];
  if (hint !== undefined) lines.push(hint);
  else if (entry.from === undefined && users[0] !== undefined)
    lines.push(`Name it ${throughUser(users[0], entry.name)}.`);
  return lines.join('\n');
}

export function formatApi(entry: ApiEntry): string {
  return [
    `### \`${entry.name}\` (${entry.kind}) from \`${entry.specifier}\``,
    '',
    '```ts',
    entry.declaration,
    '```',
    ...(entry.doc === '' ? [] : ['', entry.doc]),
    '',
    `Import: \`import { ${entry.kind === 'type' ? 'type ' : ''}${entry.name} } from '${entry.specifier}';\``,
  ].join('\n');
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
}

/** The exports of one entry point, grouped by kind: an index for agents. */
export function listApi(api: readonly ApiEntry[], pkg?: string): string {
  const scoped = api.filter((e) => inPackage(e, pkg));
  const bySpecifier = groupBy(scoped, (e) => e.specifier);
  return [...bySpecifier]
    .map(([specifier, entries]) => {
      const kinds = groupBy(entries, (e) => e.kind);
      const lines = [...kinds].map(
        ([kind, list]) => `- ${kind}: ${list.map((e) => e.name).join(', ')}`,
      );
      return `## ${specifier}\n${lines.join('\n')}`;
    })
    .join('\n\n');
}
