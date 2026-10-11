// Preserve components statically retained by the app entry instead of forcing another
// dynamic-import entry for them (ADR 0016, gyral-1zd.31).
import type { Rollup } from 'vite';

/**
 * Modules statically retained by the app's inputs (transitively). A component among them is
 * defined at startup by the app's own entry; giving it to the loader as well would make the
 * bundler split it out of the entry into a chunk of its own.
 */
export async function staticallyReachable(
  ctx: Rollup.PluginContext,
  inputs: readonly string[],
): Promise<Set<string>> {
  const seen = new Set<string>();
  const reachable = new Set<string>();
  const entries = new Set<string>();
  const queue: Rollup.ResolvedId[] = [];
  for (const input of inputs) {
    const resolved = await ctx.resolve(input, undefined, { isEntry: true });
    if (resolved !== null && !resolved.external) {
      entries.add(resolved.id);
      queue.push(resolved);
    }
  }
  while (queue.length > 0) {
    const resolved = queue.pop();
    if (resolved === undefined) break;
    const { id } = resolved;
    if (seen.has(id) || id === '\0virtual:gyral/components') continue;
    seen.add(id);
    const info = await ctx.load({ ...resolved, resolveDependencies: true });
    // A side-effect-only import can be dropped by tree shaking. Keep such components in
    // the loader rather than assuming the entry registered them (including through barrels).
    if ((info.moduleSideEffects ?? resolved.moduleSideEffects) === false && !entries.has(id))
      continue;
    reachable.add(id);
    for (const next of info.importedIds) {
      if (seen.has(next)) continue;
      const dependency = await ctx.resolve(next, id);
      if (dependency !== null && !dependency.external) queue.push(dependency);
    }
  }
  return reachable;
}
