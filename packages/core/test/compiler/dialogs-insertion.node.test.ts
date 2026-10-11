// Exercise actual production compiler feature registration and native Chromium dialogs.
import { expect, it } from 'vitest';
import { chromium } from 'playwright';
import { buildApp } from './fixture.js';

it('opens conditional, keyed and initial dialogs in a compiled client-only production build', async () => {
  const built = await buildApp(
    {
      'main.ts': `
      import { define, html, keyed } from '@gyral/core';
      const update = {
        Open: (s) => ({ ...s, open: true }),
        Close: (s) => ({ ...s, open: false }),
        Replace: (s) => ({ ...s, key: s.key + 1 }),
      };
      const modal = (s, i) => html\`<dialog ?modal=\${s.open} aria-label="Confirm action">
        <button type="button" data-intent=\${i.Replace}>Replace</button>
        <button type="button" data-intent=\${i.Close}>Close</button>
      </dialog>\`;
      const intent = { Open: true, Close: true, Replace: true };
      const Initial = define()('compiled-modal-initial', {
        init: () => ({ open: true, key: 0 }), intent, update, view: modal,
      });
      const Conditional = define()('compiled-modal-conditional', {
        init: () => ({ open: false, key: 0 }), intent, update,
        view: (s, i) => s.open ? modal(s, i) : html\`<button type="button" data-intent=\${i.Open}>Open</button>\`,
      });
      const Keyed = define()('compiled-modal-keyed', {
        init: () => ({ open: false, key: 0 }), intent, update,
        view: (s, i) => html\`<button type="button" data-intent=\${i.Open}>Open</button>\${keyed(s.key, modal(s, i))}\`,
      });
      document.body.append(new Initial(), new Conditional(), new Keyed());
    `,
    },
    { production: true, clientOnly: true, linkCore: true },
  );
  expect(built.chunks).toHaveLength(1);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const failures: string[] = [];
    page.on('pageerror', (error) => {
      failures.push(error.message);
    });
    await page.setContent(
      '<!doctype html><html lang="en"><title>Modal regression</title><body></body></html>',
    );
    await page.addScriptTag({ type: 'module', content: built.code });
    const initial = page.locator('compiled-modal-initial');
    await initial.locator('dialog:modal').waitFor();
    await initial.getByRole('button', { name: 'Close' }).click();
    const conditional = page.locator('compiled-modal-conditional');
    await conditional.getByRole('button', { name: 'Open' }).click();
    await conditional.locator('dialog:modal').waitFor();
    await conditional.getByRole('button', { name: 'Close' }).click();
    const keyed = page.locator('compiled-modal-keyed');
    await keyed.getByRole('button', { name: 'Open' }).click();
    const old = await keyed.locator('dialog:modal').elementHandle();
    await keyed.getByRole('button', { name: 'Replace' }).click();
    await keyed.locator('dialog:modal').waitFor();
    expect(await old.evaluate((node) => node.isConnected)).toBe(false);
    await keyed.getByRole('button', { name: 'Close' }).click();
    expect(await keyed.locator('dialog').evaluate((node) => node.hasAttribute('open'))).toBe(false);
    expect(failures).toEqual([]);
  } finally {
    await browser.close();
  }
}, 60_000);
