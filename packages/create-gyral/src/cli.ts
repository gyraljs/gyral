#!/usr/bin/env node
/// <reference types="node" />
// `npm create gyral@latest [dir] -- [--template basic|ssr] [--yes]`
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { isTemplate, parse, TEMPLATES, USAGE, type Template } from './args.js';
import { invalidPackageName, toPackageName } from './names.js';
import { detectPackageManager, nextSteps } from './package-manager.js';
import { isEmptyDir, scaffold } from './scaffold.js';

const DEFAULT_DIR = 'gyral-app';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

function fail(message: string): never {
  console.error(`create-gyral: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const parsed = parse(process.argv.slice(2));
  if (!parsed.ok) fail(`${parsed.error}\n\n${USAGE}`);
  const { options } = parsed;
  if (options.help) {
    console.log(USAGE);
    return;
  }
  if (options.version) {
    console.log(version);
    return;
  }

  const interactive = process.stdin.isTTY && process.stdout.isTTY && !options.yes;
  const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  try {
    let dir = options.dir;
    while (dir === undefined && rl !== null) {
      const answer = (await rl.question(`Project directory (${DEFAULT_DIR}): `)).trim();
      const candidate = answer === '' ? DEFAULT_DIR : answer;
      if (await isEmptyDir(resolve(candidate))) dir = candidate;
      else console.log(`  ${candidate} is not empty; choose another directory.`);
    }
    dir ??= DEFAULT_DIR;

    let template: Template | undefined = options.template;
    while (template === undefined && rl !== null) {
      const answer = (await rl.question(`Template (${TEMPLATES.join(' / ')}) (basic): `)).trim();
      const candidate = answer === '' ? 'basic' : answer;
      if (isTemplate(candidate)) template = candidate;
      else console.log(`  Choose ${TEMPLATES.join(' or ')}.`);
    }
    template ??= 'basic';

    const targetDir = resolve(dir);
    const packageName = toPackageName(targetDir);
    const problem = invalidPackageName(packageName);
    if (problem !== undefined) fail(`can't name the package "${packageName}": ${problem}`);

    await scaffold({ targetDir, template, packageName, gyralVersion: version });

    const pm = detectPackageManager(process.env['npm_config_user_agent']);
    const shown = relative(process.cwd(), targetDir) || '.';
    console.log(`\nCreated ${packageName} (${template} template) in ${shown}. Next:\n`);
    for (const step of nextSteps(pm, shown, template === 'basic')) console.log(`  ${step}`);
    console.log('\nDocs: https://gyral.dev/docs/getting-started/');
  } finally {
    rl?.close();
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
