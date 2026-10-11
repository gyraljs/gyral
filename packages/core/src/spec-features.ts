// Optional machinery that apps reach through spec fields rather than an API call (view/05
// "Features register themselves", gyral-c5d.12): view transitions (`viewTransition`), the frame
// lane (`renderOnFrame`), custom states (`states`), subscriptions (`subscriptions`) and the error
// fallback (`error`, and the `Errored` message); and
// through markup: the dialog and popover bindings (`?modal`, `?popover-open`); and through a
// hook spec key: hook disposal (`dispose`). Core's
// `#spec-features` resolves here by
// default (the runtime path: no build step), so everything is present. Builds with the Vite
// preset (the `gyral-compiled` condition) resolve spec-features-used.ts instead, whose slots
// the build fills only for the fields some module names (use-*.ts, compiler/features.ts).
import { frameLane as lane, type FrameLane } from './frame-lane.js';
import { syncStates } from './states.js';
import { formFeature } from './form-associated.js';
import { renderErrorView, sendErrored } from './error-view.js';
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
export const formAssociation: typeof formFeature | undefined = formFeature;
/** Makes a host's subscription set (`subscriptions`, ADR 0025). */
export const subscriptions: typeof subscriptionSet | undefined = subscriptionSet;
/** Renders a component's `error` view (ADR 0024). */
export const errorView: typeof renderErrorView | undefined = renderErrorView;
/** Sends `Errored` to a component that handles it (ADR 0024). */
export const errored: typeof sendErrored | undefined = sendErrored;

/** Registrations (use-*.ts) are for compiled builds; here everything is present. */
export const useViewTransitions: (run: ViewTransitions) => void = () => undefined;
export const useFrameLane: (lane: FrameLane) => void = () => undefined;
export const useCustomStates: (sync: CustomStates) => void = () => undefined;
export const useFormAssociation: (make: typeof formFeature) => void = () => undefined;
export const useSubscriptions: (make: typeof subscriptionSet) => void = () => undefined;
export const useErrorView: (view: typeof renderErrorView) => void = () => undefined;
export const useErrored: (send: typeof sendErrored) => void = () => undefined;

/** Development check for compiled builds (spec-features-used.ts); nothing to check here. */
export const checkSpecFeatures: (tag: string, spec: object) => void = () => undefined;
