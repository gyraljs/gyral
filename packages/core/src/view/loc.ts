// Development: where each runtime template was written (view/01-templates.md "Source
// locations", gyral-g1r.24), so TemplateError and HydrationMismatch can name `file:line:col`.
// Recorded once per call site (strings array): by the Vite preset's development transform
// (`html.at(loc)`, exact source positions), or else from a stack trace at the first `html`
// call. Stack positions are those of the code the browser runs: exact without a build step,
// shifted by any transform that doesn't keep lines. Only reached from `if (DEV)` code, so
// production bundles leave this module out.

const locs = new WeakMap<readonly string[], string>();

/** The call site recorded for a template's strings. */
export const locOf = (strings: readonly string[]): string | undefined => locs.get(strings);

/** Records `loc` for `strings` unless one is known. */
export function setLoc(strings: readonly string[], loc: string | undefined): void {
  if (loc !== undefined && !locs.has(strings)) locs.set(strings, loc);
}

/** A frame's position: `url:line:col`. */
const POSITION = /^(.+):(\d+):(\d+)$/;

/** The `url:line:col` of a stack line: V8 `at f (…)` / `at …`, Firefox and Safari `f@…`. */
function frameOf(line: string): string | undefined {
  const text = line.trim();
  if (text.startsWith('at ')) {
    const rest = text.slice(3);
    const open = rest.lastIndexOf('(');
    return rest.endsWith(')') && open !== -1 ? rest.slice(open + 1, -1) : rest;
  }
  const at = text.indexOf('@');
  return at === -1 ? undefined : text.slice(at + 1);
}

/** A frame's URL as a path: no scheme and host, query, hash, or Vite's `/@fs` prefix. */
const pathOf = (url: string): string =>
  url
    .replace(/[?#].*$/, '')
    .replace(/^[a-z][\w+.-]*:\/\/[^/]*/i, '')
    .replace(/^\/@fs\//, '/');

/**
 * `path:line:col` of the frame that called the function which created `stack` (the second
 * frame: the first is that function itself), or undefined when the stack has none.
 */
export function callSite(stack: string | undefined): string | undefined {
  let seen = 0;
  for (const line of (stack ?? '').split('\n')) {
    const m = POSITION.exec(frameOf(line) ?? '');
    if (m === null) continue;
    if (seen++ === 0) continue;
    return `${pathOf(m[1] ?? '')}:${m[2] ?? ''}:${m[3] ?? ''}`;
  }
  return undefined;
}
