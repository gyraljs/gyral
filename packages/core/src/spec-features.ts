// Optional machinery that apps reach through spec fields rather than an API call (view/05
// "Features register themselves", gyral-c5d.12): view transitions (`viewTransition`), the frame
// lane (`renderOnFrame`) and custom states (`states`). Core's `#spec-features` resolves here by
// default (the runtime path: no build step), so everything is present. Builds with the Vite
// preset (the `gyral-compiled` condition) resolve spec-features-used.ts instead, whose slots
// the build fills only for the fields some module names (use-*.ts, compiler/features.ts).
import { frameLane as lane, type FrameLane } from './frame-lane.js';
import { syncStates } from './states.js';
import { startTransition } from './transitions.js';

/** Runs a flush inside a view transition (true), or declines (false: run it plainly). */
export type ViewTransitions = (update: () => void) => boolean;
/** Writes a host's boolean states to its CustomStateSet. */
export type CustomStates = (el: HTMLElement, states: Readonly<Record<string, boolean>>) => void;

export const viewTransitions: ViewTransitions | undefined = startTransition;
export const frameLane: FrameLane | undefined = lane;
export const customStates: CustomStates | undefined = syncStates;

/** Registrations (use-*.ts) are for compiled builds; here everything is present. */
export const useViewTransitions: (run: ViewTransitions) => void = () => undefined;
export const useFrameLane: (lane: FrameLane) => void = () => undefined;
export const useCustomStates: (sync: CustomStates) => void = () => undefined;

/** Development check for compiled builds (spec-features-used.ts); nothing to check here. */
export const checkSpecFeatures: (tag: string, spec: object) => void = () => undefined;
