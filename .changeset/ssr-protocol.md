---
'@gyral/ssr': patch
---

`@gyral/ssr` exports `SSR_PROTOCOL` (`1`), the embedded SSR protocol this release implements
(gyral-uvj.1, ADR 0034). Nothing changes for apps that serve pages from Node, Deno, Bun or a
worker. A server bundle run by an embedded host such as gyral-rs declares it with
`globalThis.gyralBundleVersion = SSR_PROTOCOL`, and its build writes the same number to the
manifest's `abi`, so a host that doesn't support the protocol refuses the bundle at startup.
Protocol 1 is the bundle ABI 1 that Gyral 0.3.8 and later implement: from gyral-rs 0.8.0, a
Gyral release that keeps the protocol (this one does) needs no new gyral-rs release, and only a
protocol change, in a Gyral minor with an upgrade note, does.
