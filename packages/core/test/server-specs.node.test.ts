// A tag defined twice outside the browser (gyral-ejc): the first definition wins, as with
// `customElements`, until `replaceDefinitions()` (which gyralDevServer calls, since Vite runs an
// edited component module again); then the later spec replaces the server registry entry.
import { describe, expect, it } from 'vitest';
import { css, define, html, type Stateless } from '../src/index.js';
import { registryVersion, renderToString, replaceDefinitions } from '../src/server.js';

const greeting = (text: string, color: string) =>
  define<Stateless>()('test-node-redefined', {
    view: () => html`<p>${text}</p>`,
    styles: css`
      p {
        color: ${color};
      }
    `,
  });

const page = (): string => renderToString(html`<test-node-redefined></test-node-redefined>`);

describe('a tag defined again outside the browser', () => {
  it('keeps the first definition', () => {
    greeting('first', 'red');
    expect(page()).toContain('<p>first</p>');
    const version = registryVersion();
    greeting('second', 'blue');
    expect(page()).toContain('<p>first</p>');
    expect(page()).toContain('color: red');
    expect(registryVersion()).toBe(version);
  });

  it('takes the later definition after replaceDefinitions(), and changes the registry version', () => {
    replaceDefinitions();
    const version = registryVersion();
    greeting('edited', 'green');
    expect(page()).toContain('<p>edited</p>');
    expect(page()).toContain('color: green');
    expect(registryVersion()).toBe(version + 1);
    // Renders without another definition keep the entry and the version.
    page();
    expect(registryVersion()).toBe(version + 1);
  });
});
