// Errors (ADR 0024) in the development build. The cases are in errors-cases.ts and
// errors-cases-more.ts.
import { moreErrorCases } from './errors-cases-more.js';
import { errorCases } from './errors-cases.js';
import { trackErrors } from './errors-setup.js';

const tracking = trackErrors();
errorCases(tracking);
moreErrorCases(tracking);
