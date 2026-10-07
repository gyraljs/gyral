// Specs recorded by define() outside the browser (view/05-element.md "Registration"). Only a
// map, so client bundles carry a few bytes: the server registry entries (server-component.ts,
// view/registry.ts) are built from these by the server entry (Phase 4, gyral-g1r.9) through
// `registerRecordedSpecs()`, which client code never imports.

/** A recorded spec, typed loosely: the server component builder re-types it. */
export type RecordedSpec = object;

const specs = new Map<string, RecordedSpec>();

/** define() without a DOM: remember `spec` under `tag` (first definition wins). */
export function recordSpec(tag: string, spec: RecordedSpec): void {
  if (!specs.has(tag)) specs.set(tag, spec);
}

/** Every recorded spec, by tag. */
export const recordedSpecs = (): ReadonlyMap<string, RecordedSpec> => specs;
