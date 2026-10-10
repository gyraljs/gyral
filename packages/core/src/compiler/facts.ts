// What one module may use, for the build-time feature scan (features.ts, view/05-element.md
// "Features register themselves"), read from its AST (Rolldown's `this.parse`, the author's
// source: both plugins that scan run before other transforms). Comments are not in the AST,
// and type-only code is skipped (ast.ts `children`), so neither counts. What does:
//   - spec fields (`viewTransition`, `renderOnFrame`, `states`, `subscriptions`) and the hook
//     spec key `dispose`: the name as an identifier
//     anywhere in runtime code (a property key, `spec.states = …`, `{ states }`, a binding a
//     namespace import may spread, `export { f as states }`), or a string that is exactly the
//     name (`Object.defineProperty(spec, 'states', …)`). A word inside a longer string doesn't;
//   - command intents: a string or template whose markup has a `data-intent-command` attribute,
//     `data-intent-on="command"` or a bound `data-intent-on`, or a string that is exactly "command" (`events: ['command']`, a
//     `setAttribute`);
//   - dialog and popover bindings: a template whose markup binds `?modal=` or `?popover-open=`;
//   - `raw` (its markup is read at run time, so it may hold `data-intent-on="command"`): the
//     module lists the specifiers through which it may reach a `raw` export, and features.ts
//     counts it when one of them is a module of `@gyral/core`. Through: a named import of `raw` (any
//     alias) that the module references; a namespace import read other than as `ns.<name>`
//     (`ns.raw`, `ns[key]`, the namespace passed on); a re-export of `raw`, `export *`; a
//     dynamic `import()`. A module that re-exports core's `raw` counts itself, so `raw`
//     imported through a re-exporting module (the app's, a design system's) is still seen there.
import { children, nodeAt, nodesAt, type Node } from './ast.js';

/** Optional machinery the build adds when a module may use it. */
export type Feature =
  | 'invokers'
  | 'transitions'
  | 'frame'
  | 'states'
  | 'subscriptions'
  | 'dialogs'
  | 'disposal'
  | 'errorView'
  | 'errored';

/** The spec field each spec-field feature is reached through (04, 05). */
export const FIELDS = {
  transitions: 'viewTransition',
  frame: 'renderOnFrame',
  states: 'states',
  subscriptions: 'subscriptions',
  disposal: 'dispose',
  errorView: 'error',
  errored: 'Errored',
} as const satisfies Readonly<Record<Exclude<Feature, 'invokers' | 'dialogs'>, string>>;

/** Markup that binds the dialog or popover state (`?modal=`, `?popover-open=`, view/02). */
const TOGGLE_BINDING = /\?(?:modal|popover-open)\s*=/i;

/**
 * Markup that makes a root listen for `command` (05 "Intent events"): a `data-intent-command`
 * attribute (static or bound; a string that is exactly its name, as `setAttribute` takes it), a
 * static `data-intent-on="command"` (quoted or not, alone or in a quoted list), or a bound
 * `data-intent-on` (all intent events), which a template's text shows as `${}` where its
 * expression is, and a string as an unfinished value at its end. The attribute's name is matched in any case, as the runtime reads it.
 */
const INTENT_ON_COMMAND =
  /data-intent-command(?:\s*=|$)|data-intent-on\s*=\s*(?:["'][^"'>]*?(?:(?<![\w-])command(?![\w-])|\$\{\}|$)|command(?![\w-])|[^"'\s>]*(?:\$\{\}|$))/i;

export interface ModuleFacts {
  /** Identifier names in runtime code, import declarations left out. */
  readonly names: ReadonlySet<string>;
  /** String literal values, and template literal texts with `${}` for each expression. */
  readonly texts: readonly string[];
  /** Specifiers through which the module may reach a `raw` export (see the header). */
  readonly rawSources: readonly string[];
  /** Whether the module may give a component an error view (see `specError`). */
  readonly errorView: boolean;
}

const stringOf = (node: Node | undefined): string | undefined => {
  if (node?.type === 'Literal')
    return typeof node['value'] === 'string' ? node['value'] : undefined;
  if (node?.type !== 'TemplateLiteral' || nodesAt(node, 'expressions').length > 0) return undefined;
  return templateText(node);
};

/** A template literal's text (cooked where valid), `${}` standing for each expression. */
function templateText(node: Node): string {
  return nodesAt(node, 'quasis')
    .map((q) => {
      const value = q['value'] as { cooked?: string | null; raw?: string } | undefined;
      return value?.cooked ?? value?.raw ?? '';
    })
    .join('${}');
}

