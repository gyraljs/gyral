---
'create-gyral': patch
---

The `basic` template builds client-only: `gyralVitePreset({ clientOnly: true })` in
`vite.config.ts` leaves Gyral's hydration code out (about 1 KiB gzip), and `vitest.config.ts`
now reuses that config so tests match the build. The template's README and AGENTS.md say when
to turn it off: as soon as any page is rendered on a server or prerendered (for example with
`@gyral/ssr`), delete `clientOnly: true`. The `ssr` template is unchanged.
