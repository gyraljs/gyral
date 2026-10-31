# Behavior changes in 0.3.10

Gyral 0.3.10 fixes what migrating apps to 0.3.9 found (epic gyral-uvj). Each section below
stands on its own: changes a working app can notice first, each with what to do, then new
checks and workarounds you can remove.

## Embedded SSR protocol (gyral-uvj.1)

Only apps whose server bundle runs in an embedded host, such as gyral-rs's deno_core renderer,
are concerned. Nothing changes for servers on Node, Deno, Bun or a worker.

### New

- **`SSR_PROTOCOL` from `@gyral/ssr`** (`1`): the embedded SSR protocol this release
  implements ([ADR 0034](../design-docs/0034-ssr-protocol.md)). Protocol 1 is the bundle ABI 1
  that 0.3.8 and later implement, so a bundle built with 0.3.10 runs wherever a 0.3.9 bundle
  did, as far as the protocol goes.
- **Gyral releases no longer need a matching gyral-rs release.** From gyral-rs 0.8.0, the
  renderer accepts any Gyral release, 0.3.8 or later and not a prerelease, that declares a
  protocol it supports. gyral-rs 0.7.x still accepts exactly 0.3.9: move to gyral-rs 0.8.0
  before you rebuild your bundles with 0.3.10. Old manifests (`abi: 1`, `gyral: "0.3.8"` or
  `"0.3.9"`) need no change for 0.8.0, so you can upgrade the crates first.

### What to do

| Where                    | Before 0.3.10                                         | From 0.3.10                                                                                           |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| The server entry         | `globalThis.gyralBundleVersion = 1;`                  | `globalThis.gyralBundleVersion = SSR_PROTOCOL;`, imported from `@gyral/ssr`                           |
| The build's manifest     | `abi: 1`, and `gyral` set to the one accepted release | `abi` read from the installed `@gyral/ssr`'s `SSR_PROTOCOL`; `gyral` set to the installed release     |
| Server and client builds | The same exact Gyral release                          | Still the same release: the HTML and hydration seeds are a contract between one release's two bundles |

Rust rendering's reference has the protocol table: [rust-rendering.md](rust-rendering.md).

### Workarounds you can remove

- **A `TextEncoder` shim in the server entry** (gyral-rs's example installs one for Gyral's
  style hasher): Gyral's render path, 0.3.8 and later, uses only protocol 1's host globals, and
  a contract test now checks that on every change. Only `styleHashes()` needs `TextEncoder`,
  and you call it at build time, in Node. Keep the shim only if your own server code needs it.
