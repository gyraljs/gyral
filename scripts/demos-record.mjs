// pnpm demos:record [example…] [--port=5600] [--scheme=light|dark]
// Records the scripted demo of each example that has a demo.mjs (the "What you can build"
// page on gyral.dev): starts the example servers, plays each scene in headless Chromium at
// 1280×720 with video on, and writes .demos/<example>[-<scene>].webm plus a .png poster.
// Not part of the gate: recordings are for people. The format is in scripts/lib/demos.mjs.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { listExamples } from './lib/examples.mjs';
import { FRAME, OUT_DIR, parseArgs, sceneStem, validateDemo } from './lib/demos.mjs';

const { options, errors, usage } = parseArgs(process.argv.slice(2), process.env);
if (errors.length > 0) {
  if (!errors.includes('help')) console.error(errors.join('\n'));
  console.error(usage);
  process.exit(errors.includes('help') ? 0 : 2);
}

const withDemos = listExamples(options.examples, options.port)
  .filter((ex) => existsSync(join(ex.dir, 'demo.mjs')))
  .map((ex) => ex.name);
// Ports again for exactly these names: scripts/examples.mjs numbers the ones it is given.
const examples = withDemos.length === 0 ? [] : listExamples(withDemos, options.port);
if (examples.length === 0) {
  console.error('No examples with a demo.mjs match.');
  process.exit(2);
}

const problems = [];
for (const ex of examples) {
  ex.demo = (await import(pathToFileURL(resolve(ex.dir, 'demo.mjs')).href)).default;
  problems.push(...validateDemo(ex.name, ex.demo));
}
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(2);
}

async function waitForServer(url, timeoutMs = 90_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server did not start: ${url}`);
}

const servers = spawn('node', ['scripts/examples.mjs', ...examples.map((ex) => ex.name)], {
  env: { ...process.env, EXAMPLES_PORT: String(options.port) },
  stdio: ['ignore', 'ignore', 'inherit'],
  detached: true, // own process group, so stopping kills every dev server under it
});
const stopServers = () => {
  try {
    process.kill(-(servers.pid ?? 0), 'SIGTERM');
  } catch {
    // already gone
  }
};

mkdirSync(OUT_DIR, { recursive: true });
const raw = join(OUT_DIR, '.raw');
const browser = await chromium.launch();
let failed = 0;
try {
  for (const ex of examples) {
    const base = `http://localhost:${String(ex.port)}`;
    await waitForServer(`${base}/`);
    for (const scene of ex.demo.scenes) {
      const stem = sceneStem(ex.name, scene.id, ex.demo.scenes.length);
      rmSync(raw, { recursive: true, force: true });
      const context = await browser.newContext({
        viewport: FRAME,
        deviceScaleFactor: 1,
        colorScheme: options.scheme,
        reducedMotion: 'no-preference',
        javaScriptEnabled: scene.javaScript !== false,
        recordVideo: { dir: raw, size: FRAME },
      });
      const page = await context.newPage();
      const posterPath = join(OUT_DIR, `${stem}.png`);
      let posterTaken = false;
      const helpers = {
        pause: (ms) => page.waitForTimeout(ms),
        poster: async () => {
          await page.screenshot({ path: posterPath });
          posterTaken = true;
        },
      };
      try {
        await page.goto(base + (scene.path ?? '/'), { waitUntil: 'networkidle' });
        await scene.run(page, helpers);
        if (!posterTaken) await helpers.poster();
        await page.waitForTimeout(400); // the last frame stays on screen briefly
        const video = page.video();
        await context.close(); // flushes the video file
        const videoPath = join(OUT_DIR, `${stem}.webm`);
        if (video !== null) renameSync(await video.path(), videoPath);
        console.log(`${stem.padEnd(28)} ${videoPath}  ${posterPath}`);
      } catch (error) {
        failed += 1;
        await context.close().catch(() => undefined);
        console.error(
          `${stem.padEnd(28)} FAILED: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
} finally {
  await browser.close();
  rmSync(raw, { recursive: true, force: true });
  stopServers();
}

for (const ex of examples)
  console.log(`\n${ex.name}\n  pitch: ${ex.demo.pitch}\n  usual: ${ex.demo.usual}`);
process.exit(failed > 0 ? 1 : 0);
