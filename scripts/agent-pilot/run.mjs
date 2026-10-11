import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashes, save, sha256, sourceSnapshot } from './corpus.mjs';
import { ordering } from './prompts.mjs';
import { credentials, LIMITS } from './provider.mjs';
import { trial } from './agent.mjs';
import { report } from './report.mjs';

export function verifyFrozen(corpus) {
  const frozen = JSON.parse(readFileSync(join(corpus, 'frozen.json')));
  assert.deepEqual(sourceSnapshot(), frozen.sourceHashes, 'Harness changed since corpus freeze');
  assert.deepEqual(hashes(corpus), frozen.corpusHashes, 'Corpus changed since freeze');
  assert.equal(frozen.validated, true, 'Local positive/negative validation required');
  return frozen;
}

export async function runPilot(corpus, output, credentialFile, resume = false, priorOutput) {
  const frozen = verifyFrozen(corpus);
  const config = credentials(credentialFile);
  let plan;
  if (resume) {
    plan = JSON.parse(readFileSync(join(output, 'plan.json')));
    assert.equal(plan.corpusHash, sha256(JSON.stringify(frozen)));
    assert.equal(plan.model, config.model);
    assert.equal(plan.endpoint, config.baseUrl);
    assert.deepEqual(plan.limits, LIMITS);
  } else {
    mkdirSync(output);
    plan = {
      version: 1,
      createdAt: new Date().toISOString(),
      model: config.model,
      endpoint: config.baseUrl,
      limits: LIMITS,
      monetaryCap: null,
      ownerAuthorizedUnlimited: true,
      corpusHash: sha256(JSON.stringify(frozen)),
      frozen,
      orderingSeed: 20261011,
      runs: ordering(),
    };
    save(join(output, 'plan.json'), plan);
    if (priorOutput) {
      const prior = JSON.parse(readFileSync(join(priorOutput, 'plan.json')));
      const attempts = prior.runs
        .filter((run) => existsSync(join(priorOutput, run.id, 'result.json')))
        .map((run) => JSON.parse(readFileSync(join(priorOutput, run.id, 'result.json'))));
      plan.invalidated = {
        reason:
          'Initial byte-only context guard stopped below the model window; the oracle also rejected valid aria-live markup. Revised and revalidated before restarting.',
        authorization:
          'Owner authorized completion of the pilot and unlimited monetary spend. Harness correction required replacement trials; all initial evidence remains available.',
        attempted: attempts.length,
        sourceCommit: prior.frozen.sourceCommit,
        results: attempts,
      };
      cpSync(priorOutput, join(output, 'invalidated'), { recursive: true });
      save(join(output, 'plan.json'), plan);
    }
    cpSync(join(corpus, 'docs'), join(output, 'frozen-docs'), { recursive: true });
    for (const framework of ['gyral', 'react', 'svelte']) {
      mkdirSync(join(output, 'locks'), { recursive: true });
      cpSync(
        join(corpus, 'seeds', framework, 'package-lock.json'),
        join(output, 'locks', `${framework}.json`),
      );
    }
  }
  for (const run of plan.runs) {
    const destination = join(output, run.id);
    if (existsSync(join(destination, 'result.json'))) continue;
    if (existsSync(destination))
      throw new Error(
        `Interrupted run ${run.id} retained. Review evidence; do not silently replace it.`,
      );
    verifyFrozen(corpus);
    await trial(corpus, destination, run, config);
    console.log(`${report(output, plan).attempted}/36 completed`);
  }
  return report(output, plan);
}
