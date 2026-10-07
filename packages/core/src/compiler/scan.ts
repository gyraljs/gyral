// Finds a module's `html` and `svg` call sites for the template compiler (view/01-templates.md
// "Compiled"). Two steps, because matching an import against the configured sources may need
// module resolution (async, in the plugin): `htmlImports` lists the candidate imports, and
// `findUses` walks the module, scope-aware, for every reference to the matching bindings:
//   - html`…` (or ns.html`…` for `import * as ns`) is a call site, and so is svg`…`;
//   - any other reference (`const h = html`, `html(strings)`, `ns[x]`, `{ html } = ns`) is a
//     leftover the compiler can't follow: an error, since it would reach the runtime preparer;
//   - `export { html }` re-exports it: a warning here, an error in generateBundle when an
//     uncompiled `html` survives in the bundle. Everything said of `html` holds for `svg`.
import { children, nodeAt, nodesAt, scopeNames, type Node } from './ast.js';

/** The template tags the compiler rewrites. */
export type Tag = 'html' | 'svg';
const TAGS: readonly string[] = ['html', 'svg'];
const tagOf = (name: string | undefined): Tag | undefined =>
  name !== undefined && TAGS.includes(name) ? (name as Tag) : undefined;

/**
 * `import { html as local } from 'specifier'` (`tag` says which tag, html or svg), or
 * `import * as local from 'specifier'` (no `tag`: `ns.html` and `ns.svg` both are).
 */
export interface HtmlImport {
  readonly local: string;
  readonly namespace: boolean;
  readonly specifier: string;
  readonly tag?: Tag;
}

export interface Imports {
  readonly imports: readonly HtmlImport[];
  /** `export { html } from 'specifier'` (its node, for a code frame). */
  readonly reexports: readonly { readonly node: Node; readonly specifier: string }[];
}

export interface Uses {
  /** TaggedTemplateExpression nodes whose tag is a matching binding, and which tag it is. */
  readonly sites: readonly {
    readonly node: Node;
    readonly binding: HtmlImport;
    readonly tag: Tag;
  }[];
  /** Other references; `exported`: an `export { html }` specifier. */
  readonly leftovers: readonly { readonly node: Node; readonly exported: boolean }[];
}

const nameOf = (node: Node | undefined): string | undefined =>
  node === undefined
    ? undefined
    : node.type === 'Identifier'
      ? (node['name'] as string)
      : node.type === 'Literal' && typeof node['value'] === 'string'
        ? node['value']
        : undefined;

const specifierOf = (node: Node): string | undefined => nameOf(nodeAt(node, 'source'));

const isValue = (node: Node): boolean =>
  node['importKind'] !== 'type' && node['exportKind'] !== 'type';

/**
 * Imports of `html` and `svg` (named) and namespace imports, plus `export { html } from`
 * re-exports (of either tag).
 */
export function htmlImports(program: Node): Imports {
  const imports: HtmlImport[] = [];
  const reexports: { node: Node; specifier: string }[] = [];
  for (const statement of nodesAt(program, 'body')) {
    const specifier = specifierOf(statement);
    if (specifier === undefined || !isValue(statement)) continue;
    if (statement.type === 'ImportDeclaration') {
      for (const s of nodesAt(statement, 'specifiers')) {
        const local = nameOf(nodeAt(s, 'local'));
        if (local === undefined || !isValue(s)) continue;
        if (s.type === 'ImportNamespaceSpecifier') {
          imports.push({ local, namespace: true, specifier });
        } else if (s.type === 'ImportSpecifier') {
          const tag = tagOf(nameOf(nodeAt(s, 'imported')));
          if (tag !== undefined) imports.push({ local, namespace: false, specifier, tag });
        }
      }
    } else if (statement.type === 'ExportNamedDeclaration') {
      const html = nodesAt(statement, 'specifiers').find(
        (s) => isValue(s) && tagOf(nameOf(nodeAt(s, 'local'))) !== undefined,
      );
      if (html !== undefined) reexports.push({ node: html, specifier });
    }
  }
  return { imports, reexports };
}

