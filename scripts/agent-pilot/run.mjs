import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashes, save, sha256, sourceSnapshot } from './corpus.mjs';
import { ordering } from './prompts.mjs';
import { randomBytes } from 'node:crypto';
import { credentials, LIMITS } from './provider.mjs';
import { trial } from './agent.mjs';
import { POLICY } from './context.mjs';
import { MOCK_CONFIG, mockComplete } from './mock.mjs';
import { report } from './report.mjs';

export function verifyFrozen(corpus) {
  const frozen = JSON.parse(readFileSync(join(corpus, 'frozen.json')));
  assert.deepEqual(sourceSnapshot(), frozen.sourceHashes, 'Harness changed since corpus freeze');
  assert.deepEqual(hashes(corpus), frozen.corpusHashes, 'Corpus changed since freeze');
  assert.equal(frozen.validated, true, 'Local positive/negative validation required');
  assert.equal(frozen.protocol, 'v3', 'Prepare a protocol v3 corpus');
  return frozen;
}

export async function runPilot(
  corpus,
  output,
  credentialFile,
  resume = false,
  priorOutput,
  { mock = false } = {},
) {
  const frozen = verifyFrozen(corpus);
  // Mock mode never reads credentials or contacts a provider; its random key only feeds the
  // credential-leak check.
  const config = mock
    ? { ...MOCK_CONFIG, apiKey: randomBytes(24).toString('hex') }
    : credentials(credentialFile);
  let plan;
  if (resume) {
    plan = JSON.parse(readFileSync(join(output, 'plan.json')));
    assert.equal(plan.corpusHash, sha256(JSON.stringify(frozen)));
    assert.equal(plan.model, config.model);
    assert.equal(plan.endpoint, config.baseUrl);
    assert.deepEqual(plan.limits, LIMITS);
    assert.deepEqual(plan.policy, POLICY);
    assert.equal(Boolean(plan.mock), mock, 'Do not mix mock and measured runs');
  } else {
    mkdirSync(output);
    plan = {
      version: 3,
      protocol: 'v3',
      mock,
      ...(mock
        ? {
            notice:
              'MOCK harness validation: scripted agent, no model requests, not a measured run.',
          }
        : {}),
      createdAt: new Date().toISOString(),
      model: config.model,
      endpoint: config.baseUrl,
      limits: LIMITS,
      policy: POLICY,
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
    await trial(corpus, destination, run, config, mock ? { complete: mockComplete(run) } : {});
    console.log(`${report(output, plan).attempted}/36 completed`);
  }
  return report(output, plan);
}
