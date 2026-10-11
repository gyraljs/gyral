# Native browser storage (0.3.1)

Storage is a driver effect. Keep reads/writes out of reducers, init and views. The optional
`@gyral/core/storage` entry adds no storage code to apps that do not import it. Factories and
imports are safe on the server; browser access starts only when commands run.

## localStorage

```ts
import { command, define, html } from '@gyral/core';
import { makeLocalStorageDriver, type StorageError, type StorageOutput } from '@gyral/core/storage';
import * as v from 'valibot';

const settings = makeLocalStorageDriver(v.object({ theme: v.string() }), { prefix: 'app:' });
interface State {
  readonly theme: string;
  readonly error?: StorageError;
}
type Msg =
  | { readonly _tag: 'Stored'; readonly result: StorageOutput<{ theme: string }> }
  | { readonly _tag: 'Failed'; readonly error: StorageError }
  | { readonly _tag: 'Dark' };

export const Theme = define<State, Msg>()('my-storage-theme', {
  init: () => ({ theme: 'light' }),
  subscriptions: () => [
    command(
      settings,
      { _tag: 'Watch', key: 'settings' },
      {
        key: 'settings-watch',
        onSuccess: (result) => ({ _tag: 'Stored', result }),
        onFailure: (error) => ({ _tag: 'Failed', error }),
      },
    ),
  ],
  intent: { Dark: true },
  update: {
    Stored: (s, m) =>
      m.result._tag === 'StorageChanged' && m.result.entry.found
        ? { theme: m.result.entry.value.theme }
        : s,
    Failed: (s, m) => ({ ...s, error: m.error }),
    Dark: (s) => [
      s,
      [
        command(
          settings,
          {
            _tag: 'Write',
            key: 'settings',
            value: { theme: 'dark' },
          },
          { key: 'settings-write', onFailure: (error) => ({ _tag: 'Failed', error }) },
        ),
      ],
    ],
  },
  view: (s, i) =>
    html`<p>${s.theme}</p>
      <button type="button" data-intent=${i.Dark}>Dark theme</button>`,
});
```

`Read { key }` returns `StorageValue` with `entry: { found: false }` or
`{ found: true, value }`. `Write { key, value }`, `Remove { key }` and `Clear` return
completion tags. Clear removes only the configured prefix (default empty: all localStorage).
Watch emits an initial snapshot, then changes from driver writes (`source: 'driver'`) and
native events in other tabs (`'tab'`). Direct same-tab localStorage writes are not observed.
Removal/clear emit absence. A malformed Watch value emits `StorageDecodeFailed` and leaves
the watch running; Read rejects with `StorageDecodeError`. Access/quota/security failures
go through `StorageAccessError` and command `onFailure`. Handle both watch output variants.

The Standard Schema decodes parsed JSON, including async validation. If it transforms the
input, configure `encode(value)` to reconstruct its JSON input shape. No transactions or
cross-tab atomicity are promised. Use distinct command keys for watches and writes. Abort
removes listeners and suppresses late decoder results. Tests use `fakeDriver(settings)`
with `el.drivers = { localStorage: fake }`, or an isolated `storage: () => storageObject`.

Initial watches belong in `subscriptions`: the server's seed hydrates first, then browser
storage updates the model. Keep server-rendered state JSON-compatible.
