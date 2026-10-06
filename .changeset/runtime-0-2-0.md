---
'@gyral/core': minor
'@gyral/devtools': minor
'@gyral/http': minor
'@gyral/mcp': minor
'@gyral/router': minor
'@gyral/ssr': minor
'@gyral/testing': minor
'@gyral/time': minor
'create-gyral': minor
---

Smaller and faster, with no public API change:

- **No Effect.** The command interpreter is now plain TypeScript with no runtime dependencies,
  so `@gyral/core` depends only on Lit. An empty app drops from about 49 KiB to about 11 KiB
  gzipped, starts faster and uses less memory; rendering speed is unchanged (ADR 0015).
- **Template whitespace minification.** `html` and `svg` remove indentation whitespace between
  tags (once per template, on server and client alike), so lists build far fewer DOM nodes and
  bulk list updates are 9–22% faster. Inline spacing is kept as one space; `<pre>`,
  `<textarea>`, `<script>`, `<style>`, attributes and comments are unchanged. For exact
  whitespace under CSS `white-space: pre*`, use `html` from `lit`.
- **lit-html leak guidance.** lit-html 3.3.1 and later leak a comment node per removed
  `repeat()` item (lit/lit#5298). Development builds warn once when an affected version is
  loaded; pin lit-html to 3.3.0 with an override until it is fixed upstream
  (docs/references/consumer-setup.md). New `create-gyral` apps are pinned.
