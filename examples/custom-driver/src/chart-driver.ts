// A custom driver (ADR 0006): a plain object that owns an imperative resource, here a
// <canvas> outside any component, and talks to components only through commands.
// It draws a bar chart with the 2D canvas API, so the example needs no charting dependency.
import { command, type Command, type Driver } from '@gyral/core';

export interface ChartData {
  readonly label: string;
  readonly values: readonly number[];
}

export type ChartInput =
  | { readonly _tag: 'Draw'; readonly data: ChartData }
  /** Streams the index of every bar the user clicks, until aborted. */
  | { readonly _tag: 'Clicks' };

export type ChartDriver = Driver<ChartInput, number | undefined>;

export interface ChartOptions {
  /** Driver name used for substitution (`el.drivers`). Default `'chart'`. */
  readonly name?: string;
  /** Where to look the canvas up. Default: `document`, resolved when a command runs. */
  readonly root?: () => ParentNode;
}

const PAD = 24;

/** Horizontal geometry of the bars, shared by drawing and hit-testing. */
export function layout(width: number, count: number): { readonly barWidth: number } {
  return { barWidth: (width - 2 * PAD) / Math.max(count, 1) };
}

/** The bar under canvas x-coordinate `x`, if any. */
export function barAt(x: number, width: number, count: number): number | undefined {
  const index = Math.floor((x - PAD) / layout(width, count).barWidth);
  return x >= PAD && index >= 0 && index < count ? index : undefined;
}

function draw(canvas: HTMLCanvasElement, data: ChartData): void {
  const ctx = canvas.getContext('2d');
  if (ctx === null) return;
  const { width, height } = canvas;
  const style = getComputedStyle(canvas);
  const bar = style.getPropertyValue('--chart-bar').trim() || 'steelblue';
  const ink = style.getPropertyValue('--chart-ink').trim() || style.color;
  const { barWidth } = layout(width, data.values.length);
  const max = Math.max(1, ...data.values);
  const plot = height - 2 * PAD;

  ctx.clearRect(0, 0, width, height);
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = ink;
  ctx.fillText(data.label, PAD, PAD - 8);
  data.values.forEach((value, i) => {
    const h = (value / max) * plot;
    const x = PAD + i * barWidth;
    ctx.fillStyle = bar;
    ctx.fillRect(x + 2, PAD + plot - h, Math.max(barWidth - 4, 1), h);
    ctx.fillStyle = ink;
    ctx.fillText(String(i), x + barWidth / 2 - 3, height - 6);
  });
}

/** Creates a chart driver for the canvas matching `selector`. Nothing runs at import time. */
export function makeChartDriver(selector: string, options: ChartOptions = {}): ChartDriver {
  let last: ChartData = { label: '', values: [] };
  const find = (): HTMLCanvasElement => {
    const el = (options.root?.() ?? document).querySelector(selector);
    if (!(el instanceof HTMLCanvasElement)) throw new Error(`No canvas '${selector}' found`);
    return el;
  };

  return {
    name: options.name ?? 'chart',
    run: (input, { signal, emit }) => {
      const canvas = find();
      if (input._tag === 'Draw') {
        last = input.data;
        draw(canvas, input.data);
        return undefined;
      }
      // Streaming source (DriverContext.emit): one message per clicked bar.
      return new Promise<never>((_resolve, reject) => {
        const onClick = (event: MouseEvent): void => {
          const rect = canvas.getBoundingClientRect();
          const x = (event.clientX - rect.left) * (canvas.width / rect.width);
          const index = barAt(x, canvas.width, last.values.length);
          if (index !== undefined) emit(index);
        };
        const stop = (): void => {
          canvas.removeEventListener('click', onClick);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        if (signal.aborted) {
          stop();
          return;
        }
        canvas.addEventListener('click', onClick);
        signal.addEventListener('abort', stop, { once: true });
      });
    },
  };
}

/** The page's chart: `<canvas id="clicks-chart">`. */
export const chart: ChartDriver = makeChartDriver('#clicks-chart');

/** Redraws the chart. Only the latest drawing matters, so the lane switches. */
export function drawChart(data: ChartData): Command<never> {
  return command<ChartInput, number | undefined, unknown, never>(
    chart,
    { _tag: 'Draw', data },
    { onSuccess: () => undefined, key: 'chart:draw', concurrency: 'switch' },
  );
}

/** Streams clicked bar indexes as messages until the component disconnects. */
export function chartClicks<M>(toMsg: (bar: number) => M | undefined): Command<M> {
  return command<ChartInput, number | undefined, unknown, M>(
    chart,
    { _tag: 'Clicks' },
    {
      onSuccess: (bar) => (bar === undefined ? undefined : toMsg(bar)),
      key: 'chart:clicks',
      concurrency: 'switch',
    },
  );
}
