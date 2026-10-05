// Prop bookkeeping for define() (ADR 0007): snapshots, defaults, change detection, seed restore.
import type { PropertyDeclaration } from 'lit';

type Bag = Readonly<Record<string, unknown>>;

/** Gyral's view of a declaration: Lit's options plus `required` and `default`. */
export interface PropInfo extends PropertyDeclaration {
  readonly required?: boolean;
  readonly default?: unknown;
}

export type PropTable = Readonly<Record<string, PropInfo>>;

/** The element's declared props as set on it (no defaults): what a seed must carry. */
export function readRawProps(el: object, table: PropTable): Bag {
  const self = el as Bag;
  return Object.fromEntries(Object.keys(table).map((name) => [name, self[name]]));
}

/** The element's declared props as components see them: `default` fills `undefined`. */
export function readProps(el: object, table: PropTable): Bag {
  const self = el as Bag;
  return Object.fromEntries(
    Object.entries(table).map(([name, info]) => {
      const value = self[name];
      return [name, value === undefined && 'default' in info ? info.default : value];
    }),
  );
}

/** Required props that are still `undefined` (ADR 0007 addendum). */
export function missingRequired(el: object, table: PropTable): string[] {
  const self = el as Bag;
  return Object.entries(table)
    .filter(([name, info]) => info.required === true && self[name] === undefined)
    .map(([name]) => name);
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
