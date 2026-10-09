// Optional machinery that apps reach through spec fields rather than an API call (view/05
// "Features register themselves", gyral-c5d.12): view transitions (`viewTransition`), the frame
// lane (`renderOnFrame`), custom states (`states`) and subscriptions (`subscriptions`); and
// through markup: the dialog and popover bindings (`?modal`, `?popover-open`); and through a
// hook spec key: hook disposal (`dispose`). Core's
// `#spec-features` resolves here by
// default (the runtime path: no build step), so everything is present. Builds with the Vite
// preset (the `gyral-compiled` condition) resolve spec-features-used.ts instead, whose slots
// the build fills only for the fields some module names (use-*.ts, compiler/features.ts).
import { frameLane as lane, type FrameLane } from './frame-lane.js';
import { syncStates } from './states.js';
import { subscriptionSet } from './subscriptions.js';
import { startTransition } from './transitions.js';
import { applyToggle, commitTracked, useDisposableHooks, useToggles } from './view/index.js';

// `?modal`/`?popover-open` (view/02 "Dialogs and popovers"): present without a build step.
useToggles(applyToggle);
// Hooks with `dispose` (view/02 "Widgets with a lifecycle"): present without a build step.
useDisposableHooks(commitTracked);

/** Runs a flush inside a view transition (true), or declines (false: run it plainly). */
export type ViewTransitions = (update: () => void) => boolean;
/** Writes a host's boolean states to its CustomStateSet. */
export type CustomStates = (el: HTMLElement, states: Readonly<Record<string, boolean>>) => void;

export const viewTransitions: ViewTransitions | undefined = startTransition;
export const frameLane: FrameLane | undefined = lane;
export const customStates: CustomStates | undefined = syncStates;
/** Makes a host's subscription set (`subscriptions`, ADR 0025). */
export const subscriptions: typeof subscriptionSet | undefined = subscriptionSet;

/** Registrations (use-*.ts) are for compiled builds; here everything is present. */
export const useViewTransitions: (run: ViewTransitions) => void = () => undefined;
export const useFrameLane: (lane: FrameLane) => void = () => undefined;
export const useCustomStates: (sync: CustomStates) => void = () => undefined;
export const useSubscriptions: (make: typeof subscriptionSet) => void = () => undefined;

/** Development check for compiled builds (spec-features-used.ts); nothing to check here. */
export const checkSpecFeatures: (tag: string, spec: object) => void = () => undefined;
