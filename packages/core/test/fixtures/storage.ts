import { command, define, html } from '../../src/index.js';
import { makeLocalStorageDriver, type StorageOutput } from '../../src/storage.js';
import * as v from 'valibot';

export let firstStorageAccess: string | undefined;
export const storage = makeLocalStorageDriver(v.string(), {
  name: 'test-ssr-storage',
  prefix: 'gyral-ssr-storage:',
  storage: () => {
    firstStorageAccess ??= document.querySelector('test-storage-ssr output')?.textContent ?? '';
    return localStorage;
  },
});
type Msg = { readonly _tag: 'Stored'; readonly result: StorageOutput<string> };
export const Settings = define<{ readonly value: string }, Msg>()('test-storage-ssr', {
  init: () => ({ value: 'server' }),
  subscriptions: () => [
    command(storage, { _tag: 'Watch', key: 'theme' }, {
      key: 'stored-theme',
      onSuccess: (result) => ({ _tag: 'Stored', result }),
    }),
  ],
  update: {
    Stored: (s, m) =>
      m.result._tag === 'StorageChanged' && m.result.entry.found
        ? { value: m.result.entry.value }
        : s,
  },
  view: (s) => html`<output>${s.value}</output>`,
  shadow: false,
});
export const page = () => html`<test-storage-ssr></test-storage-ssr>`;
