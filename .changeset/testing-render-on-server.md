---
'@gyral/testing': patch
---

New `@gyral/testing/vitest` entry with `renderOnServer`, a Vitest browser command for hydration
tests with real server markup: register it with `test.browser.commands: { renderOnServer }`,
then in a browser test `mountSsr(await commands.renderOnServer({ module: '../src/counter.ts',
export: 'Counter', props: { start: 3 } }))`, import the module and `await hydrated(page)`. It
renders in Vitest's Node process, through the project's Vite server and `@gyral/core/server`,
which a browser test can't run. The export may be a `define()` class (rendered with its props),
a function of the props returning a template result, an HTML string or a `Response` (a full
page), or a template result. `vitest` 5 is an optional peer, needed only for this entry. The
README, the skill's testing reference and the consumer setup guide say when to use it and when
a golden fixture written by a Node test fits better.
