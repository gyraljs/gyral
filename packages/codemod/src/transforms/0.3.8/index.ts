// The 0.3.8 transforms (docs/references/migrating-0.3.7-to-0.3.8.md, "New APIs"). Each reads
// the original AST; their edits never overlap, so they share one MagicString.
import type { Transform } from '../types.js';
import { driverLists } from './driver-lists.js';
import { subscriptionTokens } from './subscription-tokens.js';
import { vitePlugin } from './vite-plugin.js';

export const transforms: readonly Transform[] = [vitePlugin, subscriptionTokens, driverLists];
