// Can `npx <package>` pick a command? npm's libnpmexec runs a package without a named command
// only when its manifest has exactly one bin, or a bin named after the unscoped package name;
// otherwise it fails with "could not determine executable to run". @gyral/mcp 0.3.2 shipped a
// second bin and broke the documented `npx -y @gyral/mcp`; pack:check now asserts this.

/** Packages people run by name: `npx -y @gyral/mcp`, and `npm create gyral` (`npm exec create-gyral`). */
export const RUN_BY_NAME = ['@gyral/mcp', 'create-gyral'];

/** Why `npx <name>` could not pick a bin from this `bin` field, or undefined if it can. */
export function npxBinProblem(name, bin) {
  if (typeof bin === 'string') return bin === '' ? 'empty bin' : undefined;
  const names = Object.keys(bin ?? {});
  if (names.length === 0) return 'no bin';
  const unscoped = name.replace(/^@[^/]+\//, '');
  if (names.length === 1 || names.includes(unscoped)) return undefined;
  return `bins ${names.join(', ')}: needs exactly one bin, or one named '${unscoped}'`;
}
