// define() outside the browser (docs/design-docs/view/05-element.md "Registration"): no
// custom element, a placeholder class, and an entry in the server registry for Phase 4.
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { beforeAll, describe, expect, it } from 'vitest';
import { css, define, html, isLightComponent, prop, type Stateless } from '../src/index.js';
import { registerRecordedSpecs } from '../src/server-component.js';
import { serverComponent } from '../src/view/index.js';

const strings: StandardSchemaV1<readonly string[]> = {
  '~standard': { version: 1, vendor: 't', validate: (v) => ({ value: v as readonly string[] }) },
};

type Msg = { readonly _tag: 'Add'; readonly n: number };

const Counter = define<
  { readonly count: number },
  Msg,
  { readonly start: number; readonly tags: readonly string[] }
>('test-node-counter', {
  props: {
    start: prop.number({ default: 1 }),
    tags: prop.value(strings, { default: [] }),
  },
  init: (p) => ({ count: p.start }),
  intent: {},
  update: { Add: (s, m) => ({ count: s.count + m.n }) },
  view: (s, _i, { props }) => html`<p>${s.count} ${props.tags.join(',')}</p>`,
  styles: css`
    p {
      color: red;
    }
  `,
});

const Light = define<Stateless, never>('test-node-light', {
  shadow: false,
  hydrate: 'visible',
  intent: {},
  update: {},
  view: () => html`<p></p>`,
});

describe('define() without a DOM', () => {
  beforeAll(() => {
    registerRecordedSpecs(); // what the Phase 4 server entry does before rendering
  });

  it('returns a placeholder carrying the spec and tag', () => {
    expect(Counter.tagName).toBe('test-node-counter');
    expect(Counter.spec.init).toBeTypeOf('function');
    expect(isLightComponent(Light)).toBe(true);
    expect(() => new Counter()).toThrow(/browser element/);
  });

  it('registers a server component that parses props, runs init and the view', () => {
    const entry = serverComponent('test-node-counter');
    expect(entry?.light).toBe(false);
    expect(entry?.hydrate).toBe('load');
    expect(entry?.styles).toEqual([expect.stringContaining('color: red')]);
    const out = entry?.render({
      attributes: { start: '5' },
      properties: { tags: ['a', 'b'] },
      initialMessages: [{ _tag: 'Add', n: 2 }],
    });
    // State differs from init(props) after the message, so the seed carries it; `tags` only
    // travelled as a property, so the seed carries it too.
    expect(out?.seed).toEqual({ state: { count: 7 }, props: { tags: ['a', 'b'] } });
    expect(serverComponent('test-node-light')?.hydrate).toBe('visible');
  });

  it('leaves state out of the seed when it equals init(props)', () => {
    const out = serverComponent('test-node-counter')?.render({ attributes: {}, properties: {} });
    expect(out?.seed).toEqual({ props: {} });
  });
});
