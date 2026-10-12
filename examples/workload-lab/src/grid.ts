import { css, define, focus, html, svg } from '@gyral/core';
import { every } from '@gyral/time';
import { gridCanvas, gridDescription, ownGridInput } from './grid-hooks.js';
import { controls } from './styles.js';

type Direction = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
interface State {
  readonly cell: number;
  readonly direction: Direction | undefined;
  readonly pointer: number | undefined;
  readonly path: readonly number[];
}
type Msg =
  | { readonly _tag: 'Hold'; readonly direction: Direction }
  | { readonly _tag: 'Stop' }
  | { readonly _tag: 'Tick' }
  | { readonly _tag: 'Choose'; readonly cell: number }
  | {
      readonly _tag: 'Trace';
      readonly cell: number;
      readonly pointer: number;
      readonly start: boolean;
    };
const cells = Array.from({ length: 25 }, (_, cell) => cell);
const direction = (key: string | undefined): key is Direction =>
  key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
const cellNumber = (target: Element): number | undefined => {
  const raw = target.getAttribute('data-cell');
  const cell = raw === null ? NaN : Number(raw);
  return Number.isInteger(cell) && cell >= 0 && cell < 25 ? cell : undefined;
};
function next(cell: number, key: Direction): number {
  const x = cell % 5,
    y = Math.floor(cell / 5);
  return key === 'ArrowLeft'
    ? y * 5 + Math.max(0, x - 1)
    : key === 'ArrowRight'
      ? y * 5 + Math.min(4, x + 1)
      : key === 'ArrowUp'
        ? Math.max(0, y - 1) * 5 + x
        : Math.min(4, y + 1) * 5 + x;
}
export const Grid = define<State, Msg>()('gy-workload-grid', {
  init: () => ({ cell: 0, direction: undefined, pointer: undefined, path: [] }),
  intent: {
    Key: ({ event, key }, { state }) => {
      if (!(event instanceof KeyboardEvent) || event.altKey || event.ctrlKey || event.metaKey)
        return undefined;
      const value = key || event.code;
      if (!direction(value)) return undefined;
      event.preventDefault();
      if (event.type === 'keyup') return state.direction === value ? { _tag: 'Stop' } : undefined;
      return event.repeat ? undefined : { _tag: 'Hold', direction: value };
    },
    Choose: ({ target }) => {
      const cell = cellNumber(target);
      return cell === undefined ? undefined : { _tag: 'Choose', cell };
    },
    Trace: ({ event, target }, { state }) => {
      if (
        !(event instanceof PointerEvent) ||
        !event.isPrimary ||
        (event.type === 'pointermove' && state.pointer !== event.pointerId)
      )
        return undefined;
      if (event.type === 'pointerdown' && event.button !== 0) return undefined;
      // Capture keeps target on the container. Hit-test bounded cell rectangles, not event.target.
      const under = Array.from(target.querySelectorAll('[data-cell]')).find((cell) => {
        const rect = cell.getBoundingClientRect();
        return (
          event.clientX >= rect.left &&
          event.clientX < rect.right &&
          event.clientY >= rect.top &&
          event.clientY < rect.bottom
        );
      });
      const cell = under === undefined ? undefined : cellNumber(under);
      return cell === undefined
        ? undefined
        : { _tag: 'Trace', cell, pointer: event.pointerId, start: event.type === 'pointerdown' };
    },
    Stop: true,
  },
  subscriptions: (s) =>
    s.direction === undefined ? [] : [every(120, () => ({ _tag: 'Tick' }), 'grid:held')],
  update: {
    Hold: (s, m) => ({ ...s, direction: m.direction }),
    Stop: (s) => ({ ...s, direction: undefined, pointer: undefined }),
    Tick: (s) => {
      if (s.direction === undefined) return s;
      const cell = next(s.cell, s.direction);
      return [{ ...s, cell }, [focus(`[data-cell="${String(cell)}"]`, { preventScroll: true })]];
    },
    Choose: (s, m) => ({ ...s, cell: m.cell }),
    Trace: (s, m) => [
      {
        ...s,
        cell: m.cell,
        pointer: m.pointer,
        path: m.start ? [m.cell] : s.path.at(-1) === m.cell ? s.path : [...s.path, m.cell],
      },
      [focus(`[data-cell="${String(m.cell)}"]`, { preventScroll: true })],
    ],
  },
  view: (s, i) => html`
    <p id="grid-instructions">
      Click a numbered cell, hold arrow keys, or drag across cells. Tab leaves the grid. Each cell
      is a native button.
    </p>
    <div
      role="group"
      aria-label="Cell selection"
      ${gridDescription()}
      ${ownGridInput()}
      data-intent-pointerdown=${i.Trace}
      data-intent-pointermove=${i.Trace}
      data-intent-pointerup=${i.Stop}
      data-intent-pointercancel=${i.Stop}
      data-intent-lostpointercapture=${i.Stop}
      data-intent-grid-stop=${i.Stop}
    >
      <div class="cells">
        ${cells.map(
          (cell) =>
            html`<button
              type="button"
              data-cell=${cell}
              tabindex=${cell === s.cell ? 0 : -1}
              aria-pressed=${cell === s.cell}
              aria-label=${`Row ${String(Math.floor(cell / 5) + 1)}, column ${String((cell % 5) + 1)}`}
              data-intent=${i.Choose}
              data-intent-keydown=${i.Key}
              data-intent-keyup=${i.Key}
            >
              ${cell + 1}
            </button>`,
        )}
      </div>
    </div>
    <output aria-live="polite"
      >Selected cell ${s.cell + 1}; drag path:
      ${s.path.map((cell) => cell + 1).join(', ') || 'none'}</output
    >
    <svg viewBox="0 0 220 40" aria-hidden="true" focusable="false">
      ${svg`<circle cx=${20 + (s.cell % 5) * 40} cy="20" r="8" fill="currentColor"></circle>`}
    </svg>
    <canvas width="220" height="90" aria-hidden="true" ${gridCanvas(s.cell)}
      >The selected cell is also reported as text above.</canvas
    >
  `,
  styles: [
    controls,
    css`
      @layer component {
        .cells {
          display: grid;
          grid-template-columns: repeat(5, minmax(44px, 1fr));
          gap: 0.25rem;
          max-inline-size: 20rem;
          touch-action: none;
        }
        [aria-pressed='true'] {
          border-width: 3px;
          font-weight: 700;
        }
        svg,
        canvas {
          display: block;
          max-inline-size: 100%;
          inline-size: 220px;
        }
        @supports (user-select: none) {
          .cells {
            user-select: none;
          }
        }
      }
    `,
  ],
});

export const GridHelp = define<
  { readonly acknowledged: boolean },
  { readonly _tag: 'Acknowledge' }
>()('gy-grid-help', {
  init: () => ({ acknowledged: false }),
  intent: { Acknowledge: true },
  update: { Acknowledge: () => ({ acknowledged: true }) },
  view: (s, i) =>
    html`<button type="button" data-intent=${i.Acknowledge}>Got it</button
      ><output>${s.acknowledged ? 'Help acknowledged' : 'Help available'}</output>`,
  styles: controls,
});
