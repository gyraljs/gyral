// pnpm demos:record view-transitions: re-sort the cards (each glides to its new place), then
// open one (its swatch grows into the detail view) and go back. Format: scripts/lib/demos.mjs.

export default {
  pitch:
    'Cards that glide to their new places when sorted and grow into a detail view: the component asks for View Transitions with one option, and the browser animates.',
  usual:
    'Usually this is FLIP code or an animation library: measure every element before and after, then tween positions by hand.',
  scenes: [
    {
      id: 'main',
      run: async (page, { pause, poster }) => {
        await pause(900);
        for (const order of ['Hue', 'Lightness']) {
          await page.getByText(order, { exact: true }).click();
          await pause(1300);
        }
        await page.getByRole('button', { name: 'Reverse' }).click();
        await pause(1300);
        await page.getByText('Name', { exact: true }).click();
        await pause(1300);
        await page.getByRole('button', { name: /^Teal/ }).click();
        await page.getByRole('button', { name: 'Back to all pigments' }).waitFor();
        await pause(1400);
        await poster();
        await page.getByRole('button', { name: 'Back to all pigments' }).click();
        await pause(1300);
        await page.getByRole('button', { name: /^Magenta/ }).click();
        await pause(1400);
        await page.getByRole('button', { name: 'Back to all pigments' }).click();
        await pause(1200);
      },
    },
  ],
};
