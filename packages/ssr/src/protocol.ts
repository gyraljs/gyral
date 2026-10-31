// The embedded SSR protocol (docs/design-docs/0034-ssr-protocol.md): the contract between this
// release's server code and a host that runs an app's server bundle outside Node, such as
// gyral-rs. The contract test (test/embedded-protocol.node.test.ts) checks it.

/**
 * The embedded SSR protocol this release implements (ADR 0034). A server entry built for an
 * embedded host such as gyral-rs declares it with `globalThis.gyralBundleVersion =
 * SSR_PROTOCOL`, and its build writes the same number to the bundle manifest's `abi`, so a
 * host that doesn't support it refuses the bundle before running it. Protocol 1 is the bundle
 * ABI 1 that every Gyral release from 0.3.8 on implements. It changes only in a minor release,
 * with an upgrade note; a release that keeps it needs no new host release.
 */
export const SSR_PROTOCOL = 1;
