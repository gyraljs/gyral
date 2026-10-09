// The global scheduler (docs/design-docs/view/04-scheduler.md): marking, the flush (parents
// first, one render per host), the post-render queue, errors and the loop guard.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, each, focus, html, prop, settled, type Hydrated } from '../src/index.js';

const log: string[] = [];

type Msg = { readonly _tag: 'Bump' };

define<{ readonly n: number }, Msg, { readonly label: string }>()('test-sch-leaf', {
  props: { label: prop.string({ attribute: false, default: '' }) },
  init: () => ({ n: 0 }),
  intent: {},
  update: { Bump: (s) => ({ n: s.n + 1 }) },
  view: (s, _i, { props }) => {
    log.push(`leaf:${props.label}:${String(s.n)}`);
    return html`<i>${props.label}${s.n}</i>`;
  },
});

const Root = define<{ readonly n: number }, Msg>()('test-sch-root', {
  init: () => ({ n: 0 }),
  intent: {},
  update: { Bump: (s) => ({ n: s.n + 1 }) },
  view: (s) => {
    log.push(`root:${String(s.n)}`);
    return html`<test-sch-leaf .label=${`r${String(s.n)}`}></test-sch-leaf>`;
  },
});

type LeafEl = HTMLElement & { send(msg: Msg): void };

async function mountRoot() {
  const root = new Root();
  document.body.append(root);
  await settled();
  const leaf = root.shadowRoot?.querySelector('test-sch-leaf') as LeafEl;
  log.length = 0;
  return { root, leaf };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  log.length = 0;
});

describe('the flush', () => {
  it('runs reducers at once and renders once per host, parents first', async () => {
    const { root, leaf } = await mountRoot();
    leaf.send({ _tag: 'Bump' }); // marked first, but deeper
    root.send({ _tag: 'Bump' });
    root.send({ _tag: 'Bump' }); // already dirty: nothing more
    expect(root.state.n).toBe(2); // state is current before the render
    expect(log).toEqual([]);
    await settled();
    // The parent's new prop reaches the child in the same flush: one render, final props.
    expect(log).toEqual(['root:2', 'leaf:r2:1']);
  });

  it('isolates a host whose view throws: logged with its tag, previous DOM kept', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let fail = false;
    const Fragile = define<{ readonly n: number }, Msg>()('test-sch-fragile', {
      init: () => ({ n: 0 }),
      intent: {},
      update: { Bump: (s) => ({ n: s.n + 1 }) },
      view: (s) => {
        if (fail) throw new Error('boom');
        return html`<b>${s.n}</b>`;
      },
    });
    const bad = new Fragile();
    const { root } = await mountRoot();
    document.body.append(bad);
    await settled();
    fail = true;
    bad.send({ _tag: 'Bump' });
    root.send({ _tag: 'Bump' });
    await settled();
    expect(String(error.mock.calls[0]?.[0])).toContain('<test-sch-fragile> failed to render');
    expect(bad.shadowRoot?.querySelector('b')?.textContent).toBe('0');
    expect(log).toContain('root:1');
  });

  it('runs post-render work in order: focus, states, Hydrated, deferred init commands', async () => {
    const order: string[] = [];
    type M = { readonly _tag: 'Go' } | { readonly _tag: 'Hi' };
    const Ordered = define<{ readonly on: boolean }, M>()('test-sch-order', {
      init: () => [{ on: false }, [focus('button')]],
      intent: {},
      update: {
        Go: (s) => s,
        Hi: (s) => s,
        Hydrated: (s, m: Hydrated) => {
          order.push(`hydrated:${String(m.serverRendered)}`);
          return s;
        },
      },
      states: (s) => {
        order.push('states');
        return { on: s.on };
      },
      view: () => html`<button>b</button>`,
    });
    const el = new Ordered();
    const button = () => el.shadowRoot?.querySelector('button');
    el.addEventListener('focusin', () => order.push('focus'));
    document.body.append(el);
    await settled();
    expect(order).toEqual(['focus', 'states', 'hydrated:false', 'states']);
    expect(el.shadowRoot?.activeElement).toBe(button());
  });

  it('shares the each() dev-check budget between all hosts of one flush', async () => {
    let rows = 0;
    const Row = (n: number) => {
      // eslint-disable-next-line gyral/each-row-purity -- counts row renders on purpose
      rows += 1;
      return html`<li>${n}</li>`;
    };
    const items = Array.from({ length: 150 }, (_, k) => k);
    const Lists = define<{ readonly t: number }, Msg>()('test-sch-lists', {
      init: () => ({ t: 0 }),
      intent: {},
      update: { Bump: (s) => ({ t: s.t + 1 }) },
      view: (s) =>
        html`<ul data-t=${s.t}>
          ${each(items, (n) => n, Row)}
        </ul>`,
    });
    const a = new Lists();
    const b = new Lists();
    document.body.append(a, b);
    await settled();
    rows = 0;
    a.send({ _tag: 'Bump' });
    b.send({ _tag: 'Bump' });
    await settled();
    expect(rows).toBe(200); // 300 skipped rows, 200 re-checked in this flush
  });
});

describe('the loop guard', () => {
  it('throws from settled() in development when hosts keep re-rendering each other', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    type P = { readonly _tag: 'Ping' };
    // Post-render work that sends a message to its own host on every render is a cycle.
    const Loop = define<{ readonly n: number }, P>()('test-sch-loop2', {
      init: () => ({ n: 0 }),
      intent: {},
      update: { Ping: (s) => ({ n: s.n + 1 }) },
      view: (s) => html`<p>${s.n}</p>`,
      states: (s) => {
        loopEl.send({ _tag: 'Ping' });
        return { odd: s.n % 2 === 1 };
      },
    });
    const loopEl = new Loop();
    document.body.append(loopEl);
    await expect(settled()).rejects.toThrow(/did not settle in one flush.*<test-sch-loop2>/);
    await expect(settled()).resolves.toBeUndefined(); // the remaining work was dropped
  });
});
