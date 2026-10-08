// Rendered in Node by the renderOnServer command and hydrated in the browser by
// render-on-server-hydration.test.ts: the same module on both sides, as in an app.
import { css, define, html, prop } from '@gyral/core';

interface State {
  readonly count: number;
}
type Msg = { readonly _tag: 'Increment' };
interface Props {
  readonly start: number | undefined;
  readonly label: string | undefined;
}

export const Counter = define<State, Msg, Props>('test-server-counter', {
  props: { start: prop.number(), label: prop.string() },
  init: (p) => ({ count: p.start ?? 0 }),
  intent: { Increment: () => ({ _tag: 'Increment' }) },
  update: { Increment: (s) => ({ count: s.count + 1 }) },
  styles: css`
    output {
      font-weight: bold;
    }
  `,
  view: (s, i, { props }) =>
    html`<p>${props.label ?? 'Count'}: <output>${s.count}</output></p>
      <button type="button" data-intent=${i.Increment}>Add one</button>`,
});

/** A function export: called with the request's props, returns a template result. */
export const page = (props: { readonly heading: string; readonly start: number }) =>
  html`<main>
    <h1>${props.heading}</h1>
    <test-server-counter .start=${props.start} .label=${'Apples'}></test-server-counter>
    <test-server-counter .start=${props.start * 10} .label=${'Pears'}></test-server-counter>
  </main>`;

/** A function returning HTML text, as a page shell or an app's fetch handler would. */
export const shell = (props: { readonly title: string }) =>
  Promise.resolve(
    new Response(
      `<!doctype html><html><head><title>${props.title}</title>` +
        '<meta name="csrf-token" content="t-1"></head><body><p>static</p></body></html>',
    ),
  );

export default html`<p class="plain">a template result</p>`;