/** An identifier's name, or a string literal's value (`import { 'raw' as r }`). */
const nameOf = (node: Node | undefined): string | undefined =>
  node?.type === 'Identifier' ? (node['name'] as string) : stringOf(node);

const isValue = (node: Node): boolean =>
  node['importKind'] !== 'type' && node['exportKind'] !== 'type';

const bump = (counts: Map<string, number>, name: string): void => {
  counts.set(name, (counts.get(name) ?? 0) + 1);
};

const FUNCTION = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

/** A callee named `define` (`define`, `ns.define`), or the inner call of `define<…>()(…)`. */
function isDefine(callee: Node | undefined): boolean {
  if (callee?.type === 'CallExpression') return isDefine(nodeAt(callee, 'callee'));
  if (callee?.type === 'Identifier') return callee['name'] === 'define';
  if (callee?.type === 'MemberExpression' && callee['computed'] !== true)
    return nameOf(nodeAt(callee, 'property')) === 'define';
  return false;
}

/**
 * The `error` spec field (ADR 0024) by its position, not its name, because `error` is also a
 * common state field, `catch (error)` binding and message name (gyral-1zd.29). It counts:
 *   - an `error` key (any value) in a spec object passed to `define()`, inline or through a
 *     `const` in the same module, spreads of such consts included;
 *   - anywhere else, an `error` key whose value is a function (`error: (failure, s) => …`,
 *     `error(failure, s) { … }`) or a shorthand `{ error }`, and an assignment of a function to
 *     a member `x.error` (a spec built elsewhere and passed in).
 * What it misses: a spec object built in another module whose `error` value isn't written as a
 * function there (`export const spec = { error: someView }`); view/05 says to write the error
 * view as a function in the spec.
 */
function specError(program: Node): boolean {
  const objects = new Map<string, Node>();
  let found = false;
  const keyOf = (prop: Node): string | undefined =>
    prop['computed'] === true ? undefined : nameOf(nodeAt(prop, 'key'));
  const specHasError = (node: Node | undefined, depth = 0): boolean => {
    if (node?.type === 'Identifier' && depth < 3) {
      return specHasError(objects.get(node['name'] as string), depth + 1);
    }
    if (node?.type !== 'ObjectExpression') return false;
    return nodesAt(node, 'properties').some((p) =>
      p.type === 'SpreadElement'
        ? specHasError(nodeAt(p, 'argument'), depth + 1)
        : keyOf(p) === 'error',
    );
  };
  const collect = (node: Node): void => {
    if (node.type === 'VariableDeclarator') {
      const id = nodeAt(node, 'id');
      const init = nodeAt(node, 'init');
      if (id?.type === 'Identifier' && init?.type === 'ObjectExpression')
        objects.set(id['name'] as string, init);
    }
    for (const child of children(node)) collect(child);
  };
  const visit = (node: Node): void => {
    if (found) return;
    switch (node.type) {
      case 'CallExpression':
        if (isDefine(nodeAt(node, 'callee'))) {
          const args = nodesAt(node, 'arguments');
          if (args.some((a) => specHasError(a))) found = true;
        }
        break;
      case 'Property':
      case 'MethodDefinition':
      case 'PropertyDefinition':
        if (keyOf(node) === 'error') {
          const value = nodeAt(node, 'value');
          if (
            node['shorthand'] === true ||
            node['method'] === true ||
            node.type === 'MethodDefinition' ||
            (value !== undefined && FUNCTION.has(value.type))
          ) {
            found = true;
          }
        }
        break;
      case 'AssignmentExpression': {
        const left = nodeAt(node, 'left');
        const right = nodeAt(node, 'right');
        if (
          left?.type === 'MemberExpression' &&
          left['computed'] !== true &&
          nameOf(nodeAt(left, 'property')) === 'error' &&
          right !== undefined &&
          FUNCTION.has(right.type)
        ) {
          found = true;
        }
        break;
      }
    }
    for (const child of children(node)) visit(child);
  };
  for (const statement of nodesAt(program, 'body')) collect(statement);
  for (const statement of nodesAt(program, 'body')) visit(statement);
  return found;
}

