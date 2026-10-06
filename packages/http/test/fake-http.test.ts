import { afterEach, describe, expect, it, vi } from 'vitest';
import * as v from 'valibot';
import { define, html, settled } from '@gyral/core';
import { request, type HttpError } from '../src/index.js';
import { FakeHttpResponderError, fakeHttp } from '../src/testing.js';

const Count = v.object({ count: v.pipe(v.string(), v.transform(Number), v.number()) });
const Problem = v.object({ code: v.string() });

type Msg =
  | { readonly _tag: 'Load' }
  | { readonly _tag: 'Loaded'; readonly count: number }
  | { readonly _tag: 'Failed'; readonly error: HttpError };
interface State {
  readonly count: number | undefined;
  readonly error: HttpError | undefined;
}

const Loader = define<State, Msg>('test-fake-http', {
  init: () => ({ count: undefined, error: undefined }),
  intent: {},
  update: {
    Load: (s) => [
      s,
      [
        request(
          { url: '/count' },
          {
            schema: Count,
            errorSchema: Problem,
            onSuccess: (body) => ({ _tag: 'Loaded', count: body.count }),
            onFailure: (error) => ({ _tag: 'Failed', error }),
          },
        ),
      ],
    ],
    Loaded: (_s, m) => ({ count: m.count, error: undefined }),
    Failed: (_s, m) => ({ count: undefined, error: m.error }),
  },
  view: (s) => html`<p>${s.count ?? s.error?._tag ?? '…'}</p>`,
});

async function mount() {
  const http = fakeHttp();
  const el = new Loader();
  el.drivers = { http };
  document.body.append(el);
  await settled();
  el.send({ _tag: 'Load' });
  await vi.waitFor(() => {
    expect(http.requests).toHaveLength(1);
  });
  return { http, el };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('fakeHttp() decodes like the real driver (gyral-czi.36)', () => {
  it('decodes the body through the request schema', async () => {
    const { http, el } = await mount();
    expect(http.requests[0]?.url).toBe('/count');
    http.respondNext({ body: { count: '42' } });
    await vi.waitFor(() => {
      expect(el.state.count).toBe(42); // the schema's transform ran
    });
  });

  it('turns wrong fake data into an HttpDecodeError instead of crashing the view', async () => {
    const { http, el } = await mount();
    http.respondNext({ body: { count: 42 } }); // a number, but the schema wants a string
    await vi.waitFor(() => {
      expect(el.state.error?._tag).toBe('HttpDecodeError');
    });
    await settled();
    expect(el.shadowRoot?.querySelector('p')?.textContent).toBe('HttpDecodeError');
  });

  it('decodes error bodies through errorSchema', async () => {
    const { http, el } = await mount();
    http.respondNext({ status: 422, body: { code: 'too-many' } });
    await vi.waitFor(() => {
      expect(el.state.error).toMatchObject({
        _tag: 'HttpStatusError',
        status: 422,
        detail: { code: 'too-many' },
      });
    });
  });

  it('fails a request as a network error', async () => {
    const { http, el } = await mount();
    http.failNext('offline');
    await vi.waitFor(() => {
      expect(el.state.error).toMatchObject({ _tag: 'HttpNetworkError', message: 'offline' });
    });
  });

  it('answers every request at once with `respond`, and skips aborted calls', async () => {
    const auto = fakeHttp({ respond: () => ({ body: { count: '7' } }) });
    const el = new Loader();
    el.drivers = { http: auto };
    document.body.append(el);
    await settled();
    el.send({ _tag: 'Load' });
    await vi.waitFor(() => {
      expect(el.state.count).toBe(7);
    });

    const { http, el: other } = await mount();
    other.remove(); // aborts the in-flight request
    await vi.waitFor(() => {
      expect(http.calls[0]?.signal.aborted).toBe(true);
    });
    expect(() => {
      http.respondNext({ body: { count: '1' } });
    }).toThrow(/no waiting request/);
  });

  it('exposes inputs like fakeDriver and answers non-200s with reply()', async () => {
    const { http, el } = await mount();
    expect(http.inputs).toEqual(http.requests);
    http.reply(422, { code: 'nope' });
    await vi.waitFor(() => {
      expect(el.state.error).toMatchObject({ _tag: 'HttpStatusError', status: 422 });
    });
  });

  it('reports a throwing responder as a test bug, and still fails the request', async () => {
    const seen: unknown[] = [];
    const broken = fakeHttp({
      respond: () => {
        throw new Error('typo in test');
      },
      onResponderError: (error) => seen.push(error),
    });
    const el = new Loader();
    el.drivers = { http: broken };
    document.body.append(el);
    await settled();
    el.send({ _tag: 'Load' });
    await vi.waitFor(() => {
      expect(el.state.error?._tag).toBe('HttpNetworkError');
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(FakeHttpResponderError);
    expect(String((seen[0] as Error).cause)).toContain('typo in test');
    expect(broken.responderErrors).toHaveLength(1);
  });
});
