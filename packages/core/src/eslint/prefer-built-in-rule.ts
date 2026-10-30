// gyral/prefer-built-in (gyral-337.4): hand-written versions of what Gyral has built in, each
// reported as a warning that names the built-in. Consumer apps showed every one: agents opened
// dialogs with showModal(), focused from drivers and parsed JSON attributes by hand; joystyk
// dedupes subscription output in 10 places and wires 374 tokens through records; parsers re-derive
// what on() hands them (112 `instanceof KeyboardEvent`, 61 modifier filters, 26
// `composedPath()[0]`, driftwake's 12 `Number(value)`). Precision before recall: each check fires
// only on the shape the built-in replaces as is.
// - showModal: `.showModal()` in a module that imports Gyral (a template source) → `?modal`.
// - focus: `.focus()` in a driver's implementation, the `run` of `defineDriver({ run })` or a
//   function passed to `token.provide()`, on an element reached through a component's shadow or
//   render root → the `focus(selector)` command, which searches that root. A page element
//   (`document.querySelector`, `getElementById`), one the driver is handed, and a window (a
//   popup's) are left alone: the command can't reach them (gyral-um2).
// - jsonProp: `JSON.parse` of the element's own attribute (`this.getAttribute(…)`,
//   `this.dataset.x`, an `attributeChangedCallback` value) or of a prop (`props.x`,
//   `ctx.props.x`) → `prop.json(schema)`. Other elements' attributes (the intent's target, a
//   hook's element, a `<meta>`) carry view data, not props, so they are left alone.
// - subscriptionEquals: in `subscription()`'s subscribe callback, an `if` that compares a value
//   with a remembered one (a variable or member the callback reassigns) and guards `emit` →
//   `{ equals }`. Comparisons with constants filter rather than dedupe; skipped with `equals`.
// - driverList: `provideDrivers(root, { … })` or `el.drivers = { … }` outside test files → a list.
// - onEvent, onModifiers, onNumber, onOrigin: plain intent parsers (prefer-built-in-intent.ts).
import { relative } from 'node:path';
import type { Rule } from 'eslint';
import { isGyral, isSource, OPTIONS_SCHEMA, typeOnly, type Node, type NodeOf } from './imports.js';
import {
  bindingsIn,
  candidate,
  collectParsers,
  parserReports,
  type Binding,
  type Candidate,
  type Parser,
} from './prefer-built-in-intent.js';
import {
  comparesRemembered,
  enclosing,
  guardsEmit,
  isAttributeOrProp,
  inComponentRoot,
  isGlobal,
  isWindow,
  localFunction,
  memberName,
  property,
  unwrap,
  walk,
  within,
  type Fn,
  type Subscription,
} from './prefer-built-in-shapes.js';

const ON = '(ADR 0001 "typed intent input")';

const MESSAGES = {
  showModal:
    "showModal() opens this dialog behind the model's back, so state and screen drift apart: " +
    'bind ?modal=${s.open} on the <dialog> (with data-intent-on="close", so Escape updates the ' +
    'model too), and Gyral calls showModal() and close() as the state changes ' +
    '(view/02-bindings.md "Dialogs and popovers").',
  focus:
    ".focus() in a driver reaches into a component's DOM through its shadow root, which drivers " +
    'have no access to, and can run before the target renders: return focus(selector) from ' +
    "@gyral/core in the reducer's commands instead; it focuses the first match in the " +
    "component's own root once the update has rendered. Focusing a page element outside any " +
    'component stays the driver\'s job (ADR 0006 "Focus as a command").',
  jsonProp:
    'JSON.parse of an attribute or prop is a hand-written prop.json(): declare the prop as ' +
    'prop.json(schema) (any Standard Schema, or a type guard) and read it from ctx.props; Gyral ' +
    'parses and validates the attribute when it changes, treats an invalid value as missing, ' +
    'and takes the value as a property too (ADR 0007, skill components.md "Props").',
  subscriptionEquals:
    "This subscription drops repeated values by hand: pass { equals } in subscription()'s " +
    'options (equals: Object.is for a store that hands out the same object when nothing ' +
    'changed, or select a slice and compare that), and Gyral delivers only values unequal to ' +
    'the last one delivered (ADR 0018 "subscription delivery").',
  driverList:
    "A record of drivers repeats each driver's name as its key, and a key that isn't the " +
    "driver's name is never used (G0045): supply a list, each driver under its own name " +
    '(provideDrivers(root, [token.provide(run), makeRouter()])); records stay fine for fakes ' +
    'in tests (ADR 0006 "typed provision").',
  onEvent:
    "This parser tells the event apart by hand (instanceof or event.type): write it as on('" +
    "{{event}}', (input) => …), whose input.event is typed by that event, and bind it with " +
    `data-intent-{{event}} ${ON}.`,
  onModifiers:
    "This parser reads modifier keys off the event by hand: write it as on('{{event}}', …) " +
    "with a modifiers filter ('none', 'any' or { ctrl: true }), which lets other key presses " +
    `keep their default action, or read input.modifiers there ${ON}.`,
  onNumber:
    "This parser turns the input's value into a number by hand (an empty input gives 0 or " +
    "NaN): write it as on('{{event}}', …) and read input.valueAsNumber, a number, or " +
    `undefined when the input is empty or invalid ${ON}.`,
  onOrigin:
    'composedPath()[0] digs the element the event started on out of the event: write the ' +
    "parser as on('{{event}}', …) and read input.origin, the same element inside shadow " +
    `roots too ${ON}.`,
};

