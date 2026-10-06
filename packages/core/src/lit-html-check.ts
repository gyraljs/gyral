// Development-only warning for the lit-html >= 3.3.1 repeat() leak (gyral-9y6, ADR 0015,
// lit/lit#5298): removing repeat() items leaves one comment node per item in the DOM.
// lit-html records every loaded copy's version in `globalThis.litHtmlVersions`. Called from
// devtools.ts, which production builds replace, so this costs nothing in production.

/** First lit-html release with the leak. Raise the upper bound once upstream ships a fix. */
const FIRST_LEAKING = [3, 3, 1] as const;

function parse(version: string): readonly number[] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function atLeast(version: readonly number[], floor: readonly number[]): boolean {
  for (let i = 0; i < floor.length; i++) {
    const a = version[i] ?? 0;
    const b = floor[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

/** The loaded lit-html versions that have the repeat() leak. */
export function leakingLitHtml(versions: readonly string[]): string[] {
  return versions.filter((v) => {
    const parsed = parse(v);
    return parsed !== undefined && parsed[0] === 3 && atLeast(parsed, FIRST_LEAKING);
  });
}

let warned = false;

/** Warns once per page when a leaking lit-html is loaded. */
export function warnLeakingLitHtmlOnce(): void {
  if (warned) return;
  warned = true;
  const versions = (globalThis as { litHtmlVersions?: unknown }).litHtmlVersions;
  if (!Array.isArray(versions)) return;
  const leaking = leakingLitHtml(versions.filter((v): v is string => typeof v === 'string'));
  if (leaking.length === 0) return;
  console.warn(
    `gyral: lit-html ${leaking.join(', ')} leaks one DOM comment per removed repeat() item ` +
      '(https://github.com/lit/lit/issues/5298). Pin lit-html to 3.3.0 with an override: ' +
      'https://github.com/gyraljs/gyral/blob/main/docs/references/consumer-setup.md' +
      '#known-issue-lit-html-331-list-leak (development builds only).',
  );
}

/** Test hook: allow the warning again. */
export function resetLitHtmlWarningForTests(): void {
  warned = false;
}
