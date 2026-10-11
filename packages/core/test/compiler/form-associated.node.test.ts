import { expect, it } from 'vitest';
import { buildApp, CORE, VIEW } from './fixture.js';

const app = (form: boolean) => ({
  'main.ts': `import { define } from ${JSON.stringify(CORE)};
    import { html } from ${JSON.stringify(VIEW)};
    export const Field = define()('x-field', {
      ${form ? "formAssociated: { value: () => 'hello' }," : ''}
      view: () => html\`<p>Field</p>\`,
    });`,
});

it('includes native form machinery only when formAssociated is named', async () => {
  expect((await buildApp(app(false), { production: true })).code).not.toContain('setFormValue');
  const built = await buildApp(app(true), { production: true });
  expect(built.code).toContain('setFormValue');
  expect(built.code).toContain('setValidity');
});
