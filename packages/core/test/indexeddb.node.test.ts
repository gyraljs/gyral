import { expect, it } from 'vitest';
import * as v from 'valibot';
import { makeIndexedDBDriver } from '../src/indexeddb.js';

it('imports and constructs an IndexedDB driver without browser globals', async () => {
  const driver = makeIndexedDBDriver({ values: v.string() }, { database: 'ssr', version: 1 });
  const failure = await Promise.resolve(
    driver.run(
      { _tag: 'Read', store: 'values', key: 'x' },
      { signal: new AbortController().signal, emit: () => undefined },
    ),
  ).catch((cause: unknown) => driver.toError?.(cause));
  expect(failure).toMatchObject({
    _tag: 'IndexedDBAccessError',
    phase: 'open',
    message: 'IndexedDB is unavailable.',
  });
});
