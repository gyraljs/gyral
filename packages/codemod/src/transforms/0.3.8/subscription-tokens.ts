// subscription('feed', listen) → subscription(feed, listen), when this module declares the
// token `const feed = defineDriver<…>('feed')`: the subscription is then typed by the token.
// A string name with its own implementation is a documented form, left without a word, unless
// this module imports a binding of that name, or a token of that name is in scope where the
// rewrite can't pass it (inside a function, or `let`): then its token is likely meant (gyral-0dj).
import type { Node, Program } from '@babel/types';
import { endOf, lineOf, startOf, stringValue, walk } from '../../ast.js';
import { calleeName, resolvesTo, type ModuleFacts } from '../../facts.js';
import { shadowed } from '../../scope.js';
import type { Transform } from '../types.js';
import { CORE, driverOf, isNamed, moduleDrivers, type ModuleDriver } from './drivers.js';

/** A token the rewrite doesn't pass: declared in a function or block, or with `let`/`var`. */
interface OutOfReach {
  readonly name: string;
  readonly local: string;
  readonly line: number;
  /** The block (or program) it is declared in: calls inside it can see it. */
  readonly scope: Node;
}

function outOfReach(program: Program, facts: ModuleFacts, module: ReadonlySet<Node>): OutOfReach[] {
  const found: OutOfReach[] = [];
  walk(program, ({ node, ancestors }) => {
    if (node.type !== 'VariableDeclarator' || module.has(node)) return;
    if (node.id.type !== 'Identifier' || !node.init) return;
    const driver = driverOf(node.init, facts, new Map(), [...ancestors, node]);
    const scope = ancestors.findLast((a) => a.type === 'BlockStatement' || a.type === 'Program');
    if (!isNamed(driver) || !driver.token || scope === undefined) return;
    found.push({ name: driver.name, local: node.id.name, line: lineOf(node), scope });
  });
  return found;
}

/** Why `subscription('name', …)` keeps its string although a token of that name may be meant. */
function unpassed(name: string, source: string | undefined, token: OutOfReach | undefined) {
  if (source !== undefined) {
    return (
      `\`${name}\` is imported from ${source}, so whether it's the token for '${name}' isn't ` +
      `known in this module; if it is, pass it: subscription(${name}, …)`
    );
  }
  if (token === undefined) return undefined;
  return (
    `token \`${token.local}\` (line ${String(token.line)}) is declared inside a function or with ` +
    `\`let\`, where the codemod doesn't pass it; pass it by hand: subscription(${token.local}, …)`
  );
}

export const subscriptionTokens: Transform = {
  id: 'subscription-token',
  summary: "subscription('name', fn) → subscription(token, fn) when this module declares the token",
  run({ ast, facts, edit, report }) {
    const tokens = new Map<string, ModuleDriver[]>();
    const drivers = [...moduleDrivers(ast.program, facts).values()];
    for (const driver of drivers) {
      if (driver.token) tokens.set(driver.name, [...(tokens.get(driver.name) ?? []), driver]);
    }
    const unreached = outOfReach(ast.program, facts, new Set(drivers.map((d) => d.declarator)));
    walk(ast.program, ({ node, ancestors }) => {
      if (node.type !== 'CallExpression') return;
      const first = node.arguments[0];
      const name = stringValue(first);
      if (first === undefined || name === undefined) return;
      const candidates = tokens.get(name);
      if (candidates === undefined) {
        if (!resolvesTo(facts, node.callee, ancestors, CORE, 'subscription')) return;
        const token = unreached.find((t) => t.name === name && ancestors.includes(t.scope));
        const why = unpassed(name, facts.imports.get(name)?.source, token);
        if (why !== undefined) report(node, why);
        return;
      }
      if (!resolvesTo(facts, node.callee, ancestors, CORE, 'subscription')) {
        if (calleeName(node.callee) === 'subscription') {
          report(
            node,
            `\`subscription\` here isn't provably @gyral/core's; pass the token by hand`,
          );
        }
        return;
      }
      const [token] = candidates;
      if (token === undefined) return;
      const local = `\`${token.local}\``;
      if (candidates.length > 1) {
        report(
          node,
          `${String(candidates.length)} tokens are named '${name}'; pass the right one by hand`,
        );
      } else if (node.typeArguments) {
        report(
          node,
          `explicit type arguments: subscription<O, I, E, V>('${name}', …) and ` +
            `subscription<I, O, E, V>(${token.local}, …) order them differently; drop them and pass ${local} by hand`,
        );
      } else if (token.policy) {
        report(
          node,
          `token ${local} sets more than its name (concurrency, toError), which ` +
            `subscription(${token.local}, …) would adopt; pass it by hand if that's intended`,
        );
      } else if (startOf(node) < token.end) {
        report(node, `token ${local} is declared after this call`);
      } else if (shadowed(token.local, [...ancestors, node])) {
        report(node, `another ${local} is declared around this call; pass the token by hand`);
      } else {
        edit.overwrite(startOf(first), endOf(first), token.local);
      }
    });
  },
};
