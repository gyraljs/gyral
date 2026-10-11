// The `run` of a driver token (defineDriver('name'), ADR 0006 "Driver tokens"). The interpreter
// recognises it and reports G0043 instead of running it; called directly, it throws.
import { DEV } from '#view-dev';

export function unprovided(): never {
  throw new Error(DEV ? 'gyral: this driver is a token; provide an implementation by name' : '');
}
