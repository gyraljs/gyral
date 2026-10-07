import { define, html, nothing, type Next } from '@gyral/core';
import { delay } from '@gyral/time';
import {
  COLORS,
  canRedo,
  canUndo,
  cellName,
  describe,
  emptyHistory,
  isColor,
  pixelsAt,
  record,
  redo,
  seek,
  undo,
  type Color,
  type History,
} from './history.js';
import { styles } from './styles.js';

export type Tool = Color | 'eraser';

export interface State {
  readonly history: History;
  readonly tool: Tool;
  /** Replay in progress: the cursor advances one edit per step. */
  readonly playing: boolean;
}

export type Msg =
  | { readonly _tag: 'Paint'; readonly cell: number }
  | { readonly _tag: 'Pick'; readonly tool: Tool }
  | { readonly _tag: 'Undo' }
  | { readonly _tag: 'Redo' }
  | { readonly _tag: 'Clear' }
  | { readonly _tag: 'Scrub'; readonly to: number }
  | { readonly _tag: 'Shortcut'; readonly action: 'undo' | 'redo' }
  | { readonly _tag: 'Replay' }
  | { readonly _tag: 'Step' };

/** Time between edits during replay. */
export const STEP_MS = 120;

// One lane: pressing Replay again restarts it instead of running two replays at once.
const nextStep = delay<Msg>(STEP_MS, { _tag: 'Step' }, { key: 'replay', concurrency: 'switch' });

/** Any edit or history move by the user stops a replay where it is. */
const by = (s: State, history: History): State => ({ ...s, history, playing: false });

function paint(s: State, cell: number): State {
  const edit =
    s.tool === 'eraser'
      ? ({ _tag: 'Erase', cell } as const)
      : ({ _tag: 'Paint', cell, color: s.tool } as const);
  return by(s, record(s.history, edit));
}

function step(s: State): Next<State, Msg> {
  if (!s.playing) return s; // stopped since the step was scheduled
  const history = redo(s.history);
  return canRedo(history) ? [{ ...s, history }, [nextStep]] : { ...s, history, playing: false };
}

export const Editor = define<State, Msg>('gy-pixel-editor', {
  init: () => ({ history: emptyHistory, tool: 'ink', playing: false }),
  intent: {
    Paint: ({ target }) => {
      const cell = Number(target.getAttribute('data-cell'));
      return Number.isInteger(cell) ? { _tag: 'Paint', cell } : undefined;
    },
    Pick: ({ value }) =>
      value === 'eraser' || isColor(value) ? { _tag: 'Pick', tool: value } : undefined,
    Undo: () => ({ _tag: 'Undo' }),
    Redo: () => ({ _tag: 'Redo' }),
    Clear: () => ({ _tag: 'Clear' }),
    Scrub: ({ value }) => ({ _tag: 'Scrub', to: Number(value) }),
    Replay: () => ({ _tag: 'Replay' }),
    // Ctrl/⌘+Z undoes; Ctrl/⌘+Shift+Z or Ctrl+Y redoes.
    Shortcut: ({ event, key }) => {
      if (!(event instanceof KeyboardEvent) || !(event.ctrlKey || event.metaKey)) return;
      const k = key?.toLowerCase();
      const action = k === 'y' || (k === 'z' && event.shiftKey) ? 'redo' : k === 'z' ? 'undo' : '';
      if (action === '') return;
      event.preventDefault();
      return { _tag: 'Shortcut', action };
    },
  },
  update: {
    Paint: (s, m) => paint(s, m.cell),
    Pick: (s, m) => ({ ...s, tool: m.tool }),
    Undo: (s) => by(s, undo(s.history)),
    Redo: (s) => by(s, redo(s.history)),
    Shortcut: (s, m) => by(s, m.action === 'undo' ? undo(s.history) : redo(s.history)),
    Clear: (s) => by(s, record(s.history, { _tag: 'Clear' })),
    Scrub: (s, m) => by(s, seek(s.history, m.to)),
    Replay: (s) =>
      s.history.edits.length === 0
        ? s
        : [{ ...s, history: seek(s.history, 0), playing: true }, [nextStep]],
    Step: step,
  },
  view: (s, i) => {
    const { edits, cursor } = s.history;
    const pixels = pixelsAt(s.history);
    // What redo would bring back: undone edits stay visible as dashed "ghost" pixels.
    const future = canRedo(s.history) ? pixelsAt(seek(s.history, edits.length)) : pixels;
    const last = edits[cursor - 1];
    const where = `Edit ${String(cursor)} of ${String(edits.length)}`;
    return html`
      <div class="editor" data-intent=${i.Shortcut} data-intent-on="keydown">
        <fieldset class="tools">
          <legend>Brush</legend>
          ${[...COLORS, 'eraser' as const].map(
            (tool) =>
              html`<label class="swatch" data-tool=${tool}>
                <input
                  type="radio"
                  name="tool"
                  value=${tool}
                  ?checked=${s.tool === tool}
                  data-intent=${i.Pick}
                />
                <span>${tool}</span>
              </label>`,
          )}
        </fieldset>
        <div class="canvas" role="group" aria-label="Canvas, 12 by 12 pixels">
          ${pixels.map(
            (color, cell) =>
              html`<button
                type="button"
                class="pixel"
                data-cell=${cell}
                data-color=${color ?? 'none'}
                data-ghost=${future[cell] === color ? nothing : (future[cell] ?? 'none')}
                aria-label=${`${cellName(cell)}: ${color ?? 'empty'}`}
                data-intent=${i.Paint}
              ></button>`,
          )}
        </div>
        <div class="history">
          <div class="actions">
            <button type="button" ?disabled=${!canUndo(s.history)} data-intent=${i.Undo}>
              Undo
            </button>
            <button type="button" ?disabled=${!canRedo(s.history)} data-intent=${i.Redo}>
              Redo
            </button>
            <button type="button" ?disabled=${edits.length === 0} data-intent=${i.Replay}>
              ${s.playing ? 'Replaying…' : 'Replay'}
            </button>
            <button
              type="button"
              ?disabled=${pixels.every((p) => p === undefined)}
              data-intent=${i.Clear}
            >
              Clear
            </button>
          </div>
          <label class="timeline">
            <span>Timeline</span>
            <input
              type="range"
              min="0"
              max=${edits.length}
              step="1"
              value=${cursor}
              ?disabled=${edits.length === 0}
              aria-valuetext=${where}
              data-intent=${i.Scrub}
            />
          </label>
          <p class="where" aria-live="polite">
            <strong>${where}</strong>
            <span>${last === undefined ? 'Blank canvas' : describe(last)}</span>
          </p>
        </div>
      </div>
    `;
  },
  styles,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-pixel-editor': InstanceType<typeof Editor>;
  }
}
