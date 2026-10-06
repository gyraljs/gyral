// `pnpm smoke:prod`: builds the SSR examples for production (production core, minified),
// serves them with their production servers, and checks in Chromium that every page hydrates
// in place: no page errors or hydration warnings, the same <h1> count and the same top-level
// view per component as the server sent, and every element the parser built (shadow roots
// included) still in the page: hydration adopted the server's nodes instead of replacing them.
// Catches production-only hydration bugs that development tests cannot (gyral-czi.41).
// Not part of `pnpm check` (it builds); run it before releases and after hydration changes.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright';
import { compareSummaries, summarize } from './lib/smoke.mjs';

const EXAMPLES = [
  { name: 'isomorphic', paths: ['/', '/about'] },
  { name: 'register', paths: ['/'] },
];

/**
 * Runs before page scripts: once parsing is done (readyState "interactive", before module
 * scripts run), records every element, in shadow roots too, as the server's nodes. A shadow
 * root's <style> is left out: hydration swaps it for the shared sheet (view/08-styles.md).
 */
const MARK_SERVER_NODES = `document.addEventListener('readystatechange', () => {
  if (document.readyState !== 'interactive') return;
  const all = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (!(el.localName === 'style' && el.parentNode instanceof ShadowRoot)) all.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  window.__gyralServerNodes = all;
});`;

/** Server elements no longer in the page, described by tag. */
const LOST_SERVER_NODES = `(window.__gyralServerNodes ?? [null])
  .filter((el) => el === null || !el.isConnected)
  .map((el) => (el === null ? 'not recorded' : el.localName))`;

const freePort = () =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

async function waitFor(url, child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`server exited (${String(child.exitCode)})`);
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`server did not start: ${url}`);
}

async function checkExample(browser, { name, paths }) {
  const cwd = `examples/${name}`;
  const build = spawnSync('pnpm', ['build'], { cwd, encoding: 'utf8' });
  if (build.status !== 0) return [`${name}: build failed\n${build.stdout}${build.stderr}`];
  const port = await freePort();
  const child = spawn('pnpm', ['start'], {
    cwd,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
    stdio: 'ignore',
    detached: true,
  });
  const problems = [];
  try {
    const base = `http://localhost:${String(port)}`;
    await waitFor(base, child);
    for (const path of paths) {
      const html = await (await fetch(base + path)).text();
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
      page.on('console', (m) => {
        if (/hydration mismatch/i.test(m.text())) errors.push(m.text().split('\n')[0]);
      });
      await page.addInitScript(MARK_SERVER_NODES);
      await page.goto(base + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      const fn = summarize.toString();
      const server = await page.evaluate(
        `(${fn})(Document.parseHTMLUnsafe(${JSON.stringify(html)}))`,
      );
      const live = await page.evaluate(`(${fn})(document)`);
      problems.push(...compareSummaries(`${name}${path}`, server, live, errors));
      const lost = await page.evaluate(LOST_SERVER_NODES);
      if (lost.length > 0) {
        problems.push(`${name}${path}: server nodes replaced by hydration: ${lost.join(', ')}`);
      }
      await page.close();
    }
  } catch (error) {
    problems.push(`${name}: ${String(error)}`);
  } finally {
    process.kill(-child.pid, 'SIGTERM'); // the pnpm process group, including the node server
  }
  return problems;
}

const browser = await chromium.launch();
const problems = [];
for (const example of EXAMPLES) {
  const found = await checkExample(browser, example);
  console.log(
    `${example.name}: ${found.length === 0 ? 'ok' : `${String(found.length)} problem(s)`}`,
  );
  problems.push(...found);
}
await browser.close();

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('smoke:prod: production builds hydrate in place');
