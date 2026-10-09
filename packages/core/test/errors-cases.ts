// ADR 0024 regression cases, part 1: init, reducers and intent parsers. Run by errors.test.ts
// (development build) and errors.prod.test.ts (production build).
import { describe, expect, it } from 'vitest';
import {
  boom,
  click,
  mount,
  shadow,
  turn,
  type El,
  type Msg,
  type Tracking,
} from './errors-setup.js';
import {
  command,
  define,
  defineDriver,
  html,
  prop,
  settled,
  GyralError,
  type Errored,
} from '../src/index.js';
import { DEV } from '../src/view/index.js';

export function errorCases(t: Tracking): void {
  describe('init', () => {
    it('is t.reported, renders the error view with no state, and never escapes connectedCallback', async () => {
      const seen: unknown[] = [];
      define<number, Msg>()('err-init', {
        intent: {},
        init: boom,
        update: { Go: (s) => s, Got: (s) => s, Reset: (s) => s },
        view: (s) => html`<p>${s}</p>`,
        error: (failure, state) => {
          seen.push(state);
          return html`<p role="alert">${failure.phase}</p>`;
        },
      });
      const el = await mount<number, Msg>('err-init');
      expect(t.reported.errors).toHaveLength(1);
      expect(t.reported.errors[0]).toBeInstanceOf(GyralError);
      expect(t.reported.errors[0]?.phase).toBe('init');
      expect(t.reported.errors[0]?.component).toBe('err-init');
      expect(String(t.reported.errors[0]?.cause)).toMatch(/boom/);
      expect(shadow(el)).toBe('<p role="alert">init</p>');
      expect(seen).toEqual([undefined]);
      el.send({ _tag: 'Go' }); // no state: ignored, not a second report
      await settled();
      expect(t.reported.errors).toHaveLength(1);
    });

    it('without an error view leaves the host empty', async () => {
      define<number, Msg>()('err-init-plain', {
        intent: {},
        init: boom,
        update: { Go: (s) => s, Got: (s) => s, Reset: (s) => s },
        view: (s) => html`<p>${s}</p>`,
      });
      const el = await mount<number, Msg>('err-init-plain');
      expect(shadow(el)).toBe('');
      expect(t.reported.errors[0]?.phase).toBe('init');
    });
  });

  describe('reducers', () => {
    it('a throwing reducer changes nothing and sends Errored (intent, command result, send())', async () => {
      const errored: Errored[] = [];
      const ok = defineDriver<undefined, number>({ name: 'err-ok', run: () => 5 });
      define<number, Msg>()('err-update', {
        init: () => 1,
        intent: { Go: () => ({ _tag: 'Go' }) },
        update: {
          Go: boom,
          Got: boom,
          Reset: () => [
            7,
            [command(ok, undefined, { onSuccess: (v): Msg => ({ _tag: 'Got', v }) })],
          ],
          Errored: (s, m) => {
            errored.push(m);
            return s;
          },
        },
        view: (s, i) => html`<button data-intent=${i.Go}>${s}</button>`,
      });
      const el = await mount<number, Msg>('err-update');
      click(el); // for an intent
      el.send({ _tag: 'Go' }); // programmatic: t.reported, never thrown to the caller
      el.send({ _tag: 'Reset' }); // succeeds; its command's result then fails in Got
      await settled();
      await turn();
      await settled();
      expect(el.state).toBe(7);
      expect(t.reported.errors.map((e) => [e.phase, e.msg])).toEqual([
        ['update', 'Go'],
        ['update', 'Go'],
        ['update', 'Got'],
      ]);
      expect(errored.map((m) => [m.phase, m.error.msg])).toEqual([
        ['update', 'Go'],
        ['update', 'Go'],
        ['update', 'Got'],
      ]);
      if (DEV) expect(t.reported.errors[0]?.message).toMatch(/update for "Go" failed/);
      else expect(t.reported.errors[0]?.message).toMatch(/^Gyral G0073 err-update Go /);
    });

    it('a throwing Errored reducer is t.reported once, never sent again', async () => {
      let calls = 0;
      define<number, Msg>()('err-errored', {
        intent: {},
        init: () => 1,
        update: {
          Go: boom,
          Got: (s) => s,
          Reset: (s) => s,
          Errored: () => {
            calls += 1;
            return boom();
          },
        },
        view: (s) => html`<p>${s}</p>`,
      });
      const el = await mount<number, Msg>('err-errored');
      el.send({ _tag: 'Go' });
      await settled();
      expect(calls).toBe(1);
      expect(t.reported.errors.map((e) => e.msg)).toEqual(['Go', 'Errored']);
    });

    it('a PropsChanged reducer that throws gets PropsChanged again on the next render', async () => {
      let fails = 1;
      const seen: number[] = [];
      define<number, Msg, { readonly n: number }>()('err-props', {
        intent: {},
        props: { n: prop.number({ default: 0 }) },
        init: () => 0,
        update: {
          Go: (s) => s + 1,
          Got: (s) => s,
          Reset: (s) => s,
          PropsChanged: (s, m) => {
            if (fails-- > 0) return boom();
            seen.push(m.props.n);
            return s;
          },
        },
        view: (s) => html`<p>${s}</p>`,
      });
      const el = (await mount<number, Msg>('err-props')) as El<number, Msg> & { n: number };
      el.n = 3;
      await settled();
      expect(t.reported.errors.map((e) => [e.phase, e.msg])).toEqual([['update', 'PropsChanged']]);
      el.send({ _tag: 'Go' }); // the next render
      await settled();
      expect(seen).toEqual([3]);
    });
  });

  describe('intent parsers', () => {
    it('sync throws, async rejects, async then a throwing reducer: each t.reported, nothing unhandled', async () => {
      define<number, Msg>()('err-parse', {
        init: () => 1,
        intent: {
          Go: boom,
          Got: () => Promise.reject(new Error('async boom')),
          Reset: () => Promise.resolve({ _tag: 'Reset' } as const),
        },
        update: { Go: (s) => s, Got: (s) => s, Reset: boom },
        view: (s, i) =>
          html`<button id="a" data-intent=${i.Go}>${s}</button
            ><button id="b" data-intent=${i.Got}>b</button
            ><button id="c" data-intent=${i.Reset}>c</button>`,
      });
      const el = await mount<number, Msg>('err-parse');
      click(el, '#a');
      click(el, '#b');
      click(el, '#c');
      await turn();
      await settled();
      expect(t.reported.errors.map((e) => [e.phase, e.msg])).toEqual([
        ['parse', 'Go'],
        ['parse', 'Got'],
        ['update', 'Reset'],
      ]);
      expect(el.state).toBe(1);
    });
  });
}
