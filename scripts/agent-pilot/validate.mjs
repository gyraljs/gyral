import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FRAMEWORKS,
  TASKS,
  hashes,
  save,
  sourceSnapshot,
  targetFile,
  workspace,
} from './corpus.mjs';
import { grade } from './grader.mjs';

export async function validate(corpus, output) {
  mkdirSync(output);
  const sourceHashes = sourceSnapshot();
  const corpusHashes = hashes(corpus);
  const results = [];
  for (const reference of [true, false]) {
    for (const framework of FRAMEWORKS) {
      for (const task of TASKS) {
        const id = `${framework}-${task}-${reference ? 'reference' : 'starter'}`;
        const dir = join(output, id);
        workspace(corpus, dir, framework, task, reference);
        console.log(`Validating ${id}`);
        const result = await grade(corpus, dir, framework, task, join(output, `${id}-checks`));
        results.push({ id, ...result });
        save(join(output, 'validation.json'), results);
        assert.equal(result.type.code, 0, `${id}: typecheck failed`);
        assert.equal(result.build.code, 0, `${id}: build failed`);
        assert.equal(result.passed, reference, `${id}: unexpected oracle outcome`);
        if (!reference && task === 'bug') {
          const failed = result.browser.cases
            .filter((test) => !test.passed)
            .map((test) => test.name);
          assert.deepEqual(
            failed,
            ['filtered task identity'],
            `${id}: seed must contain only the identity bug`,
          );
        }
      }
    }
  }
  for (const framework of FRAMEWORKS) {
    for (const task of ['feature', 'form']) {
      const id = `${framework}-${task}-live-region`;
      const dir = join(output, id);
      workspace(corpus, dir, framework, task, true);
      const file = join(dir, targetFile(framework));
      writeFileSync(
        file,
        readFileSync(file, 'utf8')
          .replaceAll('role="status"', 'aria-live="polite"')
          .replaceAll('role="alert"', 'aria-live="assertive"'),
      );
      console.log(`Validating ${id}`);
      const result = await grade(corpus, dir, framework, task, join(output, `${id}-checks`));
      results.push({ id, ...result });
      save(join(output, 'validation.json'), results);
      assert.equal(result.passed, true, `${id}: equivalent live-region markup must pass`);
    }
  }
  console.log('All 24 scaffold/reference/live-region checks matched the expected outcomes.');
  assert.deepEqual(sourceSnapshot(), sourceHashes, 'Harness changed during validation');
  assert.deepEqual(hashes(corpus), corpusHashes, 'Corpus changed during validation');
  save(join(output, 'validation-manifest.json'), {
    passed: true,
    sourceHashes,
    corpusHashes,
    results: results.map(({ id, passed }) => ({ id, passed })),
  });
  return results;
}
