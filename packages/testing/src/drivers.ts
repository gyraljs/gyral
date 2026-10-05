import { provideDrivers, type DriverOverrides } from '@gyral/core';

/**
 * Substitutes drivers for every Gyral component under `root` (including nested components in
 * shadow roots), e.g. a test container or `mountSsr(...).root`. Returns a function that removes
 * the overrides. Per-element `el.drivers` still wins (Gyral ADR 0006, tree-scoped drivers).
 */
export function withDrivers(root: Element, drivers: DriverOverrides): () => void {
  return provideDrivers(root, drivers);
}
