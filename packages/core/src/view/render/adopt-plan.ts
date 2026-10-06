// Per-template data for the hydration walk (adopt.ts, view/07-hydration.md "The parallel
// walk"): which parts sit on each static element of the template's parsed content, and which
// child holes sit in each parent node, in order. Computed once per template from its plan.
import type { PartSpec, TemplateObject } from '../normalize/types.js';
import { nodes, planOf, stack, walk, type Plan } from './plan.js';

export type Spec = PartSpec & { name?: string; strings?: readonly string[]; ref?: number | null };

/** Per template: its element parts per static element, its child holes per parent node. */
export interface Adoption {
  readonly plan: Plan;
  readonly specs: readonly Spec[];
  readonly attrs: Map<Node, number[]>;
  readonly holes: Map<Node, number[]>;
}

const adoptions = new WeakMap<TemplateObject, Adoption>();

export function adoptionOf(template: TemplateObject): Adoption {
  let a = adoptions.get(template);
  if (a !== undefined) return a;
  const plan = planOf(template);
  // The plan's targets in the template's own content: where each part sits.
  stack[0] = plan.content;
  if (plan.single) stack[1] = plan.content.firstChild as Node;
  walk(plan);
  a = { plan, specs: template.parts, attrs: new Map(), holes: new Map() };
  for (let i = 0; i < plan.kinds.length; i++) {
    const node = nodes[plan.a[i] as number] as Node;
    const map = (plan.kinds[i] as number) >= 0 ? a.attrs : a.holes;
    const list = map.get(node);
    if (list === undefined) map.set(node, [i]);
    else list.push(i);
  }
  adoptions.set(template, a);
  return a;
}
