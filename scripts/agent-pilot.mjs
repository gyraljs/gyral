#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { GYRAL_VERSION, hashes, prepare, save, sourceSnapshot } from './agent-pilot/corpus.mjs';
import { validate } from './agent-pilot/validate.mjs';
import { runPilot } from './agent-pilot/run.mjs';
import { report } from './agent-pilot/report.mjs';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    corpus: { type: 'string' },
    out: { type: 'string' },
    credentials: { type: 'string' },
    validation: { type: 'string' },
    prior: { type: 'string' },
    resume: { type: 'boolean', default: false },
    mock: { type: 'boolean', default: false },
    'gyral-version': { type: 'string' },
  },
});
const command = positionals[0];
const required = (key) => {
  if (!values[key]) throw new Error(`--${key} is required`);
  return resolve(values[key]);
};
if (command === 'prepare')
  await prepare(required('out'), { gyral: values['gyral-version'] ?? GYRAL_VERSION });
else if (command === 'validate') await validate(required('corpus'), required('out'));
else if (command === 'freeze') {
  const corpus = required('corpus');
  const validation = JSON.parse(
    readFileSync(join(required('validation'), 'validation-manifest.json')),
  );
  assert.equal(validation.passed, true);
  assert.deepEqual(validation.sourceHashes, sourceSnapshot());
  assert.deepEqual(validation.corpusHashes, hashes(corpus));
  const file = join(corpus, 'frozen.json');
  const frozen = JSON.parse(readFileSync(file));
  save(file, {
    ...frozen,
    frozenAt: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceHashes: validation.sourceHashes,
    corpusHashes: validation.corpusHashes,
    validated: true,
    validation,
  });
} else if (command === 'run')
  console.log(
    await runPilot(
      required('corpus'),
      required('out'),
      values.mock ? undefined : required('credentials'),
      values.resume,
      values.prior ? resolve(values.prior) : undefined,
      { mock: values.mock },
    ),
  );
else if (command === 'report') {
  const out = required('out');
  console.log(report(out, JSON.parse(readFileSync(join(out, 'plan.json')))));
} else
  throw new Error(
    'Use prepare, validate, freeze, run or report. See docs/references/agent-benchmark-pilot-v3.md.',
  );
