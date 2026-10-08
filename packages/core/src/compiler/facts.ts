// What one module may use, for the build-time feature scan (features.ts, view/05-element.md
// "Features register themselves"), read from its AST (Rolldown's `this.parse`, the author's
// source: both plugins that scan run before other transforms). Comments are not in the AST,
// and type-only code is skipped (ast.ts `children`), so neither counts. What does:
//   - spec fields (`viewTransition`, `renderOnFrame`, `states`): the name as an identifier
//     anywhere in runtime code (a property key, `spec.states = …`, `{ states }`, a binding a
//     namespace import may spread, `export { f as states }`), or a string that is exactly the
//     name (`Object.defineProperty(spec, 'states', …)`). A word inside a longer string doesn't;
//   - command intents: a string or template whose markup has a `data-intent-command` attribute,
//     `data-intent-on="command"` or a bound `data-intent-on`, or a string that is exactly "command" (`events: ['command']`, a
//     `setAttribute`);
//   - `raw` (its markup is read at run time, so it may hold `data-intent-on="command"`): the
//     module lists the specifiers through which it may reach a `raw` export, and features.ts
//     counts it when one of them is a module of `@gyral/core`. Through: a named import of `raw` (any
//     alias) that the module references; a namespace import read other than as `ns.<name>`
//     (`ns.raw`, `ns[key]`, the namespace passed on); a re-export of `raw`, `export *`; a
//     dynamic `import()`. A module that re-exports core's `raw` counts itself, so `raw`
//     imported through a re-exporting module (the app's, a design system's) is still seen there.
import { children, nodeAt, nodesAt, type Node } from './ast.js';

/** Optional machinery the build adds when a module may use it. */
export type Feature = 'invokers' | 'transitions' | 'frame' | 'states';

/** The spec field each spec-field feature is reached through (04, 05). */
export const FIELDS = {
  transitions: 'viewTransition',
  frame: 'renderOnFrame',
  states: 'states',
} as const satisfies Readonly<Record<Exclude<Feature, 'invokers'>, string>>;

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
  return { names, texts, rawSources: [...new Set(reached)] };
}

/**
 * Whether the module may use `feature` by what it writes itself. For `invokers` that is the
 * markup and strings; `raw` needs resolving `rawSources` (features.ts).
 */
export function writes(facts: ModuleFacts, feature: Feature): boolean {
  if (feature === 'invokers') {
    return facts.texts.some((text) => text === 'command' || INTENT_ON_COMMAND.test(text));
  }
  const name = FIELDS[feature];
  return facts.names.has(name) || facts.texts.includes(name);
}
