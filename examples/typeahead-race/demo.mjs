// pnpm demos:record typeahead-race: type slowly (both panels agree), then fast (the naive
// panel ends on a stale answer; the switch panel cancels and stays right). Format:
// scripts/lib/demos.mjs. The simulated server's latency is fixed, so this replays exactly.
/* global document, window -- the page.evaluate callback runs in the page */

export default {
  pitch:
    'Type-ahead that never shows results for something you are no longer typing: one word, concurrency: switch, cancels the request in flight.',
  usual:
    'Usually each keystroke fires a fetch and whichever answer lands last wins; fixing it means AbortControllers, request ids and "is this still current?" checks.',
  scenes: [
    {
      id: 'main',
      run: async (page, { pause, poster }) => {
        const field = page.getByLabel('Search web platform APIs');
        await field.click();
        // Frame the field and both panels.
        await page.evaluate(() => {
          const top = document.querySelector('gy-typeahead-race')?.getBoundingClientRect().top;
          window.scrollTo(0, (top ?? 0) + window.scrollY - 16);
        });
        await pause(400);
        await page.keyboard.type('view', { delay: 950 }); // slowly: every answer is current
        await pause(1200);
        await field.fill('');
        await pause(700);
        await page.keyboard.type('work', { delay: 110 }); // fast: answers arrive out of order
        await page.getByText('Stale!').waitFor({ timeout: 5000 });
        await pause(1800);
        await poster();
        await field.fill('');
        await pause(600);
        await page.keyboard.type('shad', { delay: 110 });
        await page.getByText('Stale!').waitFor({ timeout: 5000 });
        await pause(2200);
      },
    },
  ],
};
