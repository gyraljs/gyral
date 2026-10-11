import { expect, it } from 'vitest';
import * as v from 'valibot';
import { makeLocalStorageDriver } from '../src/storage.js';

it('imports and creates drivers without browser globals and reports unavailable storage at run time', async () => {
  const driver = makeLocalStorageDriver(v.string());
  const failure = await Promise.resolve(
    driver.run(
      { _tag: 'Read', key: 'x' },
      {
        signal: new AbortController().signal,
        emit: () => undefined,
      },
    ),
  ).catch((cause: unknown) => driver.toError?.(cause));
  expect(failure).toMatchObject({ _tag: 'StorageAccessError', operation: 'Read' });
});
