// Development build of the view layer's flag, resolved through core's `#view-dev` import with
// the `development` condition (view/09-template-rules.md "One rule set, three places"). Checks
// and warnings are guarded with `if (DEV)`; production builds get dev-off.ts, so they vanish.
export const DEV: boolean = true;
