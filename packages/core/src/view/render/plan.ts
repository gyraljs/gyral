// Instantiation plans (view/01-templates.md "Instantiation"): computed once per template object,
// they say how to reach every part's nodes in a clone by child-index paths, following
// firstChild/nextSibling and sharing prefixes (no TreeWalker, no marker search), and what each
// part is. Part kinds that depend on the element (live form state) are decided here, from the
// template's own parsed content, so creating an instance only walks and allocates.
import {
  ATTR_PART,
  BOOL_PART,
  CHILD_BEFORE,
  CHILD_SOLE,
  MULTI_PART,
  PROP_PART,
  HOOK_PART,
  TEXT_PART,
  type PartSpec,
  type TemplateObject,
} from '../normalize/types.js';
import { templateElement } from '../template-element.js';
import { attrKind, HOOK, MULTI, PROP, TEXTAREA, TITLE } from './attr-parts.js';

/** Plan kinds of child parts (element parts use their attr-parts.ts kind, ≥ 0). */
export const CHILD = -1;
export const SOLE = -2;
export const ROOT = -3;

export interface Plan {
  readonly content: DocumentFragment;
  /** One root node and no root-level holes: clone that node instead of the fragment. */
  readonly single: boolean;
  /** Per target node, in document order: keep depth, sibling skip (-1: none), n, n indexes. */
  readonly ops: readonly number[];
  readonly targets: number;
  /** Per part: its element's (or child part's parent's) target, its reference node's target. */
  readonly a: readonly number[];
  readonly b: readonly number[];
  /** Per part: the index of its (first) value, and its kind. */
  readonly at: readonly number[];
  readonly kinds: readonly number[];
}

/** Scratch space for walks (never re-entrant: nested instances are created after the walk). */
export const stack: Node[] = [];
export const nodes: Node[] = [];

/** Fills `nodes` with each target of `plan`, walking from `stack[0]` (or `stack[1]`). */
export function walk(plan: Plan): void {
  const ops = plan.ops;
  let k = 0;
  for (let t = 0; t < plan.targets; t++) {
    const keep = ops[k] as number;
    const skip = ops[k + 1] as number;
    const n = ops[k + 2] as number;
    k += 3;
    let depth = keep;
    let node = stack[keep] as Node;
    if (skip >= 0) {
      node = stack[++depth] as Node;
      for (let s = 0; s < skip; s++) node = node.nextSibling as Node;
      stack[depth] = node;
    }
    for (let j = 0; j < n; j++) {
      node = node.firstChild as Node;
      for (let s = ops[k++] as number; s > 0; s--) node = node.nextSibling as Node;
      stack[++depth] = node;
    }
    nodes[t] = node;
  }
}

function build(template: TemplateObject): Plan {
  const content = templateElement(template).content;
  const single = content.childNodes.length === 1 && template.parts.every((p) => p[1].length > 0);
  const ids = new Map<string, number>();
  const ops: number[] = [];
  let cursor: readonly number[] = single ? [0] : [];
  const target = (path: readonly number[]): number => {
    const id = path.join();
    const known = ids.get(id);
    if (known !== undefined) return known;
    let keep = 0;
    while (keep < path.length && path[keep] === cursor[keep]) keep++;
    if (keep === path.length) {
      ops.push(keep, -1, 0); // an ancestor of the cursor (or the cursor itself)
    } else {
      const from = (cursor[keep] ?? Infinity) < (path[keep] as number) ? keep + 1 : keep;
      const skip = from > keep ? (path[keep] as number) - (cursor[keep] as number) : -1;
      ops.push(keep, skip, path.length - from, ...path.slice(from));
      cursor = path;
    }
    ids.set(id, ids.size);
    return ids.size - 1;
  };
  const a: number[] = [];
  const b: number[] = [];
  const at: number[] = [];
  let value = 0;
  for (const spec of template.parts) {
    a.push(target(spec[1]));
    b.push(spec[0] === CHILD_BEFORE ? target([...spec[1], spec[2]]) : -1);
    at.push(value);
    value += spec[0] === MULTI_PART ? spec[3].length - 1 : 1;
  }
  const kinds: number[] = [];
  const plan: Plan = { content, single, ops, targets: ids.size, a, b, at, kinds };
  // Walk the template's own content once to decide the element-dependent kinds.
  stack[0] = content;
  if (single) stack[1] = content.firstChild as Node;
  walk(plan);
  template.parts.forEach((spec, i) => {
    kinds.push(kindOf(spec, nodes[a[i] as number] as Element));
  });
  return plan;
}

function kindOf(spec: PartSpec, el: Element): number {
  switch (spec[0]) {
    case ATTR_PART:
      return attrKind(el, spec[2], false);
    case MULTI_PART:
      return MULTI;
    case BOOL_PART:
      return attrKind(el, spec[2], true);
    case PROP_PART:
      return PROP;
    case HOOK_PART:
      return HOOK;
    case TEXT_PART:
      return el.localName === 'textarea' ? TEXTAREA : TITLE;
    default:
      return spec[1].length === 0 ? ROOT : spec[0] === CHILD_SOLE ? SOLE : CHILD;
  }
}

const plans = new WeakMap<TemplateObject, Plan>();
let lastTemplate: TemplateObject | undefined;
let lastPlan: Plan | undefined;

/** The plan of `template` (one-entry cache in front of the WeakMap: rows repeat a template). */
export function planOf(template: TemplateObject): Plan {
  if (template === lastTemplate) return lastPlan as Plan;
  let plan = plans.get(template);
  if (plan === undefined) {
    plan = build(template);
    plans.set(template, plan);
  }
  lastTemplate = template;
  lastPlan = plan;
  return plan;
}
