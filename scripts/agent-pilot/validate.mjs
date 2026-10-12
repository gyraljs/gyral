import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FRAMEWORKS,
  GENERATED_DIR,
  TASKS,
  fixtureSource,
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
  // H6: an exported component split over two files writes generated element typings. Only
  // the isolated generated mount is writable; each grade gets a fresh one (cache lifecycle).
  const id = 'gyral-feature-exported-multifile';
  const dir = join(output, id);
  workspace(corpus, dir, 'gyral', 'feature', true);
  const source = fixtureSource('gyral', 'feature', true);
  const mount = "document.querySelector('main')?.append(new App());";
  assert.ok(source.includes('export const App') && source.includes(mount));
  writeFileSync(join(dir, 'src/app.ts'), source.replace(mount, ''));
  writeFileSync(join(dir, 'src/main.ts'), `import { App } from './app';\n\n${mount}\n`);
  for (const attempt of [1, 2]) {
    console.log(`Validating ${id} (${attempt})`);
    const checks = join(output, `${id}-checks-${attempt}`);
    const result = await grade(corpus, dir, 'gyral', 'feature', checks);
    results.push({ id: `${id}-${attempt}`, ...result });
    save(join(output, 'validation.json'), results);
    assert.equal(result.passed, true, `${id}: exported multi-file component must pass`);
    assert.equal(result.infrastructure, false, `${id}: no sandbox failure`);
    assert.deepEqual(result.generated, ['elements.d.ts'], `${id}: generated typings expected`);
    assert.deepEqual(readdirSync(join(dir, GENERATED_DIR)), [], `${id}: app tree untouched`);
  }
  console.log(
    `All ${results.length} scaffold/reference/live-region/exported-component checks matched the expected outcomes.`,
  );
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
