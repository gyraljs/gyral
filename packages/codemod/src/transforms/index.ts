// Transforms per release: `npx @gyral/codemod <release>` runs that release's list.
import { release as v038 } from './0.3.8/index.js';
import type { Release } from './types.js';

export const RELEASES: Readonly<Record<string, Release>> = { '0.3.8': v038 };

export type { Release, Transform, TransformContext } from './types.js';
