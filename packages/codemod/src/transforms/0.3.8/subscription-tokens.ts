// subscription('feed', listen) → subscription(feed, listen), when this module declares the
// token `const feed = defineDriver<…>('feed')`: the subscription is then typed by the token.
import { endOf, startOf, stringValue, walk } from '../../ast.js';
import { calleeName, resolvesTo } from '../../facts.js';
import { shadowed } from '../../scope.js';
import type { Transform } from '../types.js';
import { CORE, moduleDrivers, type ModuleDriver } from './drivers.js';

export const subscriptionTokens: Transform = {
  id: 'subscription-token',
  summary: "subscription('name', fn) → subscription(token, fn) when this module declares the token",
  run({ ast, facts, edit, report }) {
    const tokens = new Map<string, ModuleDriver[]>();
    for (const driver of moduleDrivers(ast.program, facts).values()) {
      if (driver.token) tokens.set(driver.name, [...(tokens.get(driver.name) ?? []), driver]);
    }
    if (tokens.size === 0) return;
    walk(ast.program, ({ node, ancestors }) => {
      if (node.type !== 'CallExpression') return;
      const first = node.arguments[0];
      const name = stringValue(first);
      const candidates = name === undefined ? undefined : tokens.get(name);
      if (first === undefined || name === undefined || candidates === undefined) return;
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
