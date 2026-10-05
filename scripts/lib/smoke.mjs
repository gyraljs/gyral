// Pure checks for `pnpm smoke:prod` (scripts/smoke-prod.mjs): compare what the server sent with
// what a production build shows after hydration. Tested in scripts/test/smoke.test.mjs.

/**
 * Summarizes a document: deep <h1> count, and per custom element (by tag and order) the number
 * of non-<style> element children in its shadow root or, for light hosts, in itself.
 * Runs in the browser (passed to page.evaluate), so it must be self-contained.
 */
export function summarize(root) {
  const h1 = [];
  const hosts = [];
  const walk = (node, where) => {
    for (const el of node.querySelectorAll('*')) {
      if (el.localName === 'h1') h1.push(where);
      if (!el.localName.includes('-')) continue;
      const view = el.shadowRoot ?? el;
      const children = [...view.children].filter((c) => c.localName !== 'style');
      hosts.push({ tag: el.localName, shadow: el.shadowRoot !== null, children: children.length });
      if (el.shadowRoot) walk(el.shadowRoot, el.localName);
    }
  };
  walk(root, 'document');
  return { h1: h1.length, hosts };
}

/**
 * Problems on one page: page errors, a heading count that changed, or a host whose view has a
 * different number of top-level elements than the server rendered (a duplicated or lost view).
 */
export function compareSummaries(path, server, live, pageErrors) {
  const problems = pageErrors.map((e) => `${path}: page error: ${e}`);
  if (live.h1 !== server.h1) {
    problems.push(
      `${path}: ${String(live.h1)} <h1> after hydration, server sent ${String(server.h1)}`,
    );
  }
  const count = Math.min(server.hosts.length, live.hosts.length);
  for (let i = 0; i < count; i += 1) {
    const s = server.hosts[i];
    const l = live.hosts[i];
    if (s.tag !== l.tag) continue; // the client may add or remove hosts; compare matching ones
    if (s.children !== l.children) {
      problems.push(
        `${path}: <${s.tag}> has ${String(l.children)} top-level elements after hydration, ` +
          `server rendered ${String(s.children)} (duplicated or lost view)`,
      );
    }
  }
  return problems;
}
