---
'@gyral/core': patch
---

Builds with the Vite preset bundle view transitions (`viewTransition`), the frame lane
(`renderOnFrame`) and custom states (`states`) only when some module names the spec field: the
template compiler scans every module of the client build, dependencies included, and adds the
feature's registration where its field is named. Apps that use none of the three ship about
0.27 KiB gzip less (hello-world 8.9 → 8.6 KiB initial). No API change: the runtime path (no
build step) keeps everything, and a field whose name is built at run time degrades as on a
browser without the feature (development builds warn).