/**
 * Test files, where a record of fakes is fine: `*.test.*`, `*.spec.*`, under test/ or tests/,
 * and test setup modules (`vitest.setup.ts`, `test-setup-browser.ts`, `setupTests.js`).
 */
const TEST_FILE =
  /\.(test|spec)\.[cm]?[jt]sx?$|(^|[\\/])(test|tests|__tests__)[\\/]|(^|[\\/])((vitest|jest|tests?)[.-]setup|setup[.-]?tests?)\b[^\\/]*$/i;
const JSON_GLOBAL = new Set(['JSON']);

export const preferBuiltInRule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Hand-written versions of what Gyral has built in: ?modal, the focus() command, ' +
        'prop.json(), subscription equals, driver lists and on() parsers.',
      recommended: true,
      url: 'https://github.com/gyraljs/gyral/blob/main/skills/gyral/references/anti-patterns.md',
    },
    schema: OPTIONS_SCHEMA,
    messages: MESSAGES,
  },
  create(context) {
    const path = relative(context.cwd, context.filename);
    const testFile = TEST_FILE.test(path.startsWith('..') ? context.filename : path);
    let gyralModule = false;
    const drivers = new Map<Node, true>(); // driver implementations
    const focusCalls: Node[] = [];
    const subscriptions: Subscription[] = [];
    const ifs: NodeOf<'IfStatement'>[] = [];
    const parsers = new Map<Node, Parser>();
    const candidates: Candidate[] = [];
    const bindings: Binding[] = [];
    const addDriver = (fn: Fn | undefined): void => {
      if (fn !== undefined) drivers.set(fn, true);
    };
    const report = (
      node: Node,
      messageId: keyof typeof MESSAGES,
      data?: Record<string, string>,
    ): void => {
      context.report({ node, messageId, ...(data === undefined ? {} : { data }) });
    };
    return {
      Program(program) {
        gyralModule = program.body.some(
          (s) =>
            s.type === 'ImportDeclaration' &&
            !typeOnly(s) &&
            isSource(context, String(s.source.value)),
        );
      },
      CallExpression(node) {
        const c = candidate(context, node);
        if (c !== undefined) candidates.push(c);
        const callee = node.callee as Node;
        const args = node.arguments as Node[];
        if (callee.type === 'CallExpression' && isGyral(context, callee.callee as Node, 'define')) {
          if (args[1] !== undefined) collectParsers(context, args[1], parsers);
        } else if (isGyral(context, callee, 'defineDriver')) {
          addDriver(localFunction(context, property(args[0], 'run')));
        } else if (isGyral(context, callee, 'subscription')) {
          const fn = localFunction(context, args[1]);
          const emit = fn?.params[0] as Node | undefined;
          if (fn === undefined || emit?.type !== 'Identifier' || property(args[2], 'equals'))
            return;
          const variable = context.sourceCode
            .getDeclaredVariables(fn)
            .find((v) => v.name === emit.name);
          const emits = (variable?.references ?? [])
            .map((r) => r.identifier as Node)
            .flatMap((id) =>
              id.parent?.type === 'CallExpression' && id.parent.callee === id ? [id.parent] : [],
            );
          subscriptions.push({ fn, emits });
        } else if (isGyral(context, callee, 'provideDrivers')) {
          if (!testFile && args[1]?.type === 'ObjectExpression') report(args[1], 'driverList');
        } else if (callee.type === 'MemberExpression') {
          const name = memberName(callee);
          const object = callee.object as Node;
          if (name === 'provide' && gyralModule && args.length === 1)
            addDriver(localFunction(context, args[0]));
          else if (name === 'showModal' && gyralModule) report(node, 'showModal');
          else if (
            name === 'focus' &&
            !isWindow(context, object) &&
            inComponentRoot(context, object)
          )
            focusCalls.push(node);
          else if (
            name === 'parse' &&
            gyralModule &&
            isGlobal(context, unwrap(object), JSON_GLOBAL)
          ) {
            if (args[0] !== undefined && isAttributeOrProp(context, args[0]))
              report(node, 'jsonProp');
          }
        }
      },
      AssignmentExpression(node) {
        const left = node.left as Node;
        if (
          testFile ||
          !gyralModule ||
          node.operator !== '=' ||
          node.right.type !== 'ObjectExpression'
        )
          return;
        if (memberName(left) === 'drivers') report(node.right as Node, 'driverList');
      },
      'BinaryExpression, UnaryExpression, MemberExpression, Property'(node: Node) {
        const c = candidate(context, node);
        if (c !== undefined) candidates.push(c);
      },
      IfStatement(node) {
        ifs.push(node);
      },
      TaggedTemplateExpression(node) {
        const tag = node.tag as Node;
        if (isGyral(context, tag, 'html') || isGyral(context, tag, 'svg'))
          bindings.push(...bindingsIn(node));
      },
      'Program:exit'() {
        for (const call of focusCalls) if (enclosing(call, drivers)) report(call, 'focus');
        for (const { fn, emits } of subscriptions) {
          const assigned = new Set<string>();
          walk(context, fn, (n) => {
            if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression') {
              assigned.add(context.sourceCode.getText(n.left));
            }
            return true;
          });
          const dedupe = ifs.find(
            (s) =>
              within(fn, s) &&
              guardsEmit(s, emits) &&
              comparesRemembered(context, s.test as Node, assigned),
          );
          if (dedupe !== undefined) report(dedupe.test as Node, 'subscriptionEquals');
        }
        for (const r of parserReports(context, parsers, candidates, bindings)) {
          report(r.node, r.messageId, { event: r.event });
        }
      },
    };
  },
};
