// With ./light.ts, the only modules that touch @lit-labs/ssr (a labs package): ADR 0005 keeps
// labs APIs behind a thin adapter so an upstream change is a contained fix.
import { LitElementRenderer, render } from '@lit-labs/ssr';
import type { RenderResult } from '@lit-labs/ssr/lib/render-result.js';
import { GyralLightRenderer, LightFilter } from './light.js';

// Light-DOM components first (ADR 0014); everything else is a regular LitElement.
const elementRenderers = [GyralLightRenderer, LitElementRenderer];

export { html as serverHtml } from '@lit-labs/ssr';

/** Runs one synchronous render step inside a scope (the request's stores, ADR 0013). */
export type StepScope = <T>(step: () => T) => T;

const unscoped: StepScope = (step) => step();

/**
 * Renders any Lit value (templates, custom elements with DSD) as a stream of HTML chunks.
 * Components render while the result is iterated, so every iteration step runs in `scope`:
 * two interleaved requests each see only their own scope.
 */
export async function* renderChunks(
  value: unknown,
  scope: StepScope = unscoped,
): AsyncGenerator<string, void, undefined> {
  const filter = new LightFilter();
  for await (const chunk of flatten(
    scope(() => render(value, { elementRenderers })),
    scope,
  )) {
    const out = filter.push(chunk);
    if (out !== '') yield out;
  }
  const rest = filter.flush();
  if (rest !== '') yield rest;
}

async function* flatten(
  result: RenderResult,
  scope: StepScope,
): AsyncGenerator<string, void, undefined> {
  const iterator = result[Symbol.iterator]();
  for (;;) {
    const next = scope(() => iterator.next());
    if (next.done === true) return;
    const chunk = next.value;
    if (typeof chunk === 'string') yield chunk;
    else yield* flatten(await chunk, scope);
  }
}
