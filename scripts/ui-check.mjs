// pnpm ui:check [example…] [--baseline | --compare]
// Starts the examples, drives each through examples/<name>/ui-scenario.mjs in headless
// Chromium at desktop and phone widths in light and dark, and records screenshots, console
// problems, horizontal overflow and axe violations into .ui-check/<run>/report.md.
// Exits 1 if anything fails. See docs/design-docs/0005-harness-engineering.md.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { listExamples } from './lib/examples.mjs';
import {
  PRIMARY,
  SCHEMES,
  VIEWPORTS,
  axeSummary,
  overflowFinding,
  parseArgs,
  renderReport,
  shotFailures,
  significantConsole,
  validateScenario,
} from './lib/ui-check.mjs';

/* global document, axe -- measureOverflow and runAxe's callback run in the page */

const exampleFailed = (ex) => Boolean(ex.error) || ex.shots.some((s) => shotFailures(s).length > 0);

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const OUT = '.ui-check';
const BASELINE = join(OUT, 'baseline');

const { options, errors, usage } = parseArgs(process.argv.slice(2), process.env);
if (errors.length > 0) {
  if (!errors.includes('help')) console.error(errors.join('\n'));
  console.error(usage);
  process.exit(errors.includes('help') ? 0 : 2);
}

const examples = listExamples(options.examples, options.port);
if (examples.length === 0) {
  console.error(`No examples match: ${options.examples.join(', ')}`);
  process.exit(2);
}

/** Loads and validates every scenario before starting anything. */
async function loadScenarios() {
  const problems = [];
  for (const ex of examples) {
    const file = resolve(ex.dir, 'ui-scenario.mjs');
    if (!existsSync(file)) {
      ex.scenario = { steps: [] };
      ex.note = 'No ui-scenario.mjs: page load only.';
      continue;
    }
    const scenario = (await import(pathToFileURL(file).href)).default;
    problems.push(...validateScenario(ex.name, scenario));
    ex.scenario = scenario;
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(2);
  }
}

const portFree = (port) =>
  new Promise((ok) => {
    const server = createServer()
      .once('error', () => ok(false))
      .once('listening', () => server.close(() => ok(true)))
      .listen(port, '127.0.0.1');
  });

async function waitForServer(url, timeoutMs = 90_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server did not start: ${url}`);
}

function startServers() {
  const child = spawn('node', ['scripts/examples.mjs', ...examples.map((ex) => ex.name)], {
    env: { ...process.env, EXAMPLES_PORT: String(options.port) },
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true, // own process group, so stopping kills every dev server under it
  });
  let log = '';
  child.stderr.on('data', (chunk) => (log += String(chunk)));
  return {
    stop: () => {
      try {
        process.kill(-(child.pid ?? 0), 'SIGTERM');
      } catch {
        // already gone
      }
    },
    log: () => log,
  };
}

function locate(page, target) {
  const exact = target.exact === true ? { exact: true } : {};
  if ('role' in target)
    return page.getByRole(
      target.role,
      target.name === undefined ? {} : { name: target.name, ...exact },
    );
  if ('label' in target) return page.getByLabel(target.label, exact);
  if ('text' in target) return page.getByText(target.text, exact);
  return page.locator(target.css);
}

async function runStep(page, base, step) {
  if ('goto' in step) await page.goto(base + step.goto, { waitUntil: 'networkidle' });
  else if ('click' in step) await locate(page, step.click).first().click();
  else if ('fill' in step) await locate(page, step.fill).first().fill(step.value);
  else if ('check' in step) await locate(page, step.check).first().check();
  else if ('select' in step) await locate(page, step.select).first().selectOption(step.value);
  else if ('press' in step) await page.keyboard.press(step.press);
  else if ('waitFor' in step) await locate(page, step.waitFor).first().waitFor({ timeout: 15_000 });
  else if ('wait' in step) await page.waitForTimeout(step.wait);
}

/** Measured in the page: document overflow plus the elements sticking out, shadow roots included. */
function measureOverflow() {
  const doc = document.documentElement;
  const width = doc.clientWidth;
  const offenders = [];
  const describe = (el) =>
    el.localName +
    (el.id ? `#${el.id}` : '') +
    (el.classList.length ? `.${[...el.classList].join('.')}` : '');
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > width + 1)
        offenders.push({ selector: describe(el), right: Math.round(r.right) });
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  offenders.sort((a, b) => b.right - a.right);
  return { scrollWidth: doc.scrollWidth, clientWidth: width, offenders: offenders.slice(0, 5) };
}

async function runAxe(page) {
  await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async () => {
    const result = await axe.run(document, { resultTypes: ['violations'] });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    }));
  });
  return axeSummary(violations);
}

