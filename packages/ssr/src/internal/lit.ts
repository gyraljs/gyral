// The only module that touches @lit-labs/ssr (a labs package): ADR 0005 keeps labs APIs
// behind a thin adapter so an upstream change is a one-file fix.
import { render } from '@lit-labs/ssr';
import type { RenderResult } from '@lit-labs/ssr/lib/render-result.js';

export { html as serverHtml } from '@lit-labs/ssr';

/** Renders any Lit value (templates, custom elements with DSD) as a stream of HTML chunks. */
export async function* renderChunks(value: unknown): AsyncGenerator<string, void, undefined> {
  yield* flatten(render(value));
}

async function* flatten(result: RenderResult): AsyncGenerator<string, void, undefined> {
  for (const chunk of result) {
    if (typeof chunk === 'string') yield chunk;
    else yield* flatten(await chunk);
  }
}
