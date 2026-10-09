// create-gyral's programmatic API (the `create-gyral` bin is ./cli.ts): parse arguments like the
// CLI, list a template's files, and write a project. Everything else is internal.
export { parse } from './args.js';
export type { Options, Parsed, Template } from './args.js';
export { manifest, scaffold } from './scaffold.js';
export type { Manifest, ScaffoldOptions } from './scaffold.js';
