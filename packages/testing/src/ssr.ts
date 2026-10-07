// Browser tests for server-rendered pages (gyral-czi.22): put real server output into the
// document the way a page load would, then import components so they hydrate in place.
// Server output usually comes from golden fixtures written by Node route tests.
import { ISLAND_ATTRIBUTE, resetDocumentStores, settled } from '@gyral/core';

export interface MountSsrOptions {
  /** Restore the page-level store seed (`data-gyral-stores`). Default `true`. */
  readonly stores?: boolean;
  /** Copy `<meta name=…>` elements from the head (e.g. a CSRF token). Default `true`. */
  readonly metas?: boolean;
}

export interface MountedSsr {
  /** The element holding the server body (Declarative Shadow DOM already parsed). */
  readonly root: HTMLElement;
  /** Console errors/warnings and uncaught errors seen since mounting (see `hydrated`). */
  readonly problems: readonly string[];
  readonly unmount: () => void;
}

const describe = (value: unknown): string =>
  value instanceof Error ? `${value.name}: ${value.message}` : String(value);

/** Records console errors/warnings and uncaught errors while a page is mounted. */
function watchProblems(): { readonly problems: string[]; readonly stop: () => void } {
  const problems: string[] = [];
  // Wraps the console to observe it; the originals still run.
  const { error, warn } = console;
  const record =
    (kind: string, original: (...args: unknown[]) => void) =>
    (...args: unknown[]): void => {
      const text = args.map(describe).join(' ');
      problems.push(`${kind}: ${text}`);
      original.apply(console, args);
    };
  console.error = record('console.error', error);
  console.warn = record('console.warn', warn);
  const onError = (event: ErrorEvent): void => {
    problems.push(`uncaught: ${describe(event.error ?? event.message)}`);
  };
  window.addEventListener('error', onError);
  return {
    problems,
    stop: () => {
      console.error = error;
      console.warn = warn;
      window.removeEventListener('error', onError);
    },
  };
}

const between = (html: string, tag: string): string =>
  new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(html)?.[1] ?? '';

/**
 * Mounts server output: a full document (head + body) or a body fragment. Call it before
 * importing component modules so elements upgrade and hydrate like on a real page load.
 * - Only `<head>` styles are applied: `<style>` inside Declarative Shadow DOM belongs to its
 *   shadow root and must not leak into the page.
 * - The store seed and named `<meta>`s are restored, as the browser would see them.
 */
export function mountSsr(html: string, options: MountSsrOptions = {}): MountedSsr {
  const isDocument = /<body[\s>]/.test(html);
  const head = isDocument ? between(html, 'head') : '';
  const body = isDocument ? between(html, 'body') : html;
  const added: Element[] = [];

  const styles = [...head.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? '');
  if (styles.length > 0) {
    const style = document.createElement('style');
    style.textContent = styles.join('\n');
    added.push(style);
  }
  if (options.stores !== false) {
    resetDocumentStores();
    const seed = /<script type="application\/json" data-gyral-stores>([\s\S]*?)<\/script>/.exec(
      head,
    )?.[1];
    if (seed !== undefined) {
      const script = document.createElement('script');
      script.type = 'application/json';
      script.setAttribute('data-gyral-stores', '');
      script.textContent = seed;
      added.push(script);
    }
  }
  if (options.metas !== false) {
    for (const m of head.matchAll(/<meta name="([^"]+)" content="([^"]*)"/g)) {
      const meta = document.createElement('meta');
      meta.name = m[1] ?? '';
      meta.content = m[2] ?? '';
      added.push(meta);
    }
  }
  document.head.append(...added);

  const watch = watchProblems();
  const root = document.createElement('div');
  root.setHTMLUnsafe(body); // parses Declarative Shadow DOM, like a page load
  document.body.append(root);
  return {
    root,
    problems: watch.problems,
    unmount: () => {
      watch.stop();
      root.remove();
      for (const el of added) el.remove();
      if (options.stores !== false) resetDocumentStores();
    },
  };
}

/** Custom elements under `root`, including those inside (nested) shadow roots. */
export function customElementsIn(root: ParentNode): Element[] {
  return [...root.querySelectorAll('*')].flatMap((el) => [
    ...(el.localName.includes('-') ? [el] : []),
    ...(el.shadowRoot === null ? [] : customElementsIn(el.shadowRoot)),
  ]);
}

export interface HydratedOptions {
  /**
   * Custom element tags allowed to stay undefined (never upgraded). `gyral-stores` is always
   * allowed: in the browser it is a plain scoping element.
   */
  readonly allowUndefined?: readonly string[];
  /**
   * Release every lazy island first (`defer-hydration` + `data-gyral-hydrate`), as if each
   * one's trigger had fired. Default `false`: islands keep waiting.
   */
  readonly releaseIslands?: boolean;
}

// Server-only or deliberately plain elements that are fine to leave un-upgraded.
const ALWAYS_UNDEFINED = ['gyral-stores'];

/**
 * Server-rendered custom elements that never upgraded (gyral-czi.32): their module wasn't
 * imported, so nothing hydrated them and a test could pass without exercising them.
 */
export function undefinedElementsIn(
  root: ParentNode,
  allow: readonly string[] = [],
): readonly string[] {
  const allowed = new Set([...ALWAYS_UNDEFINED, ...allow]);
  const tags = customElementsIn(root).map((el) => el.localName);
  return [...new Set(tags)].filter((tag) => !allowed.has(tag) && !customElements.get(tag));
}

/**
 * Waits until the page's Gyral components have rendered (docs/design-docs/view/04-scheduler.md
 * "`settled()`"): releases lazy islands if asked, then `await settled()`. Islands still
 * deferred are left alone. It throws when a server-rendered custom element never upgraded
 * (import its module, or list it in `allowUndefined`). Given a `MountedSsr`, it also throws
 * when console errors/warnings or uncaught errors were recorded since mounting.
 */
export async function hydrated(
  page: MountedSsr | ParentNode,
  options: HydratedOptions = {},
): Promise<void> {
  const root = 'unmount' in page ? page.root : page;
  if (options.releaseIslands === true) {
    for (const el of customElementsIn(root)) {
      if (!el.hasAttribute(ISLAND_ATTRIBUTE)) continue;
      el.removeAttribute(ISLAND_ATTRIBUTE);
      el.removeAttribute('defer-hydration'); // the element connects now (view/07 "Islands")
    }
  }
  await settled();
  const never = undefinedElementsIn(root, options.allowUndefined);
  if (never.length > 0) {
    throw new Error(
      `Server-rendered elements never upgraded: ${never.map((t) => `<${t}>`).join(', ')}. ` +
        `Import their modules in the test, or pass { allowUndefined: [...] } to hydrated().`,
    );
  }
  if ('unmount' in page && page.problems.length > 0) {
    throw new Error(`Problems during hydration:\n${page.problems.join('\n')}`);
  }
}
