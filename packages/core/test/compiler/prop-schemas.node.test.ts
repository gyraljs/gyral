// Property-only prop checks out of production client builds (gyral-c5d.14, compiler/
// prop-schemas.ts): `prop.value(check)` can't run its check in production, so a check that is a
// plain reference or an inline function is replaced with `void 0` and tree-shakes; calls stay,
// and development builds keep everything.
import { describe, expect, it } from 'vitest';
import { buildApp } from './fixture.js';

const guards = `
  export const isItem = (u: unknown): u is { id: string } => typeof u === 'object' && u !== null && 'MARK_GUARD' in u;
  export const schemas = { item: (u: unknown): u is string => typeof u === 'string' && u !== 'MARK_MEMBER' };
  export const made = (mark: string) => (u: unknown): u is string => u !== mark;
`;

const component = (props: string, extra = ''): Record<string, string> => ({
  'guards.ts': guards,
  'main.ts': `
    import { define, html, prop } from '@gyral/core';
    import { isItem, schemas, made } from './guards.ts';
    ${extra}
    export const C = define('x-c', {
      props: { ${props} },
      init: () => ({}),
      intent: {},
      update: {},
      view: () => html\`<p>hi</p>\`,
    });
  `,
});

const build = (files: Record<string, string>, production: boolean) =>
  buildApp(files, { production, linkCore: true }).then((b) => b.code);

describe('prop.value checks in production client builds', () => {
  it('drop a referenced guard, a member chain and an inline function', async () => {
    const files = component(
      `item: prop.value(isItem), name: prop.value(schemas.item),
       inline: prop.value((u): u is number => typeof u === 'number' && u !== 424242)`,
    );
    const prod = await build(files, true);
    expect(prod).not.toContain('MARK_GUARD');
    expect(prod).not.toContain('MARK_MEMBER');
    expect(prod).not.toContain('424242');
    const dev = await build(files, false);
    expect(dev).toContain('MARK_GUARD');
    expect(dev).toContain('MARK_MEMBER');
    expect(dev).toContain('424242');
  });

  it('keep calls, prop.json checks and a local prop that shadows the import', async () => {
    const files = component(
      `made: prop.value(made('MARK_CALL')), json: prop.json(isItem)`,
      `function local() { const prop = { value: (x: unknown) => x }; return prop.value(schemas.item); }
       export const used = local();`,
    );
    const prod = await build(files, true);
    expect(prod).toContain('MARK_CALL');
    expect(prod).toContain('MARK_GUARD'); // prop.json parses attributes through it
    expect(prod).toContain('MARK_MEMBER'); // the local prop.value is not Gyral's
  });
});
