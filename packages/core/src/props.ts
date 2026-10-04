// Prop bookkeeping for define() (ADR 0007): snapshots, change detection, seed restore.

type Bag = Readonly<Record<string, unknown>>;

/** The element's declared props as a plain snapshot object. */
export function readProps(el: object, names: readonly string[]): Bag {
  const self = el as Bag;
  return Object.fromEntries(names.map((name) => [name, self[name]]));
}

/** True when every declared prop is identical (`Object.is`) in both snapshots. */
export function sameProps<P>(names: readonly string[], a: P, b: P): boolean {
  return names.every((name) => Object.is((a as Bag)[name], (b as Bag)[name]));
}

/** Hydration: sets props that only travelled in the seed, unless the page already set them. */
export function restoreProps(el: object, names: readonly string[], seeded: Bag): void {
  const self = el as Record<string, unknown>;
  for (const [name, value] of Object.entries(seeded)) {
    if (names.includes(name) && self[name] === undefined) self[name] = value;
  }
}
