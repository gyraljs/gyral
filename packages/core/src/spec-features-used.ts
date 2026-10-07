// `#spec-features` in builds with the Vite preset (the `gyral-compiled` condition, gyral-c5d.12):
// the same exports as spec-features.ts, as slots. The build fills a slot (use-*.ts) when some
// module it transforms names the spec field (compiler/features.ts), so apps without view
// transitions, the frame lane or custom states don't bundle them. An unfilled slot degrades as
// the platform would (ADR 0003 tier 1): no transition, the microtask lane, no custom states.
// That happens only when a field's name is built at run time; development builds warn.
import type * as Full from './spec-features.js';
import { DEV } from './view/index.js';

export let viewTransitions: typeof Full.viewTransitions;
export let frameLane: typeof Full.frameLane;
export let customStates: typeof Full.customStates;

export const useViewTransitions = ((run) => {
  viewTransitions = run;
}) satisfies typeof Full.useViewTransitions;
export const useFrameLane = ((lane) => {
  frameLane = lane;
}) satisfies typeof Full.useFrameLane;
export const useCustomStates = ((sync) => {
  customStates = sync;
}) satisfies typeof Full.useCustomStates;

/** Development: a spec field whose machinery the build left out (define(), element.ts). */
export const checkSpecFeatures = ((tag: string, spec: object): void => {
  if (!DEV) return;
  const slots: Record<string, unknown> = {
    viewTransition: viewTransitions,
    renderOnFrame: frameLane,
    states: customStates,
  };
  for (const [field, slot] of Object.entries(slots)) {
    if (!(field in spec) || slot !== undefined) continue;
    console.warn(
      `gyral: <${tag}> declares ${field}, but the build found no module naming it, so its ` +
        `code was left out and the component renders without it. Write the field name in your ` +
        `source (view/05-element.md "Features register themselves").`,
    );
  }
}) satisfies typeof Full.checkSpecFeatures;
