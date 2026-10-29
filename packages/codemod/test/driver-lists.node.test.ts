/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { isTestFile } from '../src/transforms/0.3.8/driver-lists.js';
import { expectUnchanged, migrate, source } from './helpers.js';

describe('driver-list: rewrites', () => {
  it('turns records whose keys are their drivers’ names into lists', () => {
    const { code, findings } = migrate(source`
      import { defineDriver, provideDrivers, subscription } from '@gyral/core';
      import { fakeDriver } from '@gyral/testing';

      export const session = defineDriver<string, number>('session');
      const feed = defineDriver<void, string>({ name: 'feed' });
      const clock = defineDriver({ name: 'clock', run: () => Date.now() });

      provideDrivers(document.body, {
        session: session.provide((input) => input.length),
        feed: subscription(feed, (emit) => listen(emit)),
        clock,
      });
      provideDrivers(root, { log: fakeDriver('log'), 'ticks': subscription('ticks', tick) });
      el.drivers = { now: defineDriver({ name: 'now', run: () => 1 }) };
      provideDrivers(root, {});
    `);
    expect(code).toBe(source`
      import { defineDriver, provideDrivers, subscription } from '@gyral/core';
      import { fakeDriver } from '@gyral/testing';

      export const session = defineDriver<string, number>('session');
      const feed = defineDriver<void, string>({ name: 'feed' });
      const clock = defineDriver({ name: 'clock', run: () => Date.now() });

      provideDrivers(document.body, [
        session.provide((input) => input.length),
        subscription(feed, (emit) => listen(emit)),
        clock,
      ]);
      provideDrivers(root, [fakeDriver('log'), subscription('ticks', tick)]);
      el.drivers = [defineDriver({ name: 'now', run: () => 1 })];
      provideDrivers(root, []);
    `);
    expect(findings).toEqual([]);
  });

  it('works with a namespace import of @gyral/core', () => {
    const { code } = migrate(source`
      import * as g from '@gyral/core';

      const feed = g.defineDriver<void, string>('feed');
      g.provideDrivers(root, { feed: feed.provide(() => 'x') });
    `);
    expect(code).toContain("g.provideDrivers(root, [feed.provide(() => 'x')]);");
  });
});

