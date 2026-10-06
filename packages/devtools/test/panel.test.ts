import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { define, html, settled } from '@gyral/core';
import { mountDevtools, type MountedDevtools } from '../src/index.js';

type Msg = { readonly _tag: 'Inc' };
const Probe = define<{ readonly n: number }, Msg>('test-devtools-target', {
  init: () => ({ n: 0 }),
  intent: { Inc: () => ({ _tag: 'Inc' }) },
  update: { Inc: (s) => ({ n: s.n + 1 }) },
  view: (s, i) => html`<button data-intent=${i.Inc}>Inc ${s.n}</button>`,
});

let tools: MountedDevtools;
const settle = () => new Promise((r) => setTimeout(r, 0));
const shadow = () => {
  const root = tools.panel.shadowRoot;
  if (root === null) throw new Error('no shadow root');
  return root;
};
const section = () => shadow().querySelector('section');

beforeEach(async () => {
  tools = mountDevtools();
  await settled();
});

afterEach(() => {
  tools.unmount();
  document.body.replaceChildren();
});

async function probe() {
  const el = new Probe();
  document.body.append(el);
  await settled();
  await settle();
  return el;
}

describe('<gyral-devtools> (ADR 0017)', () => {
  it('starts closed and toggles with the button and Alt+Shift+D', async () => {
    expect(section()?.hidden).toBe(true);
    shadow().querySelector<HTMLButtonElement>('.toggle')?.click();
    await settled();
    expect(section()?.hidden).toBe(false);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyD', altKey: true, shiftKey: true }),
    );
    await settled();
    expect(section()?.hidden).toBe(true);
  });

  it('shows messages, live components with state, and never its own events', async () => {
    const el = await probe();
    el.shadowRoot?.querySelector('button')?.click();
    await settled();
    const rows = [...shadow().querySelectorAll('.timeline li')].map((li) => li.textContent);
    expect(rows.some((t) => t.includes('Inc') && t.includes('<test-devtools-target>'))).toBe(true);
    expect(rows.some((t) => t.includes('gyral-devtools'))).toBe(false);
    const pre = shadow().querySelector('.components pre');
    expect(pre?.textContent).toBe('{"n":1}');
  });

  it('filters the timeline', async () => {
    const el = await probe();
    el.shadowRoot?.querySelector('button')?.click();
    await settled();
    const input = shadow().querySelector<HTMLInputElement>('input[type=search]');
    if (input === null) throw new Error('no filter');
    input.value = 'zzz-no-match';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await settled();
    expect(shadow().querySelectorAll('.timeline li')).toHaveLength(0);
  });

  it('lists components that connected before the panel was mounted', async () => {
    tools.unmount();
    await probe(); // connects with no devtools listening
    tools = mountDevtools();
    await new Promise((r) => setTimeout(r, 0));
    await settled();
    const labels = [...tools.panel.state.components].map((c) => c.tag);
    expect(labels).toEqual(['test-devtools-target']);
  });

  it('restores the previous hook on unmount', () => {
    const g = globalThis as Record<string, unknown>;
    expect(g['__GYRAL_DEVTOOLS__']).toBeDefined();
    tools.unmount();
    expect(g['__GYRAL_DEVTOOLS__']).toBeUndefined();
    tools = mountDevtools(); // afterEach unmounts again
  });

  it('has no axe violations when open', async () => {
    await probe();
    tools.panel.send({ _tag: 'Toggle' });
    await settled();
    const result = await axe.run(tools.panel);
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
