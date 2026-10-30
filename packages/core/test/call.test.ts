// `call(selector, method, ...args)` (view/05-element.md "Calling an element's method",
// gyral-1zd.27): a command that calls a method on an element of the component's own tree after
// the render, as data a model test can read. Failures go through the error channel (ADR 0024).
import { afterEach, describe, expect, it } from 'vitest';
import { call, define, html, settled, type CallInput } from '../src/index.js';
import { collectErrors } from './collect-errors.js';

// A plain element with a method, standing in for a media element or a third-party widget.
class Counter extends HTMLElement {
  count = 0;
  bump(by: number): number {
    this.count += by;
    return this.count;
  }
  boom(): void {
    throw new Error('boom');
  }
}
customElements.define('test-call-counter', Counter);

type Msg =
  | { readonly _tag: 'Bump'; readonly by: number }
  | { readonly _tag: 'Missing' }
  | { readonly _tag: 'NoMethod' }
  | { readonly _tag: 'Throws' };

const Host = define<null, Msg>()('test-call-host', {
  init: () => null,
  update: {
    Bump: (s, m) => [s, [call('test-call-counter', 'bump', m.by)]],
    Missing: (s) => [s, [call('#nope', 'bump', 1)]],
    NoMethod: (s) => [s, [call('test-call-counter', 'nope')]],
    Throws: (s) => [s, [call('test-call-counter', 'boom')]],
  },
  view: () => html`<test-call-counter></test-call-counter>`,
});

type HostElement = InstanceType<typeof Host> & { send(msg: Msg): void };

let el: HostElement | undefined;
afterEach(() => {
  el?.remove();
});

async function mount(): Promise<[HostElement, Counter]> {
  el = new Host();
  document.body.append(el);
  await settled();
  return [el, el.shadowRoot?.querySelector('test-call-counter') as Counter];
}

describe('call()', () => {
  it('is data: the selector, the method and the arguments', () => {
    const cmd = call('video', 'play');
    expect(cmd.input as CallInput).toEqual({ selector: 'video', method: 'play', args: [] });
  });

  it("calls the method on the component's element after the render", async () => {
    const [host, counter] = await mount();
    host.send({ _tag: 'Bump', by: 2 });
    host.send({ _tag: 'Bump', by: 3 });
    await settled();
    expect(counter.count).toBe(5);
  });

  it('reports a missing element, a missing method and a throwing method', async () => {
    const [host] = await mount();
    const collected = collectErrors();
    host.send({ _tag: 'Missing' });
    host.send({ _tag: 'NoMethod' });
    host.send({ _tag: 'Throws' });
    await settled();
    collected.stop();
    const { errors } = collected;
    expect(errors.map((e) => e.phase)).toEqual(['command', 'command', 'command']);
    expect(errors.map((e) => e.message)).toEqual([
      '<test-call-host> call("#nope", "bump") failed (G0085: https://gyral.dev/errors/#G0085)',
      '<test-call-host> call("test-call-counter", "nope") failed (G0085: https://gyral.dev/errors/#G0085)',
      '<test-call-host> call("test-call-counter", "boom") failed (G0085: https://gyral.dev/errors/#G0085)',
    ]);
    expect(String(errors[0]?.cause)).toMatch(/no element matches #nope/);
    expect(errors[1]?.cause).toBeInstanceOf(TypeError); // nope is not a function
    expect(String(errors[2]?.cause)).toMatch(/boom/);
  });

  it('rejects arguments that are not plain data in development', () => {
    expect(() => call('x', 'y', () => 1)).toThrow(/must be plain data/);
  });
});
