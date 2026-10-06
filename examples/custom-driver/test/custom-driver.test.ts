import { afterEach, describe, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { fakeDriver, inputsFor, run, virtualTime, type VirtualTime } from '@gyral/testing';
import { barAt, chart, layout, makeChartDriver, type ChartInput } from '../src/chart-driver.js';
import { Clicks } from '../src/clicks.js';

let clock: VirtualTime | undefined;

afterEach(() => {
  document.body.replaceChildren();
  clock?.restore();
  clock = undefined;
});

const draws = (inputs: readonly ChartInput[]) =>
  inputs.flatMap((input) => (input._tag === 'Draw' ? [input.data.values] : []));

describe('model', () => {
  it('starts a bar on the first click of a second and grows it after', () => {
    const { state, commands } = run(Clicks.spec, [
      { _tag: 'Click' },
      { _tag: 'Click' },
      { _tag: 'Tick' },
      { _tag: 'Tick' }, // a second with no clicks adds no bar
      { _tag: 'Click' },
    ]);
    expect(state.history).toEqual([2, 1]);
    expect(draws(inputsFor(commands, chart))).toEqual([[1], [2], [2, 1]]);
  });

  it('init starts the timer and the chart-click stream', () => {
    const { commands } = run(Clicks.spec, []);
    expect(commands.map((c) => c.driver.name)).toEqual(['time', 'chart']);
  });
});

describe('component with a fake chart driver', () => {
  it('draws per-second history on the chart and inspects clicked bars', async () => {
    clock = virtualTime();
    const fake = fakeDriver(chart);
    const el = document.createElement('gy-clicks');
    el.drivers = { chart: fake };
    document.body.append(el);
    await settled();
    const button = el.shadowRoot?.querySelector('button');
    if (button == null) throw new Error('missing button');
    button.click();
    button.click();
    await clock.advance(1000);
    button.click();
    await settled();
    expect(draws(fake.inputs)).toEqual([[1], [2], [2, 1]]);

    // Push a chart click through the running stream, as the real driver would emit it.
    const stream = fake.calls.find((c) => c.input._tag === 'Clicks');
    expect(stream?.signal.aborted).toBe(false);
    stream?.emit(0);
    await settled();
    expect(el.shadowRoot?.textContent).toContain('Bar 0:');
    expect(el.shadowRoot?.querySelectorAll('output')[1]?.textContent).toBe('2');

    el.remove();
    await clock.advance(0); // interruption on disconnect completes asynchronously
    expect(stream?.signal.aborted).toBe(true);
  });
});

describe('the real chart driver', () => {
  const noEmit = (): void => undefined;

  it('maps canvas x-coordinates to bars', () => {
    const { barWidth } = layout(300, 3);
    expect(barAt(24 + barWidth * 1.5, 300, 3)).toBe(1);
    expect(barAt(10, 300, 3)).toBeUndefined();
    expect(barAt(299, 300, 3)).toBeUndefined();
  });

  it('draws, then streams clicked bars until aborted', async () => {
    const canvas = document.createElement('canvas');
    canvas.id = 'test-chart';
    canvas.width = 300;
    canvas.height = 150;
    document.body.append(canvas);
    const driver = makeChartDriver('#test-chart');
    const controller = new AbortController();
    await driver.run(
      { _tag: 'Draw', data: { label: 'x', values: [1, 4, 2] } },
      { signal: controller.signal, emit: noEmit },
    );

    const bars: (number | undefined)[] = [];
    const stream = driver.run(
      { _tag: 'Clicks' },
      { signal: controller.signal, emit: (bar) => bars.push(bar) },
    );
    const rect = canvas.getBoundingClientRect();
    const { barWidth } = layout(300, 3);
    const clickAt = (x: number) => {
      canvas.dispatchEvent(new MouseEvent('click', { clientX: rect.left + x, bubbles: true }));
    };
    clickAt(24 + barWidth * 1.5);
    clickAt(5);
    clickAt(24 + barWidth * 2.5);
    expect(bars).toEqual([1, 2]);

    controller.abort();
    await expect(stream).rejects.toThrow('Aborted');
    clickAt(24 + barWidth * 0.5);
    expect(bars).toEqual([1, 2]);
  });

  it('fails clearly when the canvas is missing', () => {
    const driver = makeChartDriver('#nope');
    const signal = new AbortController().signal;
    expect(() =>
      driver.run({ _tag: 'Draw', data: { label: '', values: [] } }, { signal, emit: noEmit }),
    ).toThrow("No canvas '#nope' found");
  });
});
