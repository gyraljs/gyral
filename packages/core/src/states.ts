// Model state → CSS custom states (`:state(loading)`), via ElementInternals (ADR 0001 addendum).
// An ADR 0003 enhancement: CustomStateSet is feature-detected; without it nothing is set.

interface StateSetLike {
  add(name: string): void;
  delete(name: string): boolean;
}

/** Writes a component's boolean states to its CustomStateSet. */
export type StateSync = (states: Readonly<Record<string, boolean>>) => void;

/**
 * A function that mirrors boolean states onto `internals.states`, or `false` when the platform
 * lacks custom states.
 */
export function stateSync(internals: ElementInternals): StateSync | false {
  if (!('states' in internals)) return false;
  const set = internals.states as StateSetLike;
  return (states) => {
    for (const [name, on] of Object.entries(states)) {
      if (on) set.add(name);
      else set.delete(name);
    }
  };
}
