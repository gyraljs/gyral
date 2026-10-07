// Spec-field features in compiled builds (view/05-element.md "Features register themselves",
// gyral-c5d.12): view transitions, the frame lane and custom states are bundled only when some
// module the build transforms names `viewTransition`, `renderOnFrame` or `states`.
import { describe, expect, it } from 'vitest';
import { buildApp, CORE, VIEW } from './fixture.js';

/** An app whose component spec adds `extra`; `files` adds or replaces modules. */
const appWith = (extra: string, files: Record<string, string> = {}): Record<string, string> => ({
  'main.ts': `
    import { define } from ${JSON.stringify(CORE)};
    import { html } from ${JSON.stringify(VIEW)};
    export const C = define('x-c', {
      init: () => ({ on: false }),
      intent: {},
      update: { Flip: (s) => ({ on: !s.on }) },
      view: (s) => html\`<p>\${String(s.on)}</p>\`,
      ${extra}
    });
  `,
  ...files,
});

/** Which of the three features the production bundle carries. */
async function carried(files: Record<string, string>): Promise<Record<string, boolean>> {
  const { code } = await buildApp(files, { production: true });
  return {
    transitions: code.includes('startViewTransition'),
    frame: code.includes('requestAnimationFrame'),
    states: code.includes('attachInternals'),
  };
}

describe('spec-field features in compiled builds', () => {
  it('are left out when no module names them', async () => {
    expect(await carried(appWith(''))).toEqual({
      transitions: false,
      frame: false,
      states: false,
    });
  });

  it.each([
    ['transitions', 'viewTransition: () => true,'],
    ['frame', "renderOnFrame: ['Flip'],"],
    ['states', 'states: (s) => ({ on: s.on }),'],
  ])('carry %s when a spec names its field', async (feature, extra) => {
    const got = await carried(appWith(extra));
    expect(got).toEqual({
      transitions: feature === 'transitions',
      frame: feature === 'frame',
      states: feature === 'states',
    });
  });

  it('see a field named in another module, one without templates', async () => {
    const files = appWith('...extraSpec,', {
      'extra.ts': `export const extraSpec = { states: (s: { on: boolean }) => ({ on: s.on }) };`,
    });
    const main = files['main.ts'] ?? '';
    files['main.ts'] = `import { extraSpec } from './extra.ts';\n${main}`;
    expect((await carried(files)).states).toBe(true);
  });
});
