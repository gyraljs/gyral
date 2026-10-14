// check_snippet's suggested fixes for common Gyral mistakes found in the source (TypeScript
// errors are explained in explain-ts.ts), each with a concrete fix, so an agent can fix and
// check again (a loop like svelte-autofixer's). The checks are textual and cheap; they run on
// code with comments blanked out, and say where the runtime would report a G-code.
import { blankComments, lineAt, propertyValues } from './source-scan.js';

export interface Suggestion {
  /** 1-based line, when the problem has a place. */
  readonly line?: number;
  /** A short id for the mistake, e.g. `single-call-define`. */
  readonly rule: string;
  /** The diagnostic code the runtime (Gyral G0050) or TypeScript (TS2554) reports for it. */
  readonly code?: string;
  readonly problem: string;
  readonly fix: string;
  /** `hint`: worth knowing, but valid Gyral (the check still passes). Default: an error. */
  readonly severity?: 'hint';
}

const ERRORS = 'https://gyral.dev/errors/#';

interface Rule {
  readonly rule: string;
  readonly code?: string;
  readonly problem: string;
  readonly fix: string;
  readonly severity?: 'hint';
  /** Offsets of each occurrence in the comment-free code. */
  readonly find: (code: string) => readonly number[];
}

const all = (pattern: RegExp) => (code: string) =>
  [
    ...code.matchAll(
      new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`),
    ),
  ].map((m) => m.index);

/** Occurrences of `pattern` inside the values of the given spec properties. */
const inside =
  (properties: readonly string[], pattern: RegExp) =>
  (code: string): number[] =>
    properties.flatMap((p) =>
      propertyValues(code, p).flatMap(({ start, text }) =>
        all(pattern)(text).map((offset) => start + offset),
      ),
    );

const IMPURE =
  /\b(?:fetch\s*\(|setTimeout\s*\(|setInterval\s*\(|requestAnimationFrame\s*\(|Math\.random\s*\(|Date\.now\s*\(|new Date\s*\(\s*\)|localStorage\b|sessionStorage\b|document\.|window\.|navigator\.|addEventListener\s*\()/;

const RULES: readonly Rule[] = [
  {
    rule: 'single-call-define',
    code: 'TS2554',
    problem: '`define` was called with the tag and spec in one call.',
    fix: "define takes its types first, then the tag and spec: `define<State, Msg>()('my-tag', { init, intent, update, view })` (or `define()('my-tag', spec)` to infer them).",
    find: all(/\bdefine\s*(?:<[^()]*?>)?\s*\(\s*['"`]/),
  },
  {
    rule: 'periodic',
    problem: '`periodic` is not a Gyral export.',
    fix: "Use `every(ms, (now) => msg, key?)` from '@gyral/time' in `subscriptions: (s) => [every(1000, (now) => ({ _tag: 'Tick', now }))]`. It sends the time at once, then every `ms`; count from the first message.",
    find: all(/\bperiodic\b/),
  },
  {
    rule: 'long-lived-work-in-init',
    problem: 'A long-lived watch (`listen`, `every`, a `subscription`) is started from `init`.',
    fix: "Move it to `subscriptions: (s, p) => [listen((location) => ({ _tag: 'Routed', location }))]`. Gyral starts, restarts and stops those with the state; `init` commands run once and are not restarted after a detach.",
    find: inside(
      ['init'],
      /\b(?:listen|every|watch\w*)\s*\(|\bcommand\s*\(\s*\w*(?:feed|socket|subscription)\w*/i,
    ),
  },
  {
    rule: 'side-effect-in-model',
    problem:
      'A side effect (fetch, a timer, randomness, the clock, storage or the DOM) runs inside `init`, `update` or `view`.',
    fix: 'Reducers and views are pure: return `[nextState, [command]]` and let a driver do it (`get`/`request` from @gyral/http, `delay`/`every` from @gyral/time, `focus()`/`call()` from core, or `defineDriver` + `command`). Pass the time or a random value in with the message (`every` sends `now`).',
    find: inside(['update', 'init', 'view'], IMPURE),
  },
  {
    rule: 'state-mutation',
    problem: 'State is mutated in place.',
    fix: 'Return a new object: `{ ...s, items: [...s.items, m.item] }`. Gyral compares states by identity, so a mutation may not render.',
    find: inside(
      ['update'],
      /\b(?:s|state)\.[\w.]+\.(?:push|pop|shift|unshift|splice|sort|reverse)\s*\(|\b(?:s|state)\.\w+\s*(?:=(?!=)|\+\+|--|\+=|-=)/,
    ),
  },
  {
    rule: 'closure-in-view',
    problem: 'An event handler is attached in the view.',
    fix: 'Views name intents and never attach closures: `<button data-intent=${i.Save}>`, with a parser for `Save` in `intent` (`Save: true` for a message with no fields). Another event than the default: `data-intent-on="keydown"`.',
    find: all(/\s(?:@[\w-]+|on[a-z]+)=\$\{/),
  },
  {
    rule: 'property-binding',
    problem: 'A form control is bound with a property binding (`.value=` / `.checked=`).',
    fix: 'Bind the attribute: `value=${s.text}`, `?checked=${s.on}`, `<textarea>${s.text}</textarea>`. Gyral writes it only when the model value changes, so other renders keep the user’s edits.',
    find: all(/\s\.(?:value|checked|selected)=\$\{/),
  },
  {
    rule: 'boolean-attribute',
    problem: 'A boolean attribute is bound without `?` (it renders "false" and stays on).',
    fix: 'Use a boolean binding: `?disabled=${s.busy}`, `?checked=${s.on}`, `?hidden=${!s.open}`.',
    find: all(
      /\s(?:disabled|checked|selected|hidden|required|readonly|open|multiple|inert|novalidate|autofocus)=\$\{/,
    ),
  },
  {
    rule: 'lit-import',
    problem: "Another renderer's package (lit, etc.) is imported.",
    fix: "Gyral has its own view layer: import `html`, `css`, `each`, `nothing` and hooks from '@gyral/core'.",
    find: all(/from\s+['"](?:lit|lit-html|lit-element|@lit\/[\w-]+)['"]/),
  },
  {
    rule: 'store-not-declared',
    code: 'G0050',
    problem: 'A store is read with `ctx.read(…)` but the spec has no `stores` list.',
    fix: 'Add the store to the spec, `stores: [cart]`, so the component subscribes to its changes; then read it with `ctx.read(cart)`.',
    find: (code) => (/\bstores\s*:/.test(code) ? [] : all(/\bctx\.read\s*\(/)(code)),
  },
  {
    rule: 'unstable-subscription-input',
    code: 'G0080',
    problem: 'A subscription input changes on every message (the clock or a random value).',
    fix: 'Keep subscription inputs stable (an id, a URL, a flag from state); the time arrives in the messages (`every` sends `now`).',
    find: inside(['subscriptions'], /\bDate\.now\s*\(|new Date\s*\(\s*\)|Math\.random\s*\(/),
  },
  {
    rule: 'array-state',
    problem: '`init` returns an array literal as the state.',
    fix: 'Wrap it: `init: () => ({ items: [] })`. An array returned from `init` or a reducer means `[state, commands]`.',
    find: all(/\binit\s*:\s*\([^)]*\)\s*=>\s*\[\s*\]/),
  },
  {
    rule: 'native-validation-blocks-custom-errors',
    severity: 'hint',
    problem:
      'The form has native constraints (`required`, `type="email"`) and custom error messages, but no `novalidate`: the browser blocks the submit with its own bubble before your intent runs, so your messages for those fields never show.',
    fix: 'If you want your own messages for every field at once, add `novalidate` to the `<form>`, read the problems in the parser (from `form()` with a schema, or from each control’s `validity`), and mirror them with `invalid(errors)`. scaffold_component kind "form-native" shows the whole pattern.',
    find: (code) =>
      /<form\b/.test(code) &&
      /\brequired\b|type="email"/.test(code) &&
      /IntentRejected|invalid\(/.test(code) &&
      // With form() and a schema, native bubbles for the easy cases are the documented design.
      !/\bform\s*\(/.test(code) &&
      !/novalidate/i.test(code)
        ? all(/<form\b/)(code).slice(0, 1)
        : [],
  },
];

/** Source-level Gyral mistakes in `code`, with where they are. */
export function lintGyral(code: string): Suggestion[] {
  const clean = blankComments(code);
  const found: Suggestion[] = [];
  for (const rule of RULES) {
    for (const offset of [...new Set(rule.find(clean))].slice(0, 3)) {
      found.push({
        line: lineAt(clean, offset),
        rule: rule.rule,
        ...(rule.code === undefined ? {} : { code: rule.code }),
        problem: rule.problem,
        fix: rule.fix,
        ...(rule.severity === undefined ? {} : { severity: rule.severity }),
      });
    }
  }
  return found.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}

/** Formats suggestions for the check_snippet report. */
export function formatSuggestions(suggestions: readonly Suggestion[]): string {
  return suggestions
    .map((s) => {
      const where = s.line === undefined ? '' : `line ${String(s.line)} `;
      const code =
        s.code === undefined
          ? ''
          : s.code.startsWith('G')
            ? ` (Gyral ${s.code}, ${ERRORS}${s.code})`
            : ` (${s.code})`;
      const label = s.severity === 'hint' ? 'Hint' : 'Fix';
      return `- ${where}[${s.rule}]${code} ${s.problem}\n  ${label}: ${s.fix}`;
    })
    .join('\n');
}
