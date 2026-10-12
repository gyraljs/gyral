import { afterEach, expect, it, vi } from 'vitest';
import { define, html, settled, type Stateless } from '@gyral/core';
import { mount, parse, virtualTime } from '@gyral/testing';
import { Grid } from '../src/grid.js';
import { gridDescription } from '../src/grid-hooks.js';

afterEach(() => {
  document.querySelectorAll('gy-workload-grid, test-grid-description').forEach((el) => {
    el.remove();
  });
  vi.restoreAllMocks();
});
it('holds directions, ignores keyboard repeats, and stops on release, blur and focus loss', async () => {
  const time = virtualTime();
  try {
    const mounted = await mount(Grid);
    const button = mounted.$('[data-cell="0"]');
    if (!(button instanceof HTMLButtonElement)) throw new Error('Expected cell');
    const send = (type: string, key = 'ArrowRight'): void => {
      button.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, composed: true }));
    };
    button.focus();
    send('keydown');
    await settled();
    expect(mounted.$('[data-cell="1"]')?.getAttribute('aria-pressed')).toBe('true');
    await time.advance(120);
    await settled();
    expect(mounted.$('[data-cell="2"]')?.getAttribute('aria-pressed')).toBe('true');
    const repeat = parse(Grid, 'Key', {
      key: 'ArrowRight',
      event: new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true }),
    });
    expect(repeat).toBeUndefined();
    send('keyup');
    await settled();
    await time.advance(1000);
    await settled();
    expect(mounted.$('[data-cell="2"]')?.getAttribute('aria-pressed')).toBe('true');
    send('keydown', 'ArrowDown');
    await settled();
    window.dispatchEvent(new Event('blur'));
    await settled();
    const stopped = mounted.$('output')?.textContent;
    await time.advance(1000);
    await settled();
    expect(mounted.$('output')?.textContent).toBe(stopped);
    send('keydown', 'ArrowDown');
    await settled();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    await settled();
    const lost = mounted.$('output')?.textContent;
    await time.advance(1000);
    await settled();
    expect(mounted.$('output')?.textContent).toBe(lost);
    button.focus();
    send('keydown', 'ArrowDown');
    await settled();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await settled();
    const hidden = mounted.$('output')?.textContent;
    await time.advance(1000);
    await settled();
    expect(mounted.$('output')?.textContent).toBe(hidden);
    outside.remove();
    mounted.dispose();
  } finally {
    time.restore();
  }
});

it('owns canvas observers and provides a scoped description fallback', async () => {
  const disconnect = vi.spyOn(ResizeObserver.prototype, 'disconnect');
  const mounted = await mount(Grid);
  const canvas = mounted.$('canvas');
  await vi.waitFor(() => {
    expect(canvas?.getAttribute('data-ready')).toBe('true');
  });
  mounted.dispose();
  await settled();
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(canvas?.getAttribute('data-ready')).toBe('false');
  const Description = define<Stateless>()('test-grid-description', {
    view: () =>
      html`<p id="grid-instructions">Scoped instructions</p>
        <button ${gridDescription(true)}>Cell</button>`,
  });
  const fallback = await mount(Description);
  expect(fallback.$('button')?.getAttribute('aria-describedby')).toBe('grid-instructions');
  expect(fallback.$('#grid-instructions')?.textContent).toBe('Scoped instructions');
  fallback.dispose();
});
