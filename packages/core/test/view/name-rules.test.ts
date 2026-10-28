// Rules 15 and 16 in the browser's runtime preparer (view/09 "Errors"): checked in development
// (prepare.ts passes the name checks there; production bundles leave them out).
import { expect, it } from 'vitest';
import { DEV } from '../../src/view/index.js';
import { prepare } from '../../src/view/prepare.js';
import { t } from './helpers.js';

it.runIf(DEV)('reports a PascalCase tag and a camelCase custom-element attribute', () => {
  expect(() => prepare(t`<main><SignupForm></SignupForm></main>`)).toThrow(/template rule 15/);
  expect(() => prepare(t`<pool-card playerBase=${0}></pool-card>`)).toThrow(
    /template rule 16.*player-base=\$\{…\}/,
  );
  expect(() => prepare(t`<pool-card player-base=${0} .playerBase=${1}></pool-card>`)).not.toThrow();
});
