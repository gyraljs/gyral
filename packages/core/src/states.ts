// Model state → CSS custom states (`:state(loading)`), via ElementInternals (ADR 0001 addendum).
// An ADR 0003 enhancement: CustomStateSet is feature-detected; without it nothing is set.
// Reached through core's `#spec-features` (spec-features.ts): compiled builds bundle it only
// when a module names `states` (compiler/features.ts, gyral-c5d.12).

interface StateSetLike {
  add(name: string): void;
  delete(name: string): boolean;
}

/** Each host's state set; `false` when the platform lacks custom states. */
const sets = new WeakMap<HTMLElement, StateSetLike | false>();

/**
 * Mirrors a component's boolean states onto its CustomStateSet. ElementInternals is attached
 * lazily, once per element, by the first sync (view/05-element.md "ElementInternals").
 */
export function syncStates(el: HTMLElement, states: Readonly<Record<string, boolean>>): void {
  let set = sets.get(el);
  if (set === undefined) {
    const internals = el.attachInternals();
    set = 'states' in internals ? internals.states : false;
    sets.set(el, set);
  }
  if (set === false) return;
  for (const [name, on] of Object.entries(states)) {
    if (on) set.add(name);
    else set.delete(name);
  }
}
