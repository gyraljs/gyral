// pnpm demos:record undo-replay: paint a heart, undo (the undone pixels stay as ghosts),
// scrub the timeline back, then replay the whole session. Format: scripts/lib/demos.mjs.

const SIZE = 12;
/** A heart, as [row, columns] with 1-based columns. */
const HEART = [
  [2, [4, 5, 9, 10]],
  [3, [3, 4, 5, 6, 8, 9, 10, 11]],
  [4, [3, 4, 5, 6, 7, 8, 9, 10, 11]],
  [5, [3, 4, 5, 6, 7, 8, 9, 10, 11]],
  [6, [4, 5, 6, 7, 8, 9, 10]],
  [7, [5, 6, 7, 8, 9]],
  [8, [6, 7, 8]],
  [9, [7]],
];
const cells = HEART.flatMap(([row, cols]) => cols.map((col) => (row - 1) * SIZE + (col - 1)));
const SPARKLE = [1 * SIZE + 1, 9 * SIZE + 10];

export default {
  pitch:
    'Undo, redo, a scrubbable timeline and replay in a few lines: every edit is a message kept as data, so history is a list and the picture is a fold over it.',
  usual:
    'Usually undo is a feature you build: command objects, inverse operations and snapshots kept in sync with mutable state.',
  scenes: [
    {
      id: 'main',
      run: async (page, { pause, poster }) => {
        const pixel = (n) => page.locator(`[data-cell="${String(n)}"]`);
        await page.getByRole('radio', { name: 'red' }).check();
        for (const cell of cells) {
          await pixel(cell).click();
          await pause(35);
        }
        await page.getByRole('radio', { name: 'yellow' }).check();
        for (const cell of SPARKLE) {
          await pixel(cell).click();
          await pause(120);
        }
        await pause(500);
        const undo = page.getByRole('button', { name: 'Undo' });
        for (let n = 0; n < 6; n += 1) {
          await undo.click();
          await pause(220);
        }
        await pause(600); // the undone pixels are still there, as ghosts
        await page.getByRole('button', { name: 'Redo' }).click();
        await pause(500);
        const timeline = page.getByRole('slider', { name: 'Timeline' });
        for (const to of [30, 18, 8, 0]) {
          await timeline.fill(String(to));
          await pause(280);
        }
        await pause(500);
        await page.getByRole('button', { name: 'Replay' }).click();
        await pause(120 * 24);
        await poster();
        const total = String(cells.length + SPARKLE.length);
        await page.getByText(`Edit ${total} of ${total}`).waitFor({ timeout: 15_000 });
        await pause(800);
      },
    },
  ],
};
