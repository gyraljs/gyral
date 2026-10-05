// Public API lookup: one symbol's declaration and doc comment, by name, with suggestions.
import type { ApiEntry } from './types.js';

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

/** Exact matches first (a name can be exported from more than one entry point), else close names. */
export function findApi(api: readonly ApiEntry[], symbol: string, pkg?: string): ApiResult {
  const wanted = symbol.trim();
  const scoped = api.filter((e) => inPackage(e, pkg));
  const exact = scoped.filter((e) => e.name === wanted);
  if (exact.length > 0) return { matches: exact, suggestions: [] };
  const folded = scoped.filter((e) => e.name.toLowerCase() === wanted.toLowerCase());
  if (folded.length > 0) return { matches: folded, suggestions: [] };
  const lower = wanted.toLowerCase();
  const suggestions = [
    ...new Set(
      scoped
        .map((e) => ({
          name: e.name,
          d: e.name.toLowerCase().includes(lower) ? 0 : distance(lower, e.name.toLowerCase()),
        }))
        .filter((s) => s.d <= Math.max(2, Math.floor(lower.length / 3)))
        .sort((a, b) => a.d - b.d || a.name.localeCompare(b.name))
        .map((s) => s.name),
    ),
  ].slice(0, 8);
  return { matches: [], suggestions };
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
