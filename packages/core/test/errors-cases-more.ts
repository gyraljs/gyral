// ADR 0024 regression cases, part 2: views, hooks, commands, stores, parent boundaries and
// devtools. Run by errors.test.ts (development build) and errors.prod.test.ts (production build).
import { describe, expect, it } from 'vitest';
import { boom, mount, shadow, turn, type Msg, type Tracking } from './errors-setup.js';
import {
  command,
  define,
  defineDriver,
  defineHook,
  defineStore,
  html,
  send,
  settled,
  DEVTOOLS_GLOBAL,
  GyralError,
  type DevEvent,
} from '../src/index.js';
import { DEV } from '../src/view/index.js';

export function moreErrorCases(t: Tracking): void {
  describe('views', () => {
    it('a later render that throws renders the error view with the current state', async () => {
      define<number, Msg>()('err-view', {
        intent: {},
        init: () => 1,
        update: { Go: (s) => s + 1, Got: (s) => s, Reset: () => 1 },
        view: (s) => (s === 2 ? boom() : html`<p>${s}</p>`),
        error: (failure, state) => html`<p role="alert">${failure.phase} at ${String(state)}</p>`,
      });
      const el = await mount<number, Msg>('err-view');
      el.send({ _tag: 'Go' });
      await settled();
      expect(shadow(el)).toBe('<p role="alert">view at 2</p>');
      el.send({ _tag: 'Reset' }); // recovers: the view renders again
      await settled();
      expect(shadow(el)).toBe('<p>1</p>');
      expect(t.reported.errors.map((e) => [e.phase, e.component])).toEqual([['view', 'err-view']]);
    });

    it('without an error view keeps the previous DOM; a throwing error view changes nothing', async () => {
      define<number, Msg>()('err-view-plain', {
        intent: {},
        init: () => 1,
        update: { Go: (s) => s + 1, Got: (s) => s, Reset: (s) => s },
        view: (s) => (s === 2 ? boom() : html`<p>${s}</p>`),
      });
      define<number, Msg>()('err-view-twice', {
        intent: {},
        init: () => 1,
        update: { Go: (s) => s + 1, Got: (s) => s, Reset: (s) => s },
        view: (s) => (s === 2 ? boom() : html`<p>${s}</p>`),
        error: boom,
      });
      const plain = await mount<number, Msg>('err-view-plain');
      const twice = await mount<number, Msg>('err-view-twice');
      plain.send({ _tag: 'Go' });
      twice.send({ _tag: 'Go' });
      await settled();
      expect(shadow(plain)).toBe('<p>1</p>');
      expect(shadow(twice)).toBe('<p>1</p>');
      expect(t.reported.errors.map((e) => e.component)).toEqual([
        'err-view-plain',
        'err-view-twice',
        'err-view-twice',
      ]);
    });
  });

  describe('element hooks', () => {
    it('a hook that throws is t.reported and the other hooks still run', async () => {
      const ran: string[] = [];
      const bad = defineHook<[]>({ client: boom });
      const good = defineHook<[]>({ client: () => ran.push('good') });
      define<number, Msg>()('err-hook', {
        intent: {},
        init: () => 1,
        update: { Go: (s) => s, Got: (s) => s, Reset: (s) => s },
        view: () =>
          html`<p ${bad()}>a</p>
            <p ${good()}>b</p>`,
      });
      const el = await mount<number, Msg>('err-hook');
      expect(ran).toEqual(['good']);
      expect(shadow(el)).toBe('<p>a</p><p>b</p>');
      expect(t.reported.errors.map((e) => [e.phase, e.component])).toEqual([['hook', 'err-hook']]);
    });
  });

  describe('commands', () => {
    it('a driver failure without onFailure and a throwing mapper are t.reported (phase command)', async () => {
      const failing = defineDriver<undefined, number>({
        name: 'err-failing',
        run: () => Promise.reject(new Error('net')),
      });
      const ok = defineDriver<undefined, number>({ name: 'err-ok2', run: () => 5 });
      define<number, Msg>()('err-command', {
        intent: {},
        init: () => [
          1,
          [
            command(failing, undefined, { onSuccess: (v): Msg => ({ _tag: 'Got', v }) }),
            command(ok, undefined, { onSuccess: boom }),
          ],
        ],
        update: { Go: (s) => s, Got: (s) => s, Reset: (s) => s },
        view: (s) => html`<p>${s}</p>`,
      });
      await mount<number, Msg>('err-command');
      await turn();
      await settled();
      expect(t.reported.errors.map((e) => [e.phase, e.msg]).sort()).toEqual([
        ['command', 'err-failing'],
        ['command', 'err-ok2'],
      ]);
    });
  });

  describe('stores', () => {
    it('a throwing store reducer changes nothing; a failing subscriber keeps no other one stale', async () => {
      type S = { readonly _tag: 'Inc' } | { readonly _tag: 'Bad' };
      const counter = defineStore<number, S>('err-counter', {
        init: () => 0,
        update: { Inc: (n) => n + 1, Bad: boom },
      });
      const reader = (name: string, explode: boolean): string => {
        define<number, Msg>()(name, {
          intent: {},
          init: () => 0,
          stores: [counter],
          update: {
            Go: (s) => [s, [send(counter, { _tag: 'Bad' })]],
            Got: (s) => [s, [send(counter, { _tag: 'Inc' })]],
            Reset: (s) => s,
            StoreChanged: explode ? boom : (s) => s,
          },
          view: (_s, _i, ctx) => html`<p>${ctx.read(counter)}</p>`,
        });
        return name;
      };
      const a = await mount<number, Msg>(reader('err-store-a', true));
      const b = await mount<number, Msg>(reader('err-store-b', false));
      a.send({ _tag: 'Go' }); // the store's reducer throws: t.reported, the sender carries on
      await settled();
      expect(t.reported.errors.map((e) => [e.phase, e.msg])).toEqual([['store', 'Bad']]);
      b.send({ _tag: 'Got', v: 1 }); // a's StoreChanged throws; b still hears the change
      await settled();
      expect(shadow(b)).toBe('<p>1</p>');
      expect(t.reported.errors.map((e) => [e.phase, e.msg])).toEqual([
        ['store', 'Bad'],
        ['update', 'StoreChanged'],
      ]);
    });
  });

  describe('store subscribers', () => {
    it('one subscriber that throws is t.reported; the others are still notified', () => {
      const tally = defineStore<number, { readonly _tag: 'Inc' }>('err-tally', {
        init: () => 0,
        update: { Inc: (n) => n + 1 },
      });
      const instance = tally.instance();
      const seen: number[] = [];
      instance.subscribe(boom);
      instance.subscribe((n) => seen.push(n));
      instance.send({ _tag: 'Inc' });
      expect(seen).toEqual([1]);
      expect(t.reported.errors.map((e) => [e.phase, e.msg])).toEqual([['store', 'Inc']]);
    });
  });

  describe('parent boundaries', () => {
    it('a parent catches a child\'s failure with data-intent-on="error", claims it and re-mounts the child', async () => {
      let failing = true;
      define<number, Msg>()('err-child', {
        intent: {},
        init: () => (failing ? boom() : 1),
        update: { Go: (s) => s, Got: (s) => s, Reset: (s) => s },
        view: (s) => html`<p>child ${s}</p>`,
      });
      interface Parent {
        readonly generation: number;
        readonly failures: readonly string[];
      }
      type PMsg =
        { readonly _tag: 'ChildFailed'; readonly phase: string } | { readonly _tag: 'Retry' };
      define<Parent, PMsg>()('err-parent', {
        init: () => ({ generation: 0, failures: [] }),
        intent: {
          ChildFailed: (input) => {
            input.event.preventDefault(); // claimed: no reportError
            return {
              _tag: 'ChildFailed',
              phase: ((input.event as ErrorEvent).error as GyralError).phase,
            };
          },
        },
        update: {
          ChildFailed: (s, m) => ({ ...s, failures: [...s.failures, m.phase] }),
          Retry: (s) => ({ ...s, generation: s.generation + 1 }),
        },
        // A different template per generation: a retry re-mounts the child, so its init runs again.
        view: (s, i) =>
          s.generation % 2 === 0
            ? html`<div>
                <err-child data-intent=${i.ChildFailed} data-intent-on="error"></err-child>
              </div>`
            : html`<p>
                <err-child data-intent=${i.ChildFailed} data-intent-on="error"></err-child>
              </p>`,
      });
      t.reported.stop(); // this case checks what reaches window itself
      const parent = await mount<Parent, PMsg>('err-parent');
      expect(parent.state.failures).toEqual(['init']);
      expect(t.atWindow.filter((e) => e.error instanceof GyralError)).toEqual([]); // claimed
      failing = false;
      parent.send({ _tag: 'Retry' }); // a new key re-mounts the child: init runs again
      await settled();
      const child = parent.shadowRoot?.querySelector('err-child') as Element;
      expect(shadow(child)).toBe('<p>child 1</p>');
    });

    it('an unclaimed failure reaches window once, from reportError', async () => {
      define<number, Msg>()('err-once', {
        intent: {},
        init: () => 1,
        update: { Go: boom, Got: (s) => s, Reset: (s) => s },
        view: (s) => html`<p>${s}</p>`,
      });
      t.reported.stop();
      const swallow = (event: ErrorEvent): void => {
        if (event.error instanceof GyralError) event.preventDefault();
      };
      window.addEventListener('error', swallow);
      try {
        const el = await mount<number, Msg>('err-once');
        el.send({ _tag: 'Go' });
        await settled();
      } finally {
        window.removeEventListener('error', swallow);
      }
      const ours = t.atWindow.filter((e) => e.error instanceof GyralError);
      expect(ours).toHaveLength(1);
      expect(ours[0]?.target).toBe(window); // the boundary event stopped at the document
    });
  });

  describe.runIf(DEV)('devtools', () => {
    it('shows each failure in the timeline', async () => {
      const events: DevEvent[] = [];
      const g = globalThis as Record<string, unknown>;
      g[DEVTOOLS_GLOBAL] = { emit: (e: DevEvent) => events.push(e) };
      try {
        define<number, Msg>()('err-devtools', {
          intent: {},
          init: () => 1,
          update: { Go: boom, Got: (s) => s, Reset: (s) => s },
          view: (s) => html`<p>${s}</p>`,
        });
        const el = await mount<number, Msg>('err-devtools');
        el.send({ _tag: 'Go' });
        await settled();
      } finally {
        Reflect.deleteProperty(g, DEVTOOLS_GLOBAL);
      }
      const error = events.find((e) => e.kind === 'error');
      expect(error).toMatchObject({ kind: 'error', phase: 'update', msg: 'Go' });
      expect(error?.kind === 'error' ? error.component?.tag : undefined).toBe('err-devtools');
    });
  });
}
