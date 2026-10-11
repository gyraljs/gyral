// The component loader (gyralVitePreset({ components: true }), ADR 0016 addendum): imports a
// tag's module the first time that tag is in the document, now or after a later mutation, and
// never twice. Run in a real browser from the source the build generates.
import { afterEach, describe, expect, it } from 'vitest';
import { loaderSource } from '../src/compiler/loader-source.js';
import { componentsReady } from '../src/index.js';

const urls: string[] = [];
afterEach(() => {
  for (const url of urls.splice(0)) URL.revokeObjectURL(url);
  document.body.replaceChildren();
});

const moduleUrl = (code: string): string => {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  urls.push(url);
  return url;
};

/** A module that defines `tag` and counts how often it was evaluated. */
const definer = (tag: string): string =>
  moduleUrl(`
    globalThis.loads ??= {};
    globalThis.loads[${JSON.stringify(tag)}] = (globalThis.loads[${JSON.stringify(tag)}] ?? 0) + 1;
    customElements.define(${JSON.stringify(tag)}, class extends HTMLElement {});
  `);

const loads = (): Record<string, number> =>
  ((globalThis as { loads?: Record<string, number> }).loads ??= {});

const until = async (check: () => boolean): Promise<void> => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
};

describe('component loader', () => {
  it('loads the modules of tags in the page now, and of tags added later, once each', async () => {
    const suffix = Math.random().toString(36).slice(2);
    const now = `ld-now-${suffix}`;
    const later = `ld-later-${suffix}`;
    const never = `ld-never-${suffix}`;
    document.body.innerHTML = `<${now}></${now}>`;
    const loader = loaderSource(
      new Map([
        [now, definer(now)],
        [later, definer(later)],
        [never, definer(never)],
      ]),
    );
    await import(/* @vite-ignore */ moduleUrl(loader));
    await until(() => customElements.get(now) !== undefined);
    expect(customElements.get(now)).toBeDefined();
    expect(customElements.get(later)).toBeUndefined();

    document.body.append(document.createElement(later), document.createElement(later));
    await until(() => customElements.get(later) !== undefined);
    expect(customElements.get(later)).toBeDefined();
    document.body.append(document.createElement(now));
    await new Promise((r) => setTimeout(r, 30));
    expect(loads()[now]).toBe(1);
    expect(loads()[later]).toBe(1);
    expect(customElements.get(never)).toBeUndefined();
  });

  it('loads tags a component renders in its shadow root, and componentsReady waits for them (gyral-1zd.29)', async () => {
    const suffix = Math.random().toString(36).slice(2);
    const outer = `ld-outer-${suffix}`;
    const inner = `ld-inner-${suffix}`;
    const deep = `ld-deep-${suffix}`;
    // outer renders <inner> in its shadow root after a microtask; inner renders <deep> the same way.
    const shadowDefiner = (tag: string, child: string): string =>
      moduleUrl(`
        customElements.define(${JSON.stringify(tag)}, class extends HTMLElement {
          connectedCallback() {
            const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
            queueMicrotask(() => { root.innerHTML = '<${child}></${child}>'; });
          }
        });
      `);
    document.body.innerHTML = `<${outer}></${outer}>`;
    const loader = loaderSource(
      new Map([
        [outer, shadowDefiner(outer, inner)],
        [inner, shadowDefiner(inner, deep)],
        [deep, definer(deep)],
      ]),
    );
    await import(/* @vite-ignore */ moduleUrl(loader));
    await componentsReady();
    expect(customElements.get(outer)).toBeDefined();
    expect(customElements.get(inner)).toBeDefined();
    expect(customElements.get(deep)).toBeDefined();
    expect(loads()[deep]).toBe(1);
  });

  it('waits for an entry-defined host and discovers children in its new shadow root', async () => {
    const suffix = Math.random().toString(36).slice(2);
    const outer = `ld-entry-${suffix}`;
    const inner = `ld-child-${suffix}`;
    document.body.innerHTML = `<${outer}></${outer}>`;
    await import(
      /* @vite-ignore */ moduleUrl(
        loaderSource(new Map([[inner, definer(inner)]]), { known: [outer] }),
      )
    );
    let finished = false;
    const ready = componentsReady().then(() => {
      finished = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(finished).toBe(false);
    customElements.define(
      outer,
      class extends HTMLElement {
        connectedCallback() {
          const root = this.attachShadow({ mode: 'open' });
          queueMicrotask(() => {
            root.innerHTML = `<${inner}></${inner}>`;
          });
        }
      },
    );
    await ready;
    expect(customElements.get(inner)).toBeDefined();
    expect(loads()[inner]).toBe(1);
  });
});
