// Registers frameLane in a compiled build (gyral-c5d.12). Only the module the build adds for a
// module that names the spec field imports it (compiler/features.ts), so other builds leave
// frame-lane.ts out.
import { useFrameLane } from '#spec-features';
import { frameLane } from './frame-lane.js';

/** Called once by the added module, before any module that names the field runs. */
export function register(): void {
  useFrameLane(frameLane);
}
