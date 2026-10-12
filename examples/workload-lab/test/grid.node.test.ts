import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

let server: ViteDevServer;
let browser: Browser;
let origin: string;
beforeAll(async () => {
  server = await createServer({
    ...gyralVitePreset({ clientOnly: true }),
    root: resolve('examples/workload-lab'),
    configFile: false,
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (address === null || address === undefined || typeof address === 'string')
    throw new Error('Expected listener');
  origin = `http://127.0.0.1:${String(address.port)}`;
  browser = await chromium.launch();
}, 30_000);
afterAll(async () => {
  await browser.close();
  await server.close();
});

it('uses real capture, touch cancellation, reduced-motion readiness and document popover retargeting', async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    colorScheme: 'dark',
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(origin);
    const grid = page.locator('gy-workload-grid');
    await grid.locator('canvas[data-ready="true"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const first = grid.locator('[data-cell="0"]');
    const last = grid.locator('[data-cell="24"]');
    await first.scrollIntoViewIfNeeded();
    const a = await first.boundingBox(),
      b = await last.boundingBox();
    if (a === null || b === null) throw new Error('Expected cell rectangles');
    expect(a.width).toBeGreaterThanOrEqual(44);
    expect(a.height).toBeGreaterThanOrEqual(44);
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect.poll(() => grid.locator('output').textContent()).toContain('Selected cell 25');
    expect(await grid.locator('[role="group"]').evaluate((el) => el.hasPointerCapture(1))).toBe(
      true,
    );
    await page.mouse.move(1, 1);
    await page.mouse.up();
    await expect
      .poll(() => grid.locator('[role="group"]').evaluate((el) => el.hasPointerCapture(1)))
      .toBe(false);
    expect(await grid.locator('output').textContent()).toContain('drag path: 1, 25');

    const session = await page.context().newCDPSession(page);
    const middle = await grid.locator('[data-cell="12"]').boundingBox();
    if (middle === null) throw new Error('Expected middle cell');
    const point = (x: number, y: number) => [{ x, y, id: 7, radiusX: 1, radiusY: 1, force: 1 }];
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: point(a.x + 20, a.y + 20),
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(middle.x + 20, middle.y + 20),
    });
    await expect.poll(() => grid.locator('output').textContent()).toContain('Selected cell 13');
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    expect(await grid.locator('output').textContent()).toContain('drag path: 1, 13');
    await session.detach();
    await first.focus();
    await page.keyboard.down('ArrowRight');
    await expect.poll(() => grid.locator('output').textContent()).toContain('Selected cell 15');
    await page.keyboard.up('ArrowRight');
    expect(
      await grid
        .locator('[data-cell="14"]')
        .evaluate(
          (el) =>
            el.getRootNode() instanceof ShadowRoot &&
            (el.getRootNode() as ShadowRoot).activeElement === el,
        ),
    ).toBe(true);

    await page.evaluate(() => {
      document.body.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.localName === 'gy-grid-help') {
          document.body.dataset['retarget'] = event.target.localName;
          document.body.dataset['original'] =
            event.composedPath()[0] instanceof HTMLButtonElement ? 'button' : 'other';
        }
      });
    });
    await page.getByRole('button', { name: 'Show grid help', exact: true }).click();
    await page.getByRole('button', { name: 'Got it', exact: true }).click();
    expect(await page.locator('body').getAttribute('data-retarget')).toBe('gy-grid-help');
    expect(await page.locator('body').getAttribute('data-original')).toBe('button');
    await page.keyboard.press('Escape');
    const described = await grid.locator('[role="group"]').evaluate((el) => {
      const elements = Reflect.get(el, 'ariaDescribedByElements') as
        readonly Element[] | null | undefined;
      return elements?.map((node) => node.id) ?? [el.getAttribute('aria-describedby')];
    });
    expect(described).toEqual(['grid-description']);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 30_000);
