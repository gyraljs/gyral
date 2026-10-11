// Compare shop production builds for gyral-1zd.31. Run from a shop checkout; its production
// harness seeds a throwaway database. Report cold-page JS and all emitted JS (gzip level 9).
// node /path/to/gyral/scripts/measure-components-shop.mjs /tmp/result.json [--no-build]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
const { chromium } = await import(pathToFileURL(resolve('node_modules/playwright/index.mjs')));
const { startProduction, discoverPaths } = await import(
  pathToFileURL(resolve('scripts/lib/prod-server.mjs'))
);
const gzip = (body) => gzipSync(body, { level: 9 }).length;
const { base, stop } = await startProduction({
  quiet: true,
  build: !process.argv.includes('--no-build'),
});
let browser;
try {
  const { department, category, product } = await discoverPaths(base);
  const pages = [
    ['home', '/'],
    ['department', department],
    ['category', category],
    ['product', product],
    ['search', '/search?q=phone'],
    ['cart', '/cart'],
    ['login', '/account/login'],
    ['about', '/about'],
    ['contact', '/contact'],
  ];
  const emitted = readdirSync('dist/client', { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .map((file) => {
      const body = readFileSync(resolve('dist/client', file));
      return { file, raw: body.length, gzip: gzip(body) };
    });
  browser = await chromium.launch();
  const rows = [];
  for (const [name, path] of pages) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const scripts = [];
    const responses = [];
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('response', (response) => {
      if (response.request().resourceType() === 'script')
        responses.push(
          (async () => {
            const body = await response.body();
            scripts.push({
              file: new URL(response.url()).pathname,
              raw: body.length,
              gzip: gzip(body),
              status: response.status(),
            });
          })(),
        );
    });
    const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await globalThis[Symbol.for('gyral.components')]?.ready();
    });
    await page.waitForLoadState('networkidle');
    await Promise.all(responses);
    rows.push({
      name,
      path,
      status: response.status(),
      scripts: scripts.sort((a, b) => a.file.localeCompare(b.file)),
      count: scripts.length,
      raw: scripts.reduce((sum, s) => sum + s.raw, 0),
      gzip: scripts.reduce((sum, s) => sum + s.gzip, 0),
      errors,
    });
    await context.close();
  }
  const result = {
    emitted,
    allChunksGzip: emitted.reduce((sum, s) => sum + s.gzip, 0),
    allChunksRaw: emitted.reduce((sum, s) => sum + s.raw, 0),
    rows,
  };
  writeFileSync(process.argv[2], `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        allChunksGzip: result.allChunksGzip,
        rows: rows.map(({ name, status, count, gzip, errors }) => ({
          name,
          status,
          count,
          gzip,
          errors,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  stop();
}
