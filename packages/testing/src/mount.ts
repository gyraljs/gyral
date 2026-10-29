// mount(): a component in the document for a browser test (gyral-1zd.25). Drivers and stores
// are set before the element connects, props before its first render; queries reach into the
// shadow root; type() and click() dispatch real events and wait for the result. Mounted
// elements are removed after each test when the runner has a global afterEach (Vitest with
// globals, Jest, Mocha); otherwise call dispose() in the test's own cleanup.
import { settled, type DriverList, type DriverOverrides, type StoreOverrides } from '@gyral/core';

type Constructor<E extends HTMLElement> = new () => E;

/** Settable instance properties: a component's declared props. */
type PropsOf<E> = { -readonly [K in Exclude<keyof E, keyof HTMLElement>]?: E[K] };

export interface MountOptions<E extends HTMLElement> {
  /** Props, set as properties before the element connects. */
  readonly props?: PropsOf<E> & Readonly<Record<string, unknown>>;
  /** Attributes, set before the element connects. */
  readonly attrs?: Readonly<Record<string, string>>;
  /** Driver substitutions by name (`el.drivers`), set before the element connects. */
  readonly drivers?: DriverOverrides | DriverList;
  /** Store instances by name (`el.stores`), set before the element connects. */
  readonly stores?: StoreOverrides;
  /** Query the element's light DOM instead of its shadow root (for `shadow: false`). */
  readonly light?: boolean;
  /** Where to append the element. Default `document.body`. */
  readonly parent?: ParentNode;
}

export interface Mounted<E extends HTMLElement> {
  readonly el: E;
  /** The first match in the element's shadow root (or light DOM), or null. */
  $(selector: string): HTMLElement | null;
  /** Every match in the element's shadow root (or light DOM). */
  $$(selector: string): HTMLElement[];
  /** Sets a control's value as typing would, fires `input` and `change`, then waits. */
  type(selector: string, text: string): Promise<void>;
  /** Clicks the first match, then waits. */
  click(selector: string): Promise<void>;
  /** Waits until rendering, commands and messages have settled (`settled()`). */
  settled(): Promise<void>;
  /** Removes the element (and its overrides with it). */
  dispose(): void;
}

const live = new Set<{ dispose(): void }>();
let hooked = false;

/** Registers cleanup with the runner's global afterEach, when there is one. */
function hookCleanup(): void {
  if (hooked) return;
  const afterEach = (globalThis as { afterEach?: (fn: () => void) => void }).afterEach;
  if (typeof afterEach !== 'function') return;
  hooked = true;
  afterEach(() => {
    for (const m of [...live]) m.dispose();
  });
}

/**
 * Creates `component` (a class from `define()` or a registered tag name), sets `props`,
 * `attrs`, `drivers` and `stores`, appends it, and waits for its first render.
 */
export async function mount<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options?: MountOptions<HTMLElementTagNameMap[K]>,
): Promise<Mounted<HTMLElementTagNameMap[K]>>;
export async function mount<E extends HTMLElement>(
  component: Constructor<E> | string,
  options?: MountOptions<E>,
): Promise<Mounted<E>>;
export async function mount<E extends HTMLElement>(
  component: Constructor<E> | string,
  options: MountOptions<E> = {},
): Promise<Mounted<E>> {
  hookCleanup();
  const el = (
    typeof component === 'string' ? document.createElement(component) : new component()
  ) as E;
  for (const [name, value] of Object.entries(options.attrs ?? {})) el.setAttribute(name, value);
  const host = el as unknown as Record<string, unknown>;
  if (options.drivers !== undefined) host['drivers'] = options.drivers;
  if (options.stores !== undefined) host['stores'] = options.stores;
  for (const [name, value] of Object.entries(options.props ?? {})) host[name] = value;
  (options.parent ?? document.body).append(el);
  await settled();

  const root = (): ParentNode => (options.light === true ? el : (el.shadowRoot ?? el));
  const need = (selector: string): HTMLElement => {
    const found = root().querySelector<HTMLElement>(selector);
    if (found === null) {
      throw new Error(`mount: no element matches ${JSON.stringify(selector)} in <${el.localName}>`);
    }
    return found;
  };
  const mounted: Mounted<E> = {
    el,
    $: (selector) => root().querySelector<HTMLElement>(selector),
    $$: (selector) => [...root().querySelectorAll<HTMLElement>(selector)],
    async type(selector, text) {
      const control = need(selector) as HTMLInputElement | HTMLTextAreaElement;
      control.focus();
      control.value = text;
      control.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      await settled();
    },
    async click(selector) {
      need(selector).click();
      await settled();
    },
    settled,
    dispose() {
      el.remove();
      live.delete(mounted);
    },
  };
  live.add(mounted);
  return mounted;
}
