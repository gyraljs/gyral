// @gyral/router uses @gyral/core's internals, so it runs only with the core of its own release
// (ADR 0033): development throws G0016 when they differ, production warns. Every entry point
// that loads core imports this module, and package.json lists it in sideEffects so bundlers
// keep the check.
import { requireCore } from '@gyral/core/internal';
import { VERSION } from './version.js';

requireCore('@gyral/router', VERSION);
