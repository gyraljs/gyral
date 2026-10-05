// The model behind undo, redo and replay: a list of edits and a cursor into it. The picture
// is never stored; it is the edits before the cursor, folded together. Undo moves the cursor
// back, redo moves it forward, the timeline sets it, and replay walks it from 0 to the end.

export const SIZE = 12;

export const COLORS = ['ink', 'red', 'orange', 'yellow', 'green', 'blue'] as const;
export type Color = (typeof COLORS)[number];

export const isColor = (value: string | undefined): value is Color =>
  (COLORS as readonly (string | undefined)[]).includes(value);

export type Edit =
  | { readonly _tag: 'Paint'; readonly cell: number; readonly color: Color }
  | { readonly _tag: 'Erase'; readonly cell: number }
  | { readonly _tag: 'Clear' };

export interface History {
  readonly edits: readonly Edit[];
  /** How many edits are applied: `edits.length` unless something was undone. */
  readonly cursor: number;
}

export type Pixels = readonly (Color | undefined)[];

export const emptyHistory: History = { edits: [], cursor: 0 };

const blank = (): (Color | undefined)[] => Array.from({ length: SIZE * SIZE }, () => undefined);

function apply(pixels: (Color | undefined)[], edit: Edit): (Color | undefined)[] {
  switch (edit._tag) {
    case 'Paint':
      pixels[edit.cell] = edit.color;
      return pixels;
    case 'Erase':
      pixels[edit.cell] = undefined;
      return pixels;
    case 'Clear':
      return blank();
  }
}

/** The picture after the first `cursor` edits. */
export const pixelsAt = (h: History): Pixels => h.edits.slice(0, h.cursor).reduce(apply, blank());

/**
 * Records an edit at the cursor. Anything that was undone is dropped, as in every editor.
 * An edit that wouldn't change the picture isn't recorded, so undo never seems to do nothing.
 */
export function record(h: History, edit: Edit): History {
  const before = pixelsAt(h);
  const after = apply([...before], edit);
  if (after.every((p, i) => p === before[i])) return h;
  return { edits: [...h.edits.slice(0, h.cursor), edit], cursor: h.cursor + 1 };
}

export const canUndo = (h: History): boolean => h.cursor > 0;
export const canRedo = (h: History): boolean => h.cursor < h.edits.length;

export const undo = (h: History): History => (canUndo(h) ? { ...h, cursor: h.cursor - 1 } : h);
export const redo = (h: History): History => (canRedo(h) ? { ...h, cursor: h.cursor + 1 } : h);

/** Moves the cursor anywhere in history (the timeline), clamped to what exists. */
export const seek = (h: History, to: number): History => ({
  ...h,
  cursor: Number.isFinite(to) ? Math.min(Math.max(Math.trunc(to), 0), h.edits.length) : h.cursor,
});

export const cellName = (cell: number): string =>
  `row ${String(Math.floor(cell / SIZE) + 1)}, column ${String((cell % SIZE) + 1)}`;

export function describe(edit: Edit): string {
  switch (edit._tag) {
    case 'Paint':
      return `Painted ${cellName(edit.cell)} ${edit.color}`;
    case 'Erase':
      return `Erased ${cellName(edit.cell)}`;
    case 'Clear':
      return 'Cleared the canvas';
  }
}
