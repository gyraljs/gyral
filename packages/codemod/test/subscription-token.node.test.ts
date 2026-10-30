/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { expectUnchanged, migrate, source } from './helpers.js';

describe('subscription-token: rewrites', () => {
  it("subscription('name', fn) → subscription(token, fn) for a token of this module", () => {
    const { code, findings } = migrate(source`
      import { defineDriver, subscription } from '@gyral/core';

      export const feed = defineDriver<void, string>('feed');
      const ticks = defineDriver<void, number>({ name: 'ticks' });

      export const feedDriver = subscription('feed', (emit) => source.listen(emit));
      export function start() {
        return [subscription(\`ticks\`, (emit) => every(emit), { coalesce: 'frame' })];
      }
    `);
    expect(code).toBe(source`
      import { defineDriver, subscription } from '@gyral/core';

      export const feed = defineDriver<void, string>('feed');
      const ticks = defineDriver<void, number>({ name: 'ticks' });

      export const feedDriver = subscription(feed, (emit) => source.listen(emit));
      export function start() {
        return [subscription(ticks, (emit) => every(emit), { coalesce: 'frame' })];
      }
    `);
    expect(findings).toEqual([]);
  });

  it('runs together with the driver-list rewrite of the same record', () => {
    const { code } = migrate(source`
      import { defineDriver, provideDrivers, subscription } from '@gyral/core';

      const feed = defineDriver<void, string>('feed');
      provideDrivers(root, { feed: subscription('feed', listen) });
    `);
    expect(code).toContain('provideDrivers(root, [subscription(feed, listen)]);');
  });
});

describe('subscription-token: shadowing', () => {
  it('leaves a call where another declaration of the token’s name is in scope', () => {
    const { code, findings } = migrate(source`
      import { defineDriver, subscription } from '@gyral/core';

      const feed = defineDriver<void, string>('feed');
      export function make(feed: string) {
        return subscription('feed', (emit) => emit(feed));
      }
      export const ok = subscription('feed', listen);
    `);
    expect(code).toContain('export const ok = subscription(feed, listen);');
    expect(code).toContain("return subscription('feed', (emit) => emit(feed));");
    expect(findings).toEqual([
      '5 [subscription-token] another `feed` is declared around this call; pass the token by hand',
    ]);
  });
});

describe('subscription-token: left as is', () => {
  // gyral-0dj: a token declared in another module was left without a word (peerweave). A string
  // name with its own implementation is a documented form, so only a name that this module
  // imports, or a token of that name in scope that the rewrite can't pass, is reported.
  it('reports a name imported or declared out of reach, and leaves the documented form', () => {
    expect(
      expectUnchanged(source`
        import { defineDriver, subscription } from '@gyral/core';
        import { cart } from './tokens.js';

        const feed = defineDriver<void, string>('feed');
        const impl = defineDriver({ name: 'impl', run: () => 1 });
        export const a = subscription('cart', listen);
        export const b = subscription('news', listen);
        export const c = subscription('impl', listen);
        export const d = other('feed', listen);
        export function make() {
          const lane = defineDriver<void, string>({ name: 'lane' });
          return [lane, subscription('lane', listen)];
        }
        let clock = defineDriver<void, number>('clock');
        export const e = subscription('clock', tick);
        export const f = () => subscription('lane', listen);
      `),
    ).toEqual([
      "6 [subscription-token] `cart` is imported from ./tokens.js, so whether it's the token for 'cart' isn't known in this module; if it is, pass it: subscription(cart, …)",
      "12 [subscription-token] token `lane` (line 11) is declared inside a function or with `let`, where the codemod doesn't pass it; pass it by hand: subscription(lane, …)",
      "15 [subscription-token] token `clock` (line 14) is declared inside a function or with `let`, where the codemod doesn't pass it; pass it by hand: subscription(clock, …)",
    ]);
  });

  it('reports type arguments, policies, ordering, duplicates and foreign subscription()', () => {
    const findings = expectUnchanged(source`
      import { defineDriver, subscription } from '@gyral/core';
      import { subscription as sub } from 'other-lib';

      export const early = subscription('late', listen);
      const late = defineDriver<void, string>('late');
      const feed = defineDriver<void, string>('feed');
      const lane = defineDriver<void, string>({ name: 'lane', concurrency: 'merge' });
      const a = defineDriver<void, string>('twin');
      const b = defineDriver<void, string>('twin');
      export const typed = subscription<string>('feed', listen);
      export const policy = subscription('lane', listen);
      export const twin = subscription('twin', listen);
      export function local(subscription: (n: string, f: unknown) => void) {
        subscription('feed', listen);
      }
    `);
    expect(findings).toEqual([
      '4 [subscription-token] token `late` is declared after this call',
      "10 [subscription-token] explicit type arguments: subscription<O, I, E, V>('feed', …) and subscription<I, O, E, V>(feed, …) order them differently; drop them and pass `feed` by hand",
      "11 [subscription-token] token `lane` sets more than its name (concurrency, toError), which subscription(lane, …) would adopt; pass it by hand if that's intended",
      "12 [subscription-token] 2 tokens are named 'twin'; pass the right one by hand",
      "14 [subscription-token] `subscription` here isn't provably @gyral/core's; pass the token by hand",
    ]);
  });
});
