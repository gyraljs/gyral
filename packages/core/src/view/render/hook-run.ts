// Running element hooks' queued client calls (view/02-bindings.md "Commit order",
// gyral-1zd.27). Inside a scheduler flush the calls wait until every dirty host has rendered,
// then run children first: one root's calls in document order, roots in reverse render order
// (the scheduler renders parents before children), so a parent's hook sees the child components
// it renders. Outside a flush a `render` call runs its own calls when it returns. Installed by
// `defineHook`/`defineDisposableHook` (hook-part.ts), so apps without hooks bundle none of it.
import {
  disposalPass,
  hookFailure,
  queue,
  setCommitting,
  type HookPart,
  type HookRunner,
  type HookSpec,
} from './hooks.js';

/** Inside a flush: the roots rendered since the last flush of hooks (the queue starts empty). */
let batch: Node[] | undefined;

/**
 * Runs the calls queued since `mark` for `roots`: disposal first (dispose.ts), then each
 * root's `client` calls in document order, the last-rendered root first. The scheduler renders
 * parents before children, so children's hooks run first. Each hook on its own: one that
 * throws doesn't keep the others from running.
 */
function runQueued(mark: number, roots: readonly Node[]): void {
  try {
    const dispose = disposalPass();
    for (const root of roots) {
      setCommitting(root);
      dispose?.(root); // disposable hooks whose element left `root` dispose first
    }
    const failed = hookFailure();
    // One root's calls are queued together: walk those runs from the end.
    for (let end = queue.length; end > mark;) {
      let start = end - 1;
      while (start > mark && queue[start - 1]?.owner === queue[end - 1]?.owner) start--;
      for (let i = start; i < end; i++) {
        const part = queue[i] as HookPart;
        try {
          (part.spec as HookSpec<readonly unknown[]>).client(
            part.el,
            part.args as readonly unknown[],
            part.prev,
          );
        } catch (error) {
          failed(error, part.owner as Node);
        }
      }
      end = start;
    }
  } finally {
    queue.length = mark;
    setCommitting(undefined);
  }
}

function flush(): void {
  if (batch === undefined || batch.length === 0) return;
  const roots = batch;
  batch = [];
  runQueued(0, roots);
}

export const runner: HookRunner = {
  run(mark, root) {
    if (batch !== undefined) batch.push(root);
    else runQueued(mark, [root]);
  },
  start() {
    batch = [];
  },
  flush,
  end(ok) {
    if (ok) flush();
    else queue.length = 0;
    batch = undefined;
  },
};
