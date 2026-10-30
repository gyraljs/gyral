// The 0.3.8 transforms (docs/references/migrating-0.3.7-to-0.3.8.md, "New APIs"). Each reads
// the original AST; their edits never overlap, so they share one MagicString.
import type { Release, Transform } from '../types.js';
import { driverLists } from './driver-lists.js';
import { subscriptionTokens } from './subscription-tokens.js';
import { vitePlugin } from './vite-plugin.js';

const transforms: readonly Transform[] = [vitePlugin, subscriptionTokens, driverLists];

/** They rewrite 0.3.7's API (`gyralVitePreset`, driver records, string subscription names). */
export const release: Release = { from: '0.3.7', transforms };
