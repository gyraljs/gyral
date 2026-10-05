// create-gyral's programmatic API (the `create-gyral` bin is ./cli.ts).
export { isTemplate, parse, TEMPLATES, USAGE } from './args.js';
export type { Options, Parsed, Template } from './args.js';
export { invalidPackageName, toPackageName } from './names.js';
export { detectPackageManager, nextSteps } from './package-manager.js';
export type { PackageManager } from './package-manager.js';
export { isEmptyDir, manifest, scaffold, TEMPLATES_DIR } from './scaffold.js';
export type { Manifest, ScaffoldOptions } from './scaffold.js';
