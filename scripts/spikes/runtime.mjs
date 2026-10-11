// gyral-1zd.13: the same server bundle runs in Node, Deno and workerd, with no DOM shim.
import { define, defineStore, html, prop } from '@gyral/core';
import { renderPage, renderToString } from '@gyral/ssr';

const locale = defineStore('platform-locale', {
  init: () => ({ label: 'default' }),
  update: {},
});

define()('platform-label', {
  props: { label: prop.string({ default: 'fallback' }) },
  stores: [locale],
  init: () => ({}),
  view: (_s, _i, { props, read }) =>
    html`<p>${props.label}: ${read(locale).label}</p>
      <slot></slot>`,
});

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

export async function runChecks() {
  const body = html`<platform-label label="Hello"><bdi>slotted</bdi></platform-label>`;
  const render = (label) =>
    renderPage({
      title: 'Platform spike',
      body,
      stores: [locale.instance({ label })],
      csp: { directives: { 'default-src': "'self'", 'object-src': "'none'" } },
    });
  const first = render('first');
  const second = render('second');
  assert(first.body instanceof ReadableStream, 'missing native stream');
  assert(first.headers.get('content-security-policy')?.includes("object-src 'none'"), 'CSP');
  const reader = first.body.getReader();
  const decoder = new TextDecoder();
  let chunks = 0;
  let text = '';
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    chunks += 1;
    text += decoder.decode(part.value, { stream: true });
  }
  text += decoder.decode();
  text = text.replace(/<!--.*?-->/gs, '');
  assert(chunks > 1, 'page was not pulled in chunks');
  assert(text.includes('shadowrootmode="open"'), 'missing declarative shadow root');
  assert(text.includes('Hello: first') && text.includes('<bdi>slotted</bdi>'), 'SSR content');
  assert(text.includes('data-gyral-stores'), 'missing store seed');
  const other = (await second.text()).replace(/<!--.*?-->/gs, '');
  assert(other.includes('Hello: second') && !other.includes('Hello: first'), 'store isolation');
  assert(
    (await renderToString(body)).replace(/<!--.*?-->/gs, '').includes('Hello: default'),
    'string render scope',
  );
  const cancelled = render('cancelled').body.getReader();
  await cancelled.read();
  await cancelled.cancel();
  return { ok: true, chunks, dsd: true, stores: true, csp: true, cancellation: true };
}

export default { fetch: async () => Response.json(await runChecks()) };
