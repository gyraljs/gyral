#!/usr/bin/env node
/// <reference types="node" />
// `npx @gyral/codemod <release> [paths…] [--dry] [--force]`
import { readFileSync } from 'node:fs';
import { parse, usage } from './args.js';
import { formatReport } from './report.js';
import { runCodemod } from './run.js';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

async function main(): Promise<number> {
  const parsed = parse(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`gyral-codemod: ${parsed.error}\n\n${usage()}`);
    return 1;
  }
  const { release, paths, dry, force, help } = parsed.options;
  if (parsed.options.version) {
    console.log(version);
    return 0;
  }
  if (help || release === undefined) {
    console.log(usage());
    return 0;
  }
  const result = await runCodemod({ release, paths, dry, force });
  if (!result.ok) {
    console.error(`gyral-codemod: ${result.error}`);
    return 1;
  }
  if (result.diff !== '') process.stdout.write(`${result.diff}\n`);
  console.log(formatReport({ release, dry, ...result }));
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`gyral-codemod: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
