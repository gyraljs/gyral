import { contentSecurityPolicy } from '../../src/index.js';
export const policy = (hashes: readonly string[]) =>
  contentSecurityPolicy({ componentStyleHashes: hashes, directives: { 'default-src': "'self'" } });
