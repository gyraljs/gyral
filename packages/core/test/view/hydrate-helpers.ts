// Helpers for the hydration tests (view/07-hydration.md): server output parsed the way a page
// load parses it (declarative shadow roots attached), node lists to prove identity, and a
// strict canonical form that keeps text node boundaries (hydration splits merged text exactly
// where the client renderer keeps nodes apart).
import { renderToString } from '../../src/server.js';
import { DEV, type ChildValue } from '../../src/view/index.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Server-only attributes: hydration's inputs, not part of the view (06 "Components"). */
const SERVER_ONLY = new Set(['data-gyral-seed', 'data-gyral-light']);
/** Form-state attributes the browser writes on first creation only. */
const FORM = new Set(['input value', 'input checked', 'option selected']);

let containers: HTMLElement[] = [];

/** A connected container (removed by `cleanup`). */
export function container(): HTMLDivElement {
  const el = document.createElement('div');
  containers.push(el);
  document.body.append(el);
  return el;
}

export function cleanup(): void {
  for (const c of containers) c.remove();
  containers = [];
}

/**
 * The server's HTML for `value` in a connected container, parsed like a page load. `dev`:
 * development markers; by default the build's own mode.
 */
export function serverDom(value: ChildValue, dev = DEV): HTMLDivElement {
  const el = container();
  el.setHTMLUnsafe(renderToString(value, { dev }));
  return el;
}

/** Every node under `root` in document order, shadow roots included (not their `<style>`). */
export function nodesOf(root: Node): Node[] {
  const out: Node[] = [];
  for (let n = root.firstChild; n !== null; n = n.nextSibling) {
    if (n.nodeType === 8 && (n as Comment).data.startsWith('gyral:')) continue;
    if (n.nodeType === 1 && (n as Element).localName === 'style' && root instanceof ShadowRoot) {
      continue;
    }
    out.push(n);
    const el = n as Element;
    if (n.nodeType === 1 && el.shadowRoot !== null) out.push(...nodesOf(el.shadowRoot));
    out.push(...nodesOf(n));
  }
  return out;
}

/** Live form state, compared by property (view/README.md "Conformance"). */
function live(el: Element): string {
  if (el instanceof HTMLInputElement) {
    return ` .value=${el.value} .checked=${String(el.checked)} .ind=${String(el.indeterminate)}`;
  }
  if (el instanceof HTMLOptionElement) return ` .selected=${String(el.selected)}`;
  if (el instanceof HTMLTextAreaElement) return ` .value=${JSON.stringify(el.value)}`;
  return '';
}

/**
 * A strict canonical form: one entry per node (text boundaries kept, empty text included),
 * development markers and server-only attributes left out, shadow roots without `<style>`.
 * `merge`: join adjacent text and drop empty text instead (what a fresh parse gives).
 * `liveOnly`: form state only by live property: the `value`/`checked`/`selected` attributes
 * and textarea content are written on first creation only (view/02-bindings.md).
 */
export function canon(parent: ParentNode, merge = false, liveOnly = false): string {
  let out = '';
  let text: string | undefined;
  const flush = (): void => {
    if (text !== undefined && (!merge || text !== '')) out += JSON.stringify(text);
    text = undefined;
  };
  for (const node of parent.childNodes) {
    if (node.nodeType === 3) {
      if (!merge) flush();
      text = (text ?? '') + (node as Text).data;
      continue;
    }
    if (node.nodeType === 8) {
      const data = (node as Comment).data;
      if (data.startsWith('gyral:')) continue;
      flush();
      out += `<!--${data}-->`;
      continue;
    }
    const el = node as Element;
    if (el.localName === 'style' && parent instanceof ShadowRoot) continue;
    flush();
    const attrs = [...el.attributes]
      .filter(
        (a) => !SERVER_ONLY.has(a.name) && !(liveOnly && FORM.has(`${el.localName} ${a.name}`)),
      )
      .map((a) => ` ${a.namespaceURI === null ? '' : '~'}${a.name}=${JSON.stringify(a.value)}`)
      .sort()
      .join('');
    const root = el.shadowRoot === null ? '' : `#shadow(${canon(el.shadowRoot, merge, liveOnly)})`;
    const inner = liveOnly && el.localName === 'textarea' ? '' : canon(el, merge, liveOnly);
    const tag = el.namespaceURI === SVG_NS ? `svg:${el.localName}` : el.localName;
    out += `<${tag}${attrs}${live(el)}>${root}${inner}</${tag}>`;
  }
  flush();
  return out;
}
