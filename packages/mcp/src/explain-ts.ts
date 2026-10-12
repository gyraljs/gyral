// check_snippet: TypeScript errors explained in Gyral's terms, each with a concrete fix.
import type { Suggestion } from './diagnose.js';

/** A row naming intents needs a return type (TS7022/7023/7024 otherwise). */
const ROW_TYPE: Omit<Suggestion, 'line' | 'code'> = {
  rule: 'row-return-type',
  problem:
    '`intentsOf<typeof C>()` and a function that uses it (a list row, a helper view) infer each other in a circle.',
  fix: "Give the row an explicit return type: `const row = (t: Todo): TemplateResult => html`…`` (`import { type TemplateResult } from '@gyral/core'`). The component’s own view uses its `i` parameter instead.",
};

/** One TypeScript diagnostic, as check.ts reads it. */
export interface TsDiagnostic {
  readonly code: number;
  readonly message: string;
  readonly line?: number;
}

const MOVED: Readonly<Record<string, string>> = {
  periodic: "`every(ms, (now) => msg, key?)` from '@gyral/time', in `subscriptions`",
  repeat: "`each(items, key, row, pick?)` from '@gyral/core'",
  emit: "`outputs<Out>()` from '@gyral/core'",
  back: "`command(router, { _tag: 'Traverse', delta: -1 })`",
  forward: "`command(router, { _tag: 'Traverse', delta: 1 })`",
  page: "`renderPage()` from '@gyral/ssr'",
  renderToStream: "`renderPage()` from '@gyral/ssr' (its body is the stream)",
  defineDisposableHook: '`defineHook({ client, dispose })`',
  animationFrames: "`command(time, { _tag: 'Frames' }, …)`",
};

/** A Gyral explanation and fix for a TypeScript error, when it is a known pattern. */
export function explainTs(d: TsDiagnostic): Omit<Suggestion, 'line'> | undefined {
  const m = d.message;
  const ts = `TS${String(d.code)}`;
  if (d.code === 2554 && /Expected 0 arguments/.test(m))
    return {
      rule: 'single-call-define',
      code: ts,
      problem: 'A call that takes no arguments got some; for `define` this is the one-call form.',
      fix: "`define<State, Msg>()('my-tag', { … })`: types first, then tag and spec (two calls).",
    };
  if ([7022, 7023, 7024].includes(d.code)) return { ...ROW_TYPE, code: ts };
  if (/TrueOnlyForFieldlessMessage|true only sends a message with no fields/.test(m))
    return {
      rule: 'true-intent-with-fields',
      code: ts,
      problem: '`true` in `intent` only works for a message with no fields besides `_tag`.',
      fix: "Write a parser: `Rename: ({ value }) => ({ _tag: 'Rename', name: value ?? '' })`.",
    };
  if (/IntentNames/.test(m) && /does not exist/.test(m))
    return {
      rule: 'unknown-intent-name',
      code: ts,
      problem: 'The view names an intent that `intent` doesn’t define (the runtime reports G0011).',
      fix: 'Add a parser with that key to `intent` (or fix the spelling). Intent names are the keys of `intent`.',
    };
  if (/IntentParser/.test(m) && /not assignable/.test(m))
    return {
      rule: 'parser-type',
      code: ts,
      problem: 'An intent parser returns the wrong message type.',
      fix: "A key that is a message tag must return that variant: leave the parser unannotated in the spec, or annotate with `Variant<Msg, 'X'>` (or `Extract<Msg, { _tag: 'X' }>`); outside the spec write `'X' as const`.",
    };
  if (/Property '(\w+)' is missing in type/.test(m) && /Update|update|Reducer/.test(m))
    return {
      rule: 'missing-reducer',
      code: ts,
      problem: '`update` lacks a reducer for a message tag (the runtime reports G0010).',
      fix: 'Add the reducer, even `X: (s) => s`. `update` needs one entry per tag of `Msg`.',
    };
  if ((d.code === 2741 || d.code === 2739) && /update/.test(m))
    return {
      rule: 'missing-reducer',
      code: ts,
      problem: '`update` lacks reducers for some message tags (the runtime reports G0010).',
      fix: 'Add one reducer per tag of `Msg`, even `X: (s) => s`.',
    };
  if (/Prop</.test(m) && /not assignable/.test(m))
    return {
      rule: 'prop-builder-optional',
      code: ts,
      problem:
        'A prop builder can produce `undefined`, but the props type says the prop is always set.',
      fix: "`prop.string({ required: true })` or `prop.string({ default: '' })`, or allow `undefined` in the props type.",
    };
  const module = /Cannot find module '([^']+)'/.exec(m);
  if (module?.[1] !== undefined && /^(?:@gyral\/|valibot$|zod$|vitest$)/.test(module[1]))
    return {
      rule: 'package-not-installed',
      code: ts,
      problem: `${module[1]} isn't installed in the project.`,
      fix: `Install it (npm i ${module[1].startsWith('vitest') || module[1] === '@gyral/testing' ? '-D ' : ''}${module[1].replace(/^(@[^/]+\/[^/]+|[^/]+).*$/, '$1')}), or write the code without it (scaffold_component emits only installed imports).`,
    };
  const member = /has no exported member (?:named )?'(\w+)'/.exec(m);
  if (member?.[1] !== undefined && /@gyral\//.test(m)) {
    const name = member[1];
    const moved = MOVED[name];
    return {
      rule: 'unknown-export',
      code: ts,
      problem: `\`${name}\` is not exported there.`,
      fix:
        moved === undefined
          ? `Look it up with get_api "${name}" (it suggests the nearest export names and the right entry point).`
          : `Replaced by ${moved}.`,
    };
  }
  if (d.code === 2769 && /define/.test(m))
    return {
      rule: 'define-overload',
      code: ts,
      problem: 'No `define` overload matches.',
      fix: "Use the two-call form `define<State, Msg>()('my-tag', spec)` and check each spec field's type (get_api ComponentSpec).",
    };
  return undefined;
}
