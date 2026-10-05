import { afterEach, expect, it } from 'vitest';
import { mountDevtools } from '@gyral/devtools';
import { Demo } from '../src/demo.js';

afterEach(() => {
  document.body.replaceChildren();
});

it('feeds the devtools timeline with updates, store messages and command lanes', async () => {
  const tools = mountDevtools({ open: true });
  const el = new Demo();
  document.body.append(el);
  await el.updateComplete;
  const buttons = el.shadowRoot?.querySelectorAll('button') ?? [];
  buttons[0]?.click();
  buttons[1]?.click();
  await new Promise((r) => setTimeout(r, 0));
  await tools.panel.updateComplete;
  const text = tools.panel.shadowRoot?.textContent ?? '';
  expect(text).toContain('Increment');
  expect(text).toContain('store:tally');
  expect(text).toContain('issued time');
  expect(tools.panel.state.lanes.map((l) => l.lane)).toContain('save');
  tools.unmount();
});
