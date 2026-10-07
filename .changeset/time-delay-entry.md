---
'@gyral/time': patch
---

New entry `@gyral/time/delay` for apps that only need delays: `delay` and `debounce` with the same
signatures and lanes as the main entry's, over a delay-only driver (`delayTime`,
`makeDelayTime()`) that leaves periodic ticks and animation frames out of the bundle (about
0.15 KiB gzip). The driver is also named `time` and takes the same input, so substitution,
`inputsFor` and virtual time work unchanged. The main entry is unchanged.
