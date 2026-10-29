# Behavior changes in 0.3.8

Gyral 0.3.8 delivers the "Now" items of the 2026-10-28 ecosystem review (epic gyral-337) and a
full dependency update. Changes a working app can notice come first, each with what to do; then
new checks, then workarounds you can remove.

## Behavior changes

| Change                                                                       | Before 0.3.8                                                                                                  | What to do                                                                                                                                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gyral's packages take `@gyral/core` as a peer at their exact version (337.5) | Each listed core as a dependency, so a package of another version than the app's core installed a second core | Give every `@gyral/*` package the same version. pnpm now reports a mismatch at install time; npm stops with ERESOLVE. Overrides that only kept Gyral's packages on one core can go |

Details: ADR 0033 (the first).

## New checks and warnings

- **A Gyral package of another release than core (G0016):** each of `@gyral/devtools`, `http`,
  `router`, `ssr`, `testing` and `time` checks core's version when it loads. Development
  throws, naming both versions; production logs the coded warning.

## Workarounds you can remove

- Install-time gates and overrides that kept Gyral's own packages on one copy of core, such as
  joystyk's `scripts/check-gyral.ts`. Keep an override for a third-party library that still
  pins core as a dependency, and ask its authors to make core a peer
  ([component-libraries.md](component-libraries.md)).
