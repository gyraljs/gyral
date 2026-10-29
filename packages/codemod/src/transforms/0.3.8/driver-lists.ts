// Name-keyed driver records → lists: provideDrivers(root, { feed: feed.provide(run) }) and
// el.drivers = { … } become [feed.provide(run)] when every entry's driver name is known in
// this module and equals its key. A list supplies each driver under its own name, which is
// what the key already said, so lookups don't change. Test files keep their records.
import type { Node, ObjectExpression } from '@babel/types';
import type MagicString from 'magic-string';
import { endOf, keyName, lineOf, startOf, walk } from '../../ast.js';
import { calleeName, resolvesTo, type ModuleFacts } from '../../facts.js';
import type { Transform } from '../types.js';
import { CORE, driverOf, isNamed, moduleDrivers, type ModuleDriver } from './drivers.js';

/** Test setup modules (Vitest's or Jest's `setupFiles`): `vitest.setup.ts`, `test-setup-browser.ts`, `setupTests.js`. */
const SETUP = /^(?:(?:vitest|jest|tests?)[.-]setup|setup[.-]?tests?)\b/i;

/** `*.test.*`, `*.spec.*`, test setup modules, and files under `test/`, `tests/` or `__tests__/`. */
export function isTestFile(path: string): boolean {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return (
    /\.(test|spec)\./.test(base) || SETUP.test(base) || /(^|\/)(test|tests|__tests__)\//.test(path)
  );
}

const isDriversKey = (node: Node, computed: boolean): boolean =>
  computed
    ? node.type === 'StringLiteral' && node.value === 'drivers'
    : node.type === 'Identifier' && node.name === 'drivers';

/** The first line that reads `x.drivers` (not as the target of `=`), or undefined. */
function driversRead(program: Node): number | undefined {
  let line: number | undefined;
  walk(program, ({ node, key, ancestors }) => {
    if (line !== undefined) return;
    const parent = ancestors.at(-1);
    const member =
      (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') &&
      isDriversKey(node.property, node.computed);
    const assigned =
      parent?.type === 'AssignmentExpression' && parent.operator === '=' && key === 'left';
    const destructured =
      node.type === 'ObjectProperty' &&
      parent?.type === 'ObjectPattern' &&
      isDriversKey(node.key, node.computed);
    if ((member && !assigned) || destructured) line = lineOf(node);
  });
  return line;
}

interface Candidate {
  readonly record: ObjectExpression;
  /** The record's ancestors, outermost first. */
  readonly ancestors: readonly Node[];
  /** `x.drivers = { … }` rather than an argument of provideDrivers. */
  readonly assignment: boolean;
}

/** Why `record` can't become a list, or undefined if it can. */
function problem(
  { record, ancestors }: Candidate,
  facts: ModuleFacts,
  drivers: ReadonlyMap<string, ModuleDriver>,
): string | undefined {
  const keys = new Set<string>();
  for (const prop of record.properties) {
    if (prop.type === 'SpreadElement')
      return "it spreads another record, whose drivers aren't known here";
    const key = keyName(prop);
    if (key === undefined) return 'it has a computed key';
    if (prop.type === 'ObjectMethod') return `entry '${key}' is a method`;
    if (keys.has(key)) return `key '${key}' appears twice`;
    keys.add(key);
    const found = driverOf(prop.value, facts, drivers, [...ancestors, record, prop]);
    if (!isNamed(found)) return `entry '${key}': ${found.reason}`;
    if (found.name !== key) {
      return `key '${key}' isn't its driver's name '${found.name}' (commands never use this entry, G0045)`;
    }
  }
  return undefined;
}

/** `{ a: x, b }` → `[x, b]`: the braces become brackets and each `key: ` goes. */
function toList(record: ObjectExpression, code: string, edit: MagicString): void {
  const start = startOf(record);
  const end = endOf(record);
  if (record.properties.length === 0) {
    edit.overwrite(start, end, '[]');
    return;
  }
  const inline = !code.slice(start, end).includes('\n');
  const open = inline && code[start + 1] === ' ' ? 2 : 1;
  const close = inline && code[end - 2] === ' ' ? 2 : 1;
  edit.overwrite(start, start + open, '[');
  edit.overwrite(end - close, end, ']');
  for (const prop of record.properties) {
    if (prop.type !== 'ObjectProperty' || prop.shorthand) continue;
    let valueStart = code.indexOf(':', endOf(prop.key)) + 1;
    while (/\s/.test(code.charAt(valueStart))) valueStart += 1;
    edit.remove(startOf(prop), valueStart);
  }
}

export const driverLists: Transform = {
  id: 'driver-list',
  summary:
    'provideDrivers(x, { … }) and el.drivers = { … } → lists, when each key is its driver name',
  run({ path, code, ast, facts, edit, report }) {
    const records: Candidate[] = [];
    walk(ast.program, ({ node, ancestors }) => {
      let value: Node | undefined;
      let assignment = false;
      if (node.type === 'CallExpression' && calleeName(node.callee) === 'provideDrivers') {
        value = node.arguments[1];
        if (
          value?.type === 'ObjectExpression' &&
          !resolvesTo(facts, node.callee, ancestors, CORE, 'provideDrivers')
        ) {
          report(
            node,
            "driver record left as is: `provideDrivers` here isn't provably @gyral/core's",
          );
          return;
        }
      } else if (
        node.type === 'AssignmentExpression' &&
        node.operator === '=' &&
        node.left.type === 'MemberExpression' &&
        isDriversKey(node.left.property, node.left.computed)
      ) {
        value = node.right;
        assignment = true;
      }
      if (value?.type === 'TSAsExpression' || value?.type === 'TSSatisfiesExpression') {
        if (value.expression.type === 'ObjectExpression') {
          report(value, 'driver record left as is: it has a type assertion; change it by hand');
        }
      } else if (value?.type === 'ObjectExpression') {
        records.push({ record: value, ancestors: [...ancestors, node], assignment });
      }
    });
    const first = records[0];
    if (first === undefined) return;
    if (isTestFile(path)) {
      const count =
        records.length === 1 ? 'a driver record' : `${String(records.length)} driver records`;
      report(first.record, `${count} left as is: test file (records stay idiomatic for fakes)`);
      return;
    }
    const drivers = moduleDrivers(ast.program, facts);
    const read = records.some((r) => r.assignment) ? driversRead(ast.program) : undefined;
    for (const candidate of records) {
      const { record, assignment } = candidate;
      const why =
        assignment && read !== undefined
          ? `this file reads \`.drivers\` (line ${String(read)}), which would see a list`
          : problem(candidate, facts, drivers);
      if (why === undefined) toList(record, code, edit);
      else report(record, `driver record left as is: ${why}`);
    }
  },
};