describe('driver-list: left as is, and reported', () => {
  it('mismatched names, unknown drivers, spreads and methods', () => {
    const findings = expectUnchanged(source`
      import { defineDriver, provideDrivers, subscription } from '@gyral/core';
      import { makeRouter } from '@gyral/router';
      import { session } from './tokens.js';

      const feed = defineDriver<void, string>('feed');
      provideDrivers(root, { news: feed.provide(run) });
      provideDrivers(root, { router: makeRouter() });
      provideDrivers(root, { session: session.provide(run) });
      provideDrivers(root, { ...base, feed: feed.provide(run) });
      provideDrivers(root, { feed() { return 1; } });
      provideDrivers(root, { feed: subscription(feed, a), 'feed': subscription(feed, b) });
      provideDrivers(root, { [key]: feed.provide(run) });
    `);
    expect(findings).toEqual([
      "6 [driver-list] driver record left as is: key 'news' isn't its driver's name 'feed' (commands never use this entry, G0045)",
      "7 [driver-list] driver record left as is: entry 'router': the name of the driver `makeRouter(…)` isn't known here",
      "8 [driver-list] driver record left as is: entry 'session': `session` is imported, so its driver name isn't known in this module",
      "9 [driver-list] driver record left as is: it spreads another record, whose drivers aren't known here",
      "10 [driver-list] driver record left as is: entry 'feed' is a method",
      "11 [driver-list] driver record left as is: key 'feed' appears twice",
      '12 [driver-list] driver record left as is: it has a computed key',
    ]);
  });

  it('records with a type assertion, and a provideDrivers that is not core’s', () => {
    const findings = expectUnchanged(source`
      import { defineDriver, provideDrivers, type DriverOverrides } from '@gyral/core';
      import { provideDrivers as mine } from './drivers.js';

      const feed = defineDriver<void, string>('feed');
      provideDrivers(root, { feed: feed.provide(run) } satisfies DriverOverrides);
      el.drivers = { feed: feed.provide(run) } as DriverOverrides;
      mine(root, { feed: feed.provide(run) });
      function provide(provideDrivers: (r: Element, d: object) => void) {
        provideDrivers(root, { feed: feed.provide(run) });
      }
    `);
    expect(findings).toEqual([
      '5 [driver-list] driver record left as is: it has a type assertion; change it by hand',
      '6 [driver-list] driver record left as is: it has a type assertion; change it by hand',
      "9 [driver-list] driver record left as is: `provideDrivers` here isn't provably @gyral/core's",
    ]);
  });

  it('el.drivers = { … } in a file that also reads .drivers', () => {
    const findings = expectUnchanged(source`
      import { defineDriver } from '@gyral/core';

      const feed = defineDriver<void, string>('feed');
      el.drivers = { feed: feed.provide(run) };
      const http = el.drivers.http;
    `);
    expect(findings).toEqual([
      '4 [driver-list] driver record left as is: this file reads `.drivers` (line 5), which would see a list',
    ]);
  });

  it('a token shadowed where the record is, and a token declared with let', () => {
    const findings = expectUnchanged(source`
      import { defineDriver, provideDrivers } from '@gyral/core';

      const feed = defineDriver<void, string>('feed');
      let clock = defineDriver<void, number>('clock');
      export function setup(feed: { provide(run: unknown): unknown }) {
        provideDrivers(root, { feed: feed.provide(run) });
      }
      export function later() {
        if (ready) {
          var feed = other;
          provideDrivers(root, { feed: feed.provide(run) });
        }
      }
      provideDrivers(root, { clock: clock.provide(run) });
    `);
    expect(findings).toEqual([
      "6 [driver-list] driver record left as is: entry 'feed': `feed` here isn't the module's `feed`",
      "11 [driver-list] driver record left as is: entry 'feed': `feed` here isn't the module's `feed`",
      "14 [driver-list] driver record left as is: entry 'clock': the name of the driver `clock` isn't known here",
    ]);
  });

  it('a name re-declared in another scope does not block the module-level record', () => {
    const { code } = migrate(source`
      import { defineDriver, provideDrivers } from '@gyral/core';

      const feed = defineDriver<void, string>('feed');
      export function show(feed: string) {
        return feed;
      }
      provideDrivers(root, { feed: feed.provide(run) });
    `);
    expect(code).toContain('provideDrivers(root, [feed.provide(run)]);');
  });

  it('test files keep their records', () => {
    const code = source`
      import { defineDriver, provideDrivers } from '@gyral/core';
      import { fakeDriver } from '@gyral/testing';

      const feed = defineDriver<void, string>('feed');
      el.drivers = { feed: fakeDriver(feed) };
      provideDrivers(root, { feed: fakeDriver('feed') });
    `;
    for (const file of [
      'src/feed.test.ts',
      'src/feed.spec.tsx',
      'test/setup.ts',
      'app/tests/a.ts',
    ]) {
      expect(expectUnchanged(code, file)).toEqual([
        '5 [driver-list] 2 driver records left as is: test file (records stay idiomatic for fakes)',
      ]);
    }
    expect(migrate(code, 'src/feed.ts').code).toContain('el.drivers = [fakeDriver(feed)];');
  });
});

describe('isTestFile', () => {
  it('matches *.test.*, *.spec.* and test folders only', () => {
    expect(isTestFile('src/a.test.ts')).toBe(true);
    expect(isTestFile('a.spec.mjs')).toBe(true);
    expect(isTestFile('packages/x/test/a.ts')).toBe(true);
    expect(isTestFile('tests/a.ts')).toBe(true);
    expect(isTestFile('src/__tests__/a.ts')).toBe(true);
    expect(isTestFile('src/latest/a.ts')).toBe(false);
    expect(isTestFile('src/contest.ts')).toBe(false);
    expect(isTestFile('src/testing.ts')).toBe(false);
  });
});
