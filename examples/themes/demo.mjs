// pnpm demos:record themes: use the app a little, then flip through the four themes while it
// keeps its state (the ticked task stays ticked). Format: scripts/lib/demos.mjs.

export default {
  pitch:
    'One app, four completely different looks, switched live without losing state: components read design tokens, and a theme is nothing but tokens.',
  usual:
    'Usually a redesign means touching every component: hard-coded colours, per-theme class names, or a second component library.',
  scenes: [
    {
      id: 'main',
      run: async (page, { pause, poster }) => {
        await pause(800);
        await page.getByText('Record the demo videos').click();
        await pause(900);
        for (const theme of ['Midnight', 'Paper', 'Brutalist']) {
          await page.getByText(theme, { exact: true }).click();
          await pause(1700);
          if (theme === 'Brutalist') await poster();
        }
        await page.getByText('Publish 0.1.0').click();
        await pause(1100);
        await page.getByText('Calm', { exact: true }).click();
        await pause(1600);
      },
    },
  ],
};