function compareShot(file, baselineFile, diffFile) {
  if (!existsSync(baselineFile))
    return { failed: true, reason: 'no baseline (run with --baseline first)' };
  const a = PNG.sync.read(readFileSync(baselineFile));
  const b = PNG.sync.read(readFileSync(file));
  if (a.width !== b.width || a.height !== b.height)
    return {
      failed: true,
      reason: `size changed ${String(a.width)}×${String(a.height)} → ${String(b.width)}×${String(b.height)}`,
    };
  const diff = new PNG({ width: a.width, height: a.height });
  const pixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: options.threshold,
  });
  const ratio = pixels / (a.width * a.height);
  const failed = ratio > options.maxDiff;
  if (pixels > 0) writeFileSync(diffFile, PNG.sync.write(diff));
  return {
    failed,
    reason: `${String(pixels)} px differ (${(ratio * 100).toFixed(3)}%)`,
    ...(pixels > 0 ? { diffFile: diffFile.split('/').slice(-2).join('/') } : {}),
  };
}

async function checkExample(browser, ex, runDir) {
  const base = `http://localhost:${String(ex.port)}`;
  mkdirSync(join(runDir, ex.name), { recursive: true });
  ex.shots = [];
  for (const viewport of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      const name = `${viewport.name}-${scheme}.png`;
      const shot = {
        viewport: viewport.name,
        scheme,
        file: `${ex.name}/${name}`,
        console: [],
        axe: [],
      };
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: scheme,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const entries = [];
      page.on('console', (m) => entries.push({ type: m.type(), text: m.text() }));
      page.on('pageerror', (e) => entries.push({ type: 'pageerror', text: String(e) }));
      try {
        await page.goto(`${base}/`, { waitUntil: 'networkidle' });
        const primary = viewport.name === PRIMARY.viewport && scheme === PRIMARY.scheme;
        if (primary || !ex.scenario.once)
          for (const step of ex.scenario.steps) await runStep(page, base, step);
        await page.waitForTimeout(250);
        shot.overflow = overflowFinding(await page.evaluate(measureOverflow));
        shot.axe = await runAxe(page);
        await page.screenshot({ path: join(runDir, ex.name, name), fullPage: true });
        if (options.compare)
          shot.diff = compareShot(
            join(runDir, ex.name, name),
            join(BASELINE, ex.name, name),
            join(runDir, ex.name, `diff-${name}`),
          );
        if (options.baseline) {
          mkdirSync(join(BASELINE, ex.name), { recursive: true });
          copyFileSync(join(runDir, ex.name, name), join(BASELINE, ex.name, name));
        }
      } catch (error) {
        shot.error = String(error).split('\n')[0];
      }
      shot.console = significantConsole(entries, ex.scenario.allowConsole ?? []);
      ex.shots.push(shot);
      await context.close();
    }
  }
}

await loadScenarios();
for (let p = options.port; p <= options.port + examples.length; p += 1) {
  if (!(await portFree(p))) {
    console.error(`Port ${String(p)} is busy. Pick another base with --port=… or EXAMPLES_PORT.`);
    process.exit(2);
  }
}

const startedAt = new Date().toISOString();
const runDir = join(OUT, startedAt.replace(/[:.]/g, '-'));
mkdirSync(runDir, { recursive: true });
const servers = startServers();
const stopAll = () => servers.stop();
process.on('SIGINT', () => (stopAll(), process.exit(130)));

let browser;
try {
  await Promise.all(examples.map((ex) => waitForServer(`http://localhost:${String(ex.port)}/`)));
  browser = await chromium.launch();
  for (const ex of examples) {
    process.stdout.write(`${ex.name.padEnd(22)} `);
    try {
      await checkExample(browser, ex, runDir);
    } catch (error) {
      ex.error = String(error).split('\n')[0];
      ex.shots ??= [];
    }
    console.log(exampleFailed(ex) ? 'FAIL' : 'ok');
  }
} catch (error) {
  console.error(String(error), '\n', servers.log().slice(-2000));
  stopAll();
  process.exit(1);
} finally {
  await browser?.close();
  stopAll();
}

const mode = options.baseline ? 'baseline saved' : options.compare ? 'compared with baseline' : '';
const report = renderReport({ startedAt, mode, examples });
writeFileSync(join(runDir, 'report.md'), report);
const failed = examples.filter(exampleFailed);
console.log(`\nReport: ${join(runDir, 'report.md')}`);
console.log(
  `${String(examples.length - failed.length)}/${String(examples.length)} examples passed.`,
);
process.exit(failed.length > 0 ? 1 : 0);
