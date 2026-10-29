// A host renders only when what its view reads changed (gyral-337.1, view/04 "Marking"): its
// state, a declared prop or the value of a declared store. Development re-runs a skipped view and
// warns once when it differs (G0017), which a view reading anything else does. View-call counts
// are in render-skip.prod.test.ts: development's re-check runs skipped views on purpose.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, html, settled } from '../src/index.js';
import { collectErrors } from './collect-errors.js';
import { Counter, text } from './render-skip-fixture.js';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function mounted(): Promise<InstanceType<typeof Counter>> {
  const el = new Counter();
  document.body.append(el);
  await settled();
  return el;
}

describe('renders', () => {
  it('what its state, props and stores change', async () => {
    const el = await mounted();
    el.send({ _tag: 'Next' });
    el.label = 'a';
    el.send({ _tag: 'Raise' });
    await settled();
    expect(text(el)).toBe('a:1:1');
  });

  it('the view again after an error view, even back to the last state that rendered', async () => {
    const errors = collectErrors();
    try {
      const el = await mounted();
      el.send({ _tag: 'Break' });
      await settled();
      expect(text(el)).toBe('error');
      el.send({ _tag: 'Mend' }); // the values that last rendered
      await settled();
      expect(text(el)).toMatch(/^:0:\d+$/);
      expect(errors.text()).toContain('view failed');
    } finally {
      errors.stop();
    }
  });
});

describe('development', () => {
  it('warns once when a skipped view renders something else (G0017)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const clock = { now: 0 };
    const Clock = define<{ readonly ticks: number }, { readonly _tag: 'Tick' }>()(
      'test-skip-clock',
      {
        init: () => ({ ticks: 0 }),
        update: { Tick: (s) => s },
        view: () => html`<p>${String(clock.now)}</p>`, // reads outside state on purpose
      },
    );
    const el = new Clock();
    document.body.append(el);
    await settled();
    clock.now = 1;
    el.send({ _tag: 'Tick' });
    await settled();
    el.send({ _tag: 'Tick' });
    await settled();
    expect(el.shadowRoot?.textContent).toBe('0'); // skipped: nothing re-rendered
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      '<test-skip-clock> rendered differently with the same state, props and stores',
    );
  });

  it('says nothing about a pure view', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = await mounted();
    el.send({ _tag: 'Same' });
    el.send({ _tag: 'Hold' });
    await settled();
    expect(warn).not.toHaveBeenCalled();
  });
});
