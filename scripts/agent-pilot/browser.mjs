import assert from 'node:assert/strict';

const button = (page, name) => page.getByRole('button', { name, exact: true });
const field = (page, name) => page.getByLabel(name, { exact: true });
async function add(page, title) {
  await field(page, 'New task').fill(title);
  await button(page, 'Add task').click();
}
async function equal(read, expected) {
  const deadline = Date.now() + 1500;
  let actual;
  do {
    actual = await read();
    if (JSON.stringify(actual) === JSON.stringify(expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  assert.deepEqual(actual, expected);
}
const titles = (page) =>
  page
    .getByRole('checkbox')
    .evaluateAll((nodes) => nodes.map((node) => node.labels?.[0]?.textContent?.trim()));
const count = (page, expected) =>
  equal(async () => {
    const text = await page.getByRole('status').allTextContents();
    return text.some((value) => new RegExp(`\\b${expected}\\b`).test(value));
  }, true);

export const taskCases = {
  'blank and trimmed additions': async (page) => {
    await add(page, '  ');
    await equal(() => page.getByRole('checkbox').count(), 0);
    await add(page, '  Alpha  ');
    await equal(() => titles(page), ['Alpha']);
    await equal(() => field(page, 'New task').inputValue(), '');
    await count(page, 1);
  },
  'unfiltered completion and restoration': async (page) => {
    await add(page, 'Alpha');
    await add(page, 'Beta');
    await field(page, 'Alpha').check();
    await count(page, 1);
    await field(page, 'Alpha').uncheck();
    await count(page, 2);
    await equal(() => titles(page), ['Alpha', 'Beta']);
  },
  'filters and insertion order': async (page) => {
    await add(page, 'Alpha');
    await add(page, 'Beta');
    await add(page, 'Gamma');
    await field(page, 'Alpha').check();
    await button(page, 'Active').click();
    await equal(() => titles(page), ['Beta', 'Gamma']);
    await button(page, 'Completed').click();
    await equal(() => titles(page), ['Alpha']);
    await button(page, 'All').click();
    await equal(() => titles(page), ['Alpha', 'Beta', 'Gamma']);
  },
  'deletion preserves other tasks': async (page) => {
    await add(page, 'Alpha');
    await add(page, 'Beta');
    await add(page, 'Gamma');
    await button(page, 'Delete Beta').click();
    await equal(() => titles(page), ['Alpha', 'Gamma']);
    await field(page, 'Gamma').check();
    await count(page, 1);
    await button(page, 'Completed').click();
    await equal(() => titles(page), ['Gamma']);
  },
  'filtered task identity': async (page) => {
    await add(page, 'Alpha');
    await add(page, 'Beta');
    await add(page, 'Gamma');
    await field(page, 'Alpha').check();
    await button(page, 'Active').click();
    await field(page, 'Beta').click();
    await equal(() => titles(page), ['Gamma']);
    await count(page, 1);
    await button(page, 'Completed').click();
    await equal(() => titles(page), ['Alpha', 'Beta']);
    await field(page, 'Beta').click();
    await button(page, 'Active').click();
    await equal(() => titles(page), ['Beta', 'Gamma']);
  },
};

async function invalid(page, name) {
  const control = field(page, name);
  await equal(() => control.getAttribute('aria-invalid'), 'true');
  const associated = await control.evaluate((node) => {
    const ids = node.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
    const root = node.getRootNode();
    return ids.some((id) =>
      [...root.querySelectorAll('[id]')].some(
        (error) =>
          error.id === id &&
          error.textContent?.trim() &&
          error.getClientRects().length > 0 &&
          node.ownerDocument.defaultView?.getComputedStyle(error).visibility !== 'hidden',
      ),
    );
  });
  assert.equal(associated, true, `${name} needs an associated field error`);
}
const focused = (page, name) =>
  equal(
    () => field(page, name).evaluate((node) => node.getRootNode().activeElement === node),
    true,
  );
async function validValues(page) {
  await field(page, 'Name').fill('  Ada  ');
  await field(page, 'Email').fill('ada@example.com');
  await field(page, 'I agree to the terms').check();
}
async function success(page) {
  await equal(async () => {
    const text = (await page.getByRole('status').allTextContents()).join(' ');
    return text.includes('Ada') && text.includes('ada@example.com');
  }, true);
  await equal(() => page.locator('[aria-invalid="true"]').count(), 0);
  assert.equal((await page.getByRole('alert').allTextContents()).join('').trim(), '');
  assert.equal((await field(page, 'Name').inputValue()).trim(), 'Ada');
  assert.equal(await field(page, 'Email').inputValue(), 'ada@example.com');
  assert.equal(await field(page, 'I agree to the terms').isChecked(), true);
}
export const formCases = {
  'multiple errors and first focus': async (page) => {
    await button(page, 'Sign up').click();
    for (const name of ['Name', 'Email', 'I agree to the terms']) await invalid(page, name);
    assert.ok((await page.getByRole('alert').allTextContents()).join('').trim());
    await focused(page, 'Name');
  },
  'native email validity and value preservation': async (page) => {
    await field(page, 'Name').fill('Ada');
    await field(page, 'Email').fill('bad-address');
    await field(page, 'I agree to the terms').check();
    await field(page, 'Email').press('Enter');
    await invalid(page, 'Email');
    await focused(page, 'Email');
    assert.equal(await field(page, 'Name').inputValue(), 'Ada');
    assert.equal(await field(page, 'Email').inputValue(), 'bad-address');
    assert.equal(await field(page, 'I agree to the terms').isChecked(), true);
  },
  'correction and mouse submission': async (page) => {
    await button(page, 'Sign up').click();
    await invalid(page, 'Name');
    await validValues(page);
    await button(page, 'Sign up').click();
    await success(page);
  },
  'trimmed name minimum and Enter submission': async (page) => {
    await validValues(page);
    await field(page, 'Name').fill('  A  ');
    await field(page, 'Name').press('Enter');
    await invalid(page, 'Name');
    await focused(page, 'Name');
    await field(page, 'Name').fill('  Ada  ');
    await field(page, 'Name').press('Enter');
    await success(page);
  },
};

export async function browserCases(browser, url, task, output) {
  const context = await browser.newContext({
    viewport: { width: 1000, height: 720 },
    serviceWorkers: 'block',
  });
  const errors = [];
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === new URL(url).origin
      ? route.continue()
      : route.abort(),
  );
  await context.routeWebSocket('**/*', (socket) => socket.close());
  const page = await context.newPage();
  page.setDefaultTimeout(1800);
  page.on('pageerror', (error) => errors.push(String(error)));
  const results = [];
  try {
    for (const [name, run] of Object.entries(task === 'form' ? formCases : taskCases)) {
      const result = { name, passed: false };
      try {
        await page.goto(url);
        await run(page);
        result.passed = true;
      } catch (error) {
        result.error = String(error);
      }
      const screenshot = `${results.length + 1}.png`;
      await page.screenshot({ path: `${output}/${screenshot}`, fullPage: true });
      results.push({ ...result, screenshot });
    }
  } finally {
    await context.close();
  }
  return {
    passed: results.every((result) => result.passed) && errors.length === 0,
    cases: results,
    pageErrors: errors,
  };
}
