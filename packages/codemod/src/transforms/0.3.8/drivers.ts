// Which driver an expression is, when its name is known from this module alone: a literal name
// (`subscription('feed', …)`, `fakeDriver('feed', …)`, `defineDriver({ name: 'feed', … })`) or
// a token or driver declared in this module (`feed.provide(run)`, `subscription(feed, …)`).
import type { Node, Program } from '@babel/types';
import { keyName, stringValue } from '../../ast.js';
import { calleeName, resolvesTo, type ModuleFacts } from '../../facts.js';
import { shadowed } from '../../scope.js';

export const CORE = '@gyral/core';
export const TESTING = '@gyral/testing';

export interface Named {
  readonly name: string;
  /** A token: `defineDriver('name')`, or `defineDriver({ name, … })` without `run`. */
  readonly token: boolean;
  /** The token's spec sets more than its name (concurrency, toError). */
  readonly policy: boolean;
}

export type DriverName = Named | { readonly reason: string };

/** A driver (or token) declared by a module-level `const`. */
export interface ModuleDriver extends Named {
  readonly local: string;
  readonly declarator: Node;
  /** Where its declaration ends: code before this point would read it uninitialized. */
  readonly end: number;
}

export const isNamed = (found: DriverName): found is Named => 'name' in found;

function specName(spec: Node | undefined): DriverName {
  const literal = stringValue(spec);
  if (literal !== undefined) return { name: literal, token: true, policy: false };
  if (spec?.type !== 'ObjectExpression') return { reason: "its spec isn't an object literal" };
  let name: string | undefined;
  let run = false;
  let policy = false;
  for (const prop of spec.properties) {
    if (prop.type === 'SpreadElement') return { reason: 'its spec spreads another object' };
    const key = keyName(prop);
    if (key === undefined) return { reason: 'its spec has a computed key' };
    if (key === 'name' && prop.type === 'ObjectProperty') name = stringValue(prop.value);
    else if (key === 'run') run = true;
    else policy = true;
  }
  return name === undefined
    ? { reason: "its spec's name isn't a string literal" }
    : { name, token: !run, policy: !run && policy };
}

/** Where a driver's name is known from: a module-level `const`, not re-declared around `ancestors`. */
interface Lookup {
  readonly facts: ModuleFacts;
  readonly known: ReadonlyMap<string, ModuleDriver>;
  readonly ancestors: readonly Node[];
}

/** The module driver `name` refers to, or why it isn't one. */
function moduleDriver(name: string, { facts, known, ancestors }: Lookup): ModuleDriver | string {
  const driver = known.get(name);
  if (driver === undefined) {
    const imported = facts.imports.get(name);
    return imported !== undefined
      ? `\`${name}\` is imported from ${imported.source}, so its driver name isn't known in this module`
      : `the name of the driver \`${name}\` isn't known here`;
  }
  return shadowed(name, ancestors) ? `\`${name}\` here isn't the module's \`${name}\`` : driver;
}

/** A driver built from a module driver (`subscription(feed, …)`, `feed.provide(run)`). */
const builtFrom = (found: ModuleDriver | string): DriverName =>
  typeof found === 'string' ? { reason: found } : { name: found.name, token: false, policy: false };

/**
 * The driver `node` is, or why its name can't be known from this module. `ancestors` are the
 * node's, outermost first: a module driver is recognized only where no scope re-declares it.
 */
export function driverOf(
  node: Node,
  facts: ModuleFacts,
  known: ReadonlyMap<string, ModuleDriver>,
  ancestors: readonly Node[] = [],
): DriverName {
  const lookup: Lookup = { facts, known, ancestors };
  if (node.type === 'Identifier') {
    const found = moduleDriver(node.name, lookup);
    return typeof found === 'string' ? { reason: found } : found;
  }
  if (node.type !== 'CallExpression') return { reason: "the driver's name isn't known here" };
  const { callee } = node;
  const first = node.arguments[0];
  if (resolvesTo(facts, callee, ancestors, CORE, 'defineDriver')) return specName(first);
  if (
    resolvesTo(facts, callee, ancestors, CORE, 'subscription') ||
    resolvesTo(facts, callee, ancestors, TESTING, 'fakeDriver')
  ) {
    const literal = stringValue(first);
    if (literal !== undefined) return { name: literal, token: false, policy: false };
    if (first?.type !== 'Identifier') return { reason: "its name isn't a string literal" };
    return builtFrom(moduleDriver(first.name, lookup));
  }
  if (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    calleeName(callee) === 'provide'
  ) {
    const token = moduleDriver(callee.object.name, lookup);
    if (typeof token !== 'string' && !token.token) {
      return { reason: `\`${token.local}\` isn't a driver token` };
    }
    return builtFrom(token);
  }
  const called = calleeName(callee);
  return {
    reason: `the name of the driver ${called === undefined ? '' : `\`${called}(…)\` `}isn't known here`,
  };
}

/**
 * Whether `node` is plainly a driver, whatever its name: a call of core's `subscription` or
 * `defineDriver` or of `fakeDriver`, `token.provide(…)` on a token declared or imported here,
 * or a module driver. Finds driver records the codemod doesn't rewrite (gyral-0dj).
 */
export function isDriver(
  node: Node,
  facts: ModuleFacts,
  known: ReadonlyMap<string, ModuleDriver>,
  ancestors: readonly Node[],
): boolean {
  if (node.type === 'Identifier') return known.has(node.name);
  if (node.type !== 'CallExpression') return false;
  const { callee } = node;
  if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier') {
    const { name } = callee.object;
    return calleeName(callee) === 'provide' && (known.has(name) || facts.imports.has(name));
  }
  return (
    resolvesTo(facts, callee, ancestors, CORE, 'subscription') ||
    resolvesTo(facts, callee, ancestors, CORE, 'defineDriver') ||
    resolvesTo(facts, callee, ancestors, TESTING, 'fakeDriver')
  );
}

/**
 * Drivers and tokens declared by module-level `const`s (exported or not), in source order, so
 * `feed.provide(run)` resolves when `feed` comes first. Uses elsewhere check that no inner
 * scope re-declares the name (`driverOf`'s `ancestors`).
 */
export function moduleDrivers(program: Program, facts: ModuleFacts): Map<string, ModuleDriver> {
  const drivers = new Map<string, ModuleDriver>();
  for (const statement of program.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
    for (const declarator of declaration.declarations) {
      const { id, init } = declarator;
      if (id.type !== 'Identifier' || !init) continue;
      const found = driverOf(init, facts, drivers);
      if (!isNamed(found)) continue;
      const end = declaration.end ?? Number.MAX_SAFE_INTEGER;
      drivers.set(id.name, { ...found, local: id.name, declarator, end });
    }
  }
  return drivers;
}
