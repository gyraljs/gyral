// get_api("*"): the public API as a task index. Runtime functions are grouped by what they are
// for, each with a one-line purpose and the example or scaffold to start from; types, which
// TypeScript infers, are collapsed at the end.
import { inPackage } from './api.js';
import { RUNTIME, TASKS, type Task } from './guidance.js';
import type { ApiEntry } from './types.js';

function bySpecifier(entries: readonly ApiEntry[]): string {
  const groups = new Map<string, string[]>();
  for (const e of entries) groups.set(e.specifier, [...(groups.get(e.specifier) ?? []), e.name]);
  return [...groups].map(([specifier, names]) => `- ${specifier}: ${names.join(', ')}`).join('\n');
}

/** The index, optionally for one package; '' when the package has no exports. */
export function indexApi(api: readonly ApiEntry[], pkg?: string): string {
  const scoped = api.filter((e) => inPackage(e, pkg));
  if (scoped.length === 0) return '';
  const runtime = scoped.filter((e) => e.kind !== 'type');
  const types = scoped.filter((e) => e.kind === 'type');

  const grouped = new Map<Task, ApiEntry[]>();
  const rest: ApiEntry[] = [];
  const seen = new Set<string>();
  for (const e of runtime) {
    const known = RUNTIME[e.name];
    if (known === undefined) rest.push(e);
    else if (!seen.has(e.name)) {
      seen.add(e.name);
      grouped.set(known[0], [...(grouped.get(known[0]) ?? []), e]);
    }
  }
  const order = Object.keys(RUNTIME);
  const sections = (Object.keys(TASKS) as Task[])
    .filter((task) => grouped.has(task))
    .map((task) => {
      const info = TASKS[task];
      const lines = (grouped.get(task) ?? [])
        .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
        .map((e) => `- \`${e.name}\` (${e.specifier}): ${RUNTIME[e.name]?.[1] ?? ''}`);
      return `### ${info.title}\nStart from: \`${info.next}\`\n${lines.join('\n')}`;
    });

  const typeList =
    pkg === undefined
      ? `${types
          .filter((e) => e.specifier === '@gyral/core')
          .map((e) => e.name)
          .join(', ')}; other packages: get_api("*", "<package>")`
      : types.map((e) => e.name).join(', ');

  return [
    `# Gyral API by task${pkg === undefined ? '' : ` (${pkg})`}`,
    'Start from code, not from this list: scaffold_component or get_example gives a working module, and checking it names the few types you need. Look up a function here when you are about to call it.',
    ...sections,
    ...(rest.length === 0 ? [] : [`### Other functions and constants\n${bySpecifier(rest)}`]),
    ...(types.length === 0
      ? []
      : [
          `### Types (${String(types.length)}): look these up only when a compile error names one\nTypeScript infers them from define(), form() and the commands you return.\n${typeList}`,
        ]),
  ].join('\n\n');
}
