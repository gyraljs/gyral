// Real server markup in a browser test (gyral-dyn.8): the renderOnServer browser command renders
// ./server-app/counter.ts with @gyral/core/server in Vitest's Node process, the test mounts the
// HTML, imports the same module and checks that it hydrates in place. Runs against development
// and production builds of core (the browser and browser-prod projects).
import { afterEach, describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { settled } from '@gyral/core';
import { hydrated, mountSsr, type MountedSsr } from '../src/index.js';

let page: MountedSsr | undefined;
afterEach(() => {
  page?.unmount();
  page = undefined;
});

const counters = (root: ParentNode) => [...root.querySelectorAll('test-server-counter')];
const inside = (host: Element | undefined, selector: string) =>
  host?.shadowRoot?.querySelector(selector) ?? undefined;

describe('renderOnServer', () => {
  it('renders a component class with props, which hydrates in place and stays interactive', async () => {
    const html = await commands.renderOnServer({
      module: './server-app/counter.ts',
      export: 'Counter',
      props: { start: 3, label: 'Plums' },
    });
    expect(html).toContain('<test-server-counter');
    expect(html).toContain('data-gyral-seed=');
    expect(html).toContain('<template shadowrootmode="open">');

    page = mountSsr(html);
    const [host] = counters(page.root);
    const output = inside(host, 'output');
    const button = inside(host, 'button');
    // Server markup paints before the component's module loads.
    expect(output?.textContent).toBe('3');
    expect(inside(host, 'p')?.textContent).toBe('Plums: 3');

    await import('./server-app/counter.js');
    await hydrated(page); // throws on a mismatch or any console error or warning
    expect(customElements.get('test-server-counter')).toBeDefined();
    expect(host?.hasAttribute('data-gyral-seed')).toBe(false);
    // Hydration kept the server's nodes.
    expect(inside(host, 'output')).toBe(output);
    expect(inside(host, 'button')).toBe(button);
    expect((host as (Element & { readonly state: unknown }) | undefined)?.state).toEqual({
      count: 3,
    });

    if (!(button instanceof HTMLButtonElement)) throw new Error('no button');
    button.click();
    await settled();
    expect(output?.textContent).toBe('4');
    expect(inside(host, 'output')).toBe(output);
  });

  it('renders a function export with the props as its argument', async () => {
    page = mountSsr(
      await commands.renderOnServer({
        module: './server-app/counter.ts',
        export: 'page',
        props: { heading: 'Fruit', start: 2 },
      }),
    );
    await import('./server-app/counter.js');
    const [apples, pears] = counters(page.root);
    const outputs = [inside(apples, 'output'), inside(pears, 'output')];
    await hydrated(page);
    expect(page.root.querySelector('h1')?.textContent).toBe('Fruit');
    expect([inside(apples, 'output'), inside(pears, 'output')]).toEqual(outputs);
    expect(outputs.map((o) => o?.textContent)).toEqual(['2', '20']);
    const button = inside(pears, 'button');
    if (!(button instanceof HTMLButtonElement)) throw new Error('no button');
    button.click();
    await settled();
    expect(outputs.map((o) => o?.textContent)).toEqual(['2', '21']);
  });

  it('returns the text of a Response, and renders a template result export', async () => {
    const doc = await commands.renderOnServer({
      module: './server-app/counter.ts',
      export: 'shell',
      props: { title: 'Shell' },
    });
    expect(doc).toContain('<title>Shell</title>');
    page = mountSsr(doc);
    expect(document.head.querySelector('meta[name="csrf-token"]')?.getAttribute('content')).toBe(
      't-1',
    );
    page.unmount();
    page = undefined;

    const plain = await commands.renderOnServer({ module: './server-app/counter.ts', dev: false });
    expect(plain).toBe('<p class="plain">a template result</p>');
  });

  it('names the exports when the one asked for is missing', async () => {
    await expect(
      commands.renderOnServer({ module: './server-app/counter.ts', export: 'Nope' }),
    ).rejects.toThrow(/no export "Nope" \(exports: .*Counter/);
  });
});
