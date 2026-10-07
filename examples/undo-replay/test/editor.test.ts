import { afterEach, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { run, step, virtualTime, type VirtualTime } from '@gyral/testing';
import { Editor, STEP_MS, type Msg } from '../src/editor.js';
import { emptyHistory, pixelsAt, record, redo, seek, undo } from '../src/history.js';

let clock: VirtualTime | undefined;

afterEach(() => {
  document.body.replaceChildren();
  clock?.restore();
  clock = undefined;
});

const paint = (cell: number): Msg => ({ _tag: 'Paint', cell });

it('the picture is the edits before the cursor, folded together', () => {
  const h = [0, 1, 2].reduce(
    (acc, cell) => record(acc, { _tag: 'Paint', cell, color: 'red' }),
    emptyHistory,
  );
  expect(pixelsAt(h).slice(0, 4)).toEqual(['red', 'red', 'red', undefined]);
  expect(pixelsAt(undo(h)).slice(0, 4)).toEqual(['red', 'red', undefined, undefined]);
  expect(pixelsAt(seek(h, 1)).slice(0, 4)).toEqual(['red', undefined, undefined, undefined]);
  expect(redo(undo(h))).toEqual(h);
});

it('a new edit after undo drops the undone future; no-op edits are not recorded', () => {
  let h = record(emptyHistory, { _tag: 'Paint', cell: 0, color: 'red' });
  h = record(h, { _tag: 'Paint', cell: 1, color: 'red' });
  h = record(undo(h), { _tag: 'Paint', cell: 5, color: 'blue' });
  expect(h.edits.map((e) => (e._tag === 'Paint' ? e.cell : -1))).toEqual([0, 5]);
  expect(record(h, { _tag: 'Paint', cell: 5, color: 'blue' })).toBe(h);
  expect(record(emptyHistory, { _tag: 'Clear' })).toBe(emptyHistory);
});

it('update: undo, redo and scrub only move the cursor', () => {
  const { state } = run(Editor.spec, [paint(0), paint(1), paint(2), { _tag: 'Undo' }]);
  expect(state.history.cursor).toBe(2);
  expect(state.history.edits).toHaveLength(3);
  expect(step(Editor.spec, state, { _tag: 'Scrub', to: 0 }).state.history.cursor).toBe(0);
  expect(step(Editor.spec, state, { _tag: 'Scrub', to: 99 }).state.history.cursor).toBe(3);
  expect(step(Editor.spec, state, { _tag: 'Redo' }).state.history.cursor).toBe(3);
});

it('replay rewinds to the start and schedules one step per edit', () => {
  const { state } = run(Editor.spec, [paint(0), paint(1)]);
  const replay = step(Editor.spec, state, { _tag: 'Replay' });
  expect(replay.state).toMatchObject({ playing: true, history: { cursor: 0 } });
  expect(replay.commands).toHaveLength(1);
  const first = step(Editor.spec, replay.state, { _tag: 'Step' });
  expect(first.state.history.cursor).toBe(1);
  expect(first.commands).toHaveLength(1);
  const last = step(Editor.spec, first.state, { _tag: 'Step' });
  expect(last.state).toMatchObject({ playing: false, history: { cursor: 2 } });
  expect(last.commands).toHaveLength(0);
  // Painting during a replay stops it; a late Step is then ignored.
  const stopped = step(Editor.spec, first.state, paint(7)).state;
  expect(stopped.playing).toBe(false);
  expect(step(Editor.spec, stopped, { _tag: 'Step' }).state).toBe(stopped);
});

it('paints, undoes with the keyboard and replays in the page', async () => {
  clock = virtualTime();
  const el = document.createElement('gy-pixel-editor');
  document.body.append(el);
  await settled();
  const root = el.shadowRoot;
  const pixel = (n: number) => root?.querySelector<HTMLButtonElement>(`[data-cell="${String(n)}"]`);
  pixel(0)?.click();
  pixel(1)?.click();
  await settled();
  expect(pixel(1)?.dataset['color']).toBe('ink');

  pixel(1)?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, composed: true }),
  );
  await settled();
  expect(pixel(1)?.dataset['color']).toBe('none');
  expect(root?.querySelector('.where strong')?.textContent).toBe('Edit 1 of 2');

  const buttons = [...(root?.querySelectorAll<HTMLButtonElement>('.actions button') ?? [])];
  buttons.find((b) => b.textContent.trim() === 'Replay')?.click();
  await settled();
  expect(el.state.history.cursor).toBe(0);
  await clock.advance(STEP_MS * 2);
  await settled();
  expect(el.state).toMatchObject({ playing: false, history: { cursor: 2 } });
  expect(pixel(1)?.dataset['color']).toBe('ink');
});