/** The facts the scan needs about a module (`program`, from `this.parse`). */
export function factsOf(program: Node): ModuleFacts {
  /** Every identifier name, and how often each is referenced (property names left out). */
  const names = new Set<string>();
  const refs = new Map<string, number>();
  const texts: string[] = [];
  const reached: string[] = [];
  /** Imports of `raw` (local name → specifier), and namespace imports. */
  const rawImports = new Map<string, string>();
  const namespaces = new Map<string, string>();
  /** Per namespace, the reads `ns.<name other than raw>`: they can't reach `raw`. */
  const safe = new Map<string, number>();

  for (const statement of nodesAt(program, 'body')) {
    const specifier = stringOf(nodeAt(statement, 'source'));
    if (specifier === undefined || !isValue(statement)) continue;
    if (statement.type === 'ImportDeclaration') {
      for (const s of nodesAt(statement, 'specifiers')) {
        const local = nameOf(nodeAt(s, 'local'));
        if (local === undefined || !isValue(s)) continue;
        if (s.type === 'ImportNamespaceSpecifier') namespaces.set(local, specifier);
        else if (s.type === 'ImportSpecifier' && nameOf(nodeAt(s, 'imported')) === 'raw')
          rawImports.set(local, specifier);
      }
    } else if (statement.type === 'ExportAllDeclaration') {
      reached.push(specifier);
    } else if (statement.type === 'ExportNamedDeclaration') {
      const specifiers = nodesAt(statement, 'specifiers');
      if (specifiers.some((s) => isValue(s) && nameOf(nodeAt(s, 'local')) === 'raw'))
        reached.push(specifier);
    }
  }

  /** A non-computed property name (`{ key: … }`, `a.key`, a class member): not a reference. */
  const key = (node: Node | undefined): void => {
    if (node?.type === 'Identifier') names.add(node['name'] as string);
    else if (node !== undefined) visit(node);
  };

  const visit = (node: Node): void => {
    switch (node.type) {
      case 'ImportDeclaration':
        return;
      case 'Identifier':
      case 'JSXIdentifier':
        names.add(node['name'] as string);
        bump(refs, node['name'] as string);
        return;
      case 'Literal':
        if (typeof node['value'] === 'string') texts.push(node['value']);
        return;
      case 'TemplateLiteral':
        texts.push(templateText(node));
        break;
      case 'ImportExpression': {
        const specifier = stringOf(nodeAt(node, 'source'));
        if (specifier !== undefined) reached.push(specifier);
        break;
      }
      case 'MemberExpression': {
        const object = nodeAt(node, 'object');
        const property = nodeAt(node, 'property');
        const computed = node['computed'] === true;
        const ns = object?.type === 'Identifier' ? (object['name'] as string) : undefined;
        if (ns !== undefined && namespaces.has(ns)) {
          const name = computed ? stringOf(property) : nameOf(property);
          if (name !== undefined && name !== 'raw') bump(safe, ns);
        }
        if (object !== undefined) visit(object);
        if (computed) {
          if (property !== undefined) visit(property);
        } else key(property);
        return;
      }
      case 'Property':
      case 'MethodDefinition':
      case 'PropertyDefinition':
      case 'AccessorProperty':
        if (node['computed'] === true || node['shorthand'] === true) break;
        key(nodeAt(node, 'key'));
        for (const child of children(node)) if (child !== nodeAt(node, 'key')) visit(child);
        return;
    }
    for (const child of children(node)) visit(child);
  };
  for (const statement of nodesAt(program, 'body')) visit(statement);

  for (const [local, specifier] of rawImports) {
    if ((refs.get(local) ?? 0) > 0) reached.push(specifier);
  }
  for (const [local, specifier] of namespaces) {
    if ((refs.get(local) ?? 0) > (safe.get(local) ?? 0)) reached.push(specifier);
  }
  return { names, texts, rawSources: [...new Set(reached)], errorView: specError(program) };
}

/**
 * Whether the module may use `feature` by what it writes itself. For `invokers` that is the
 * markup and strings; `raw` needs resolving `rawSources` (features.ts).
 */
export function writes(facts: ModuleFacts, feature: Feature): boolean {
  if (feature === 'invokers') {
    return facts.texts.some((text) => text === 'command' || INTENT_ON_COMMAND.test(text));
  }
  if (feature === 'dialogs') return facts.texts.some((text) => TOGGLE_BINDING.test(text));
  if (feature === 'errorView') return facts.errorView;
  const name = FIELDS[feature];
  return facts.names.has(name) || facts.texts.includes(name);
}
