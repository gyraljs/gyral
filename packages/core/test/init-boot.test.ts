// When init's commands start (gyral-k97.3, view/05-element.md "Lifecycle"): after the host's
// first render, for client-rendered hosts as for server-rendered ones. A page whose entry
// statically imports its components defines them before the entry's own code runs, so an
// element already in the page connects inside define(); its init commands must not start
// before the entry's provideDrivers() call later in the same task.
import { afterEach, expect, it } from 'vitest';
import {
  command,
  define,
  defineDriver,
  html,
  provideDrivers,
  settled,
  type AnyDriver,
} from '../src/index.js';
import { collectErrors } from './collect-errors.js';

type Msg = { readonly _tag: 'Got'; readonly text: string } | { readonly _tag: 'Fix' };
interface State {
  readonly got: readonly string[];
  readonly ok: boolean;
}
type GyralEl = HTMLElement & { readonly state: State; send(msg: Msg): void };

const got = (s: State, m: { readonly text: string }): State => ({ ...s, got: [...s.got, m.text] });

/** A component whose init asks `driver` for one answer; `ok: false` makes its view throw. */
function bootComponent(tag: string, driver: AnyDriver, ok = true): void {
  define<State, Msg>()(tag, {
    init: () =>
      [
        { got: [], ok },
        [
          command(driver as ReturnType<typeof defineDriver<string, string>>, 'x', {
            onSuccess: (text): Msg => ({ _tag: 'Got', text }),
          }),
        ],
      ] as const,
    update: { Got: got, Fix: (s) => ({ ...s, ok: true }) },
    view: (s) => {
      if (!s.ok) throw new Error('not ready');
      return html`<p>${s.got.join(',')}</p>`;
    },
  });
}

/** Markup already in the page, as a server or the page's HTML leaves it before the entry runs. */
function inPage(tag: string): GyralEl {
  document.body.insertAdjacentHTML('beforeend', `<${tag}></${tag}>`);
  return document.body.lastElementChild as GyralEl;
}

const answers = (calls: string[], label: string): AnyDriver =>
  defineDriver<string, string>({
    name: 'boot',
    run: (s) => {
      calls.push(label);
      return `${label}:${s}`;
    },
  });

let errors = collectErrors();
let removeProvider = (): void => undefined;
afterEach(() => {
  errors.stop();
  errors = collectErrors();
  removeProvider();
  document.body.replaceChildren();
});

it('uses a driver token the page provides in the same task as define()', async () => {
  const el = inPage('test-boot-token');
  bootComponent('test-boot-token', defineDriver<string, string>('boot-token'));
  // The entry's own code, after its static imports defined the component:
  removeProvider = provideDrivers(document.body, { 'boot-token': answers([], 'provided') });
  await settled();
  expect(el.state.got).toEqual(['provided:x']);
  expect(el.shadowRoot?.textContent).toBe('provided:x');
  expect(errors.text()).toBe('');
});

it("uses the page's override, not the driver's own implementation", async () => {
  const calls: string[] = [];
  const el = inPage('test-boot-override');
  bootComponent('test-boot-override', answers(calls, 'default'));
  removeProvider = provideDrivers(document.body, { boot: answers(calls, 'override') });
  await settled();
  expect(calls).toEqual(['override']);
  expect(el.state.got).toEqual(['override:x']);
});

it("renders a synchronous driver's answer by the time the page settles", async () => {
  const el = document.createElement('test-boot-sync') as GyralEl;
  bootComponent('test-boot-sync', answers([], 'sync'));
  document.body.append(el);
  await settled();
  expect(el.shadowRoot?.textContent).toBe('sync:x');
});

it('starts nothing for a host removed before its first render, until it renders', async () => {
  const calls: string[] = [];
  bootComponent('test-boot-moved', answers(calls, 'once'));
  const el = document.createElement('test-boot-moved') as GyralEl;
  document.body.append(el);
  el.remove(); // in the same task: it never rendered
  await settled();
  expect(calls).toEqual([]);
  document.body.append(el);
  await settled();
  expect(calls).toEqual(['once']);
  expect(el.shadowRoot?.textContent).toBe('once:x');
});

it('starts nothing while the first render throws, then starts once a render succeeds', async () => {
  const calls: string[] = [];
  bootComponent('test-boot-throws', answers(calls, 'late'), false);
  const el = document.createElement('test-boot-throws') as GyralEl;
  document.body.append(el);
  await settled();
  expect(calls).toEqual([]);
  expect(errors.text()).toContain('not ready');
  el.send({ _tag: 'Fix' });
  await settled();
  expect(calls).toEqual(['late']);
  expect(el.shadowRoot?.textContent).toBe('late:x');
});
