// Transforms per release: `npx @gyral/codemod <release>` runs that release's list.
import { transforms as v038 } from './0.3.8/index.js';
import type { Transform } from './types.js';

export const RELEASES: Readonly<Record<string, readonly Transform[]>> = { '0.3.8': v038 };

export type { Transform, TransformContext } from './types.js';
