// The browser-prod project runs core's sources as its published production build (dist/prod/,
// gyral-gpr): each module without its development code (vitest.config.ts). The `*.prod.test.ts`
// and hydration tests there see what production apps run, whatever the bundler.
import { expect, it } from 'vitest';

/** A module of core as the test page gets it. */
const served = async (path: string): Promise<string> =>
  (await fetch(new URL(path, import.meta.url))).text();

it("serves core's modules without their development code", async () => {
  const render = await served('../src/view/render/render.ts');
  expect(render).toContain('function renderBatch');
  expect(render).not.toMatch(/checkSkippedView|dev-check|dev-off|\bDEV\b/);
  const define = await served('../src/define.ts');
  expect(define).toContain('function define');
  expect(define).not.toContain('undefined-tags');
  const host = await served('../src/host-model.ts');
  expect(host).not.toMatch(/devUpdate|DEVTOOLS_ENABLED/);
});
