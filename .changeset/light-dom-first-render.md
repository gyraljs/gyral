---
'@gyral/core': patch
---

**Behaviour change:** a light-DOM component (`shadow: false`) rendered in the browser now
replaces the children the page's HTML gave it on its first render, as a shadow root always did
(gyral-k97.4). It used to keep them and append its view after them, so a no-script message
written inside the component stayed visible beside it. Children in the page's HTML are fallback
content: shown until the component renders, and without JavaScript. Server-rendered light
components still hydrate their own children in place, and a component moved after its first
render keeps its view. An element defined by a synchronous classic script before the parser
reaches its children is not covered (module scripts, such as Vite's entry, run after parsing).