const unparen = (node: Node | undefined): Node | undefined =>
  node?.type === 'ParenthesizedExpression' ? unparen(nodeAt(node, 'expression')) : node;

/** Every use of `bindings` in `program`, skipping names that a nested scope redeclares. */
export function findUses(program: Node, bindings: readonly HtmlImport[]): Uses {
  const byName = new Map(bindings.map((b) => [b.local, b]));
  const sites: { node: Node; binding: HtmlImport; tag: Tag }[] = [];
  const leftovers: { node: Node; exported: boolean }[] = [];
  const scopes: Set<string>[] = [];

  const binding = (node: Node | undefined): HtmlImport | undefined => {
    const name = node?.type === 'Identifier' ? (node['name'] as string) : undefined;
    if (name === undefined || scopes.some((s) => s.has(name))) return undefined;
    return byName.get(name);
  };

  /** The binding a tag refers to, and which tag: `html` itself, or `ns.html` (or svg). */
  const tagBinding = (tag: Node | undefined): { binding: HtmlImport; tag: Tag } | undefined => {
    if (tag?.type === 'Identifier') {
      const b = binding(tag);
      return b?.tag === undefined ? undefined : { binding: b, tag: b.tag };
    }
    if (tag?.type !== 'MemberExpression' || tag['computed'] === true) return undefined;
    const b = binding(nodeAt(tag, 'object'));
    const name = tagOf(nameOf(nodeAt(tag, 'property')));
    return b?.namespace === true && name !== undefined ? { binding: b, tag: name } : undefined;
  };

  const walkAll = (nodes: readonly Node[]): void => {
    for (const n of nodes) walk(n);
  };

  function visit(node: Node): void {
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'MetaProperty':
      case 'BreakStatement':
      case 'ContinueStatement':
        return;
      case 'ExportNamedDeclaration':
        if (nodeAt(node, 'source') === undefined) {
          for (const s of nodesAt(node, 'specifiers')) {
            if (binding(nodeAt(s, 'local')) !== undefined)
              leftovers.push({ node: s, exported: true });
          }
        }
        walkAll(nodesAt(node, 'declaration'));
        return;
      case 'TaggedTemplateExpression': {
        const tag = unparen(nodeAt(node, 'tag'));
        const b = tagBinding(tag);
        if (b === undefined) break;
        sites.push({ node, ...b });
        walkAll(nodesAt(nodeAt(node, 'quasi') ?? node, 'expressions'));
        return;
      }
      case 'MemberExpression': {
        const object = nodeAt(node, 'object');
        const b = binding(object);
        const computed = node['computed'] === true;
        if (b !== undefined) {
          // ns.other is fine; ns.html (or ns.svg) outside a tag, or ns[expr], can't be followed.
          if (!b.namespace || computed || tagOf(nameOf(nodeAt(node, 'property'))) !== undefined) {
            leftovers.push({ node, exported: false });
          }
        } else walkAll(nodesAt(node, 'object'));
        if (computed) walkAll(nodesAt(node, 'property'));
        return;
      }
      case 'Property':
      case 'MethodDefinition':
      case 'PropertyDefinition':
      case 'AccessorProperty':
        if (node['computed'] === true) walkAll(nodesAt(node, 'key'));
        walkAll(nodesAt(node, 'decorators'));
        walkAll(nodesAt(node, 'value'));
        return;
      case 'LabeledStatement':
        walkAll(nodesAt(node, 'body'));
        return;
      case 'Identifier':
        if (binding(node) !== undefined) leftovers.push({ node, exported: false });
        return;
    }
    walkAll(children(node));
  }

  function walk(node: Node): void {
    const declared = scopeNames(node)?.filter((name) => byName.has(name));
    if (declared === undefined || declared.length === 0) {
      visit(node);
      return;
    }
    scopes.push(new Set(declared));
    visit(node);
    scopes.pop();
  }

  if (byName.size > 0) walkAll(nodesAt(program, 'body'));
  return { sites, leftovers };
}
