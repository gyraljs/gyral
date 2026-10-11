import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { hashes, save } from './corpus.mjs';
import { IMAGE, sandbox } from './sandbox.mjs';
import { browserCases } from './browser.mjs';

export function command(args, timeout = 90_000) {
  return new Promise((resolveResult) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);
    const capture = (chunk) => {
      if (log.length < 200_000) log += chunk.toString();
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolveResult({ code: null, log: String(error), infrastructure: true });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveResult({
        code,
        log,
        timedOut,
        infrastructure: code === null || [125, 126, 127].includes(code),
      });
    });
  });
}

async function staticServer(dir) {
  const root = realpathSync(dir);
  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
  };
  const server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (
        !file.startsWith(root + sep) ||
        !existsSync(file) ||
        !realpathSync(file).startsWith(root + sep)
      ) {
        response.writeHead(404).end();
        return;
      }
      response
        .writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' })
        .end(readFileSync(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolveClosed) => server.close(resolveClosed)),
  };
}

export async function grade(corpus, workspace, framework, task, output, maxMs = 240000) {
  const deadline = Date.now() + maxMs;
  const remaining = () => Math.max(1, Math.min(90000, deadline - Date.now()));
  mkdirSync(output, { recursive: true });
  mkdirSync(join(output, 'dist'));
  const name = `gyral-pilot-${process.pid}-${Date.now()}`;
  const common = [
    ...sandbox(corpus, workspace, framework),
    '--name',
    name,
    '--mount',
    `type=bind,src=${resolve(output, 'dist')},dst=/output`,
    IMAGE,
  ];
  const typeArgs =
    framework === 'svelte'
      ? ['node', '/app/node_modules/svelte-check/bin/svelte-check', '--tsconfig', './tsconfig.json']
      : ['node', '/app/node_modules/typescript/bin/tsc', '--noEmit'];
  const type = await command([...common, ...typeArgs], remaining());
  writeFileSync(join(output, 'type.log'), type.log);
  if (type.timedOut) await command(['rm', '-f', name], 5000);
  const build = await command(
    [
      ...common,
      'node',
      '/app/node_modules/vite/bin/vite.js',
      'build',
      '--configLoader',
      'runner',
      '--outDir',
      '/output',
      '--emptyOutDir',
    ],
    remaining(),
  );
  writeFileSync(join(output, 'build.log'), build.log);
  if (build.timedOut) await command(['rm', '-f', name], 5000);
  const result = {
    sourceHashes: hashes(workspace),
    type: { ...type, log: 'type.log' },
    build: { ...build, log: 'build.log' },
    browser: null,
    passed: false,
  };
  if (build.code === 0) {
    const server = await staticServer(join(output, 'dist'));
    let browser;
    let timer;
    try {
      browser = await chromium.launch({ headless: true });
      timer = setTimeout(() => {
        void browser.close();
      }, remaining());
      result.browser = await browserCases(browser, server.url, task, output);
    } catch (error) {
      result.browser = { passed: false, infrastructure: true, error: String(error) };
    } finally {
      clearTimeout(timer);
      await browser?.close();
      await server.close();
    }
  }
  result.passed = type.code === 0 && build.code === 0 && result.browser?.passed === true;
  result.infrastructure = Boolean(
    type.infrastructure || build.infrastructure || result.browser?.infrastructure,
  );
  save(join(output, 'grade.json'), result);
  return result;
}

export function feedback(result) {
  return {
    passed: result.passed,
    infrastructure: result.infrastructure,
    type: result.type.code,
    build: result.build.code,
    cases: result.browser?.cases?.map(({ name, passed, error }) => ({ name, passed, error })) ?? [],
    pageErrors: result.browser?.pageErrors ?? [],
  };
}
