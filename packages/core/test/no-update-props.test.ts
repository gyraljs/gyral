// A component without `update` or `intent` (0.3.1, tag-only intents and optional tables) still
// re-renders when a prop changes: `PropsChanged` has no reducer, so the props are read as
// context on the next render (regression: before, `syncProps` threw without an `update` table).
import { afterEach, expect, it } from 'vitest';
import { define, html, prop, settled } from '../src/index.js';

const Badge = define<{ readonly seen: number }, never, { readonly label: string }>()(
  'test-no-update-badge',
  {
    props: { label: prop.string({ default: 'new' }) },
    init: () => ({ seen: 1 }),
    view: (s, _i, { props }) => html`<b>${props.label} ${s.seen}</b>`,
  },
);

afterEach(() => {
  document.body.replaceChildren();
});

it('re-renders on a prop change with no update or intent table', async () => {
  const el = new Badge();
  document.body.append(el);
  await settled();
  const text = () => el.shadowRoot?.querySelector('b')?.textContent;
  expect(text()).toBe('new 1');
  el.label = 'sale';
  await settled();
  expect(text()).toBe('sale 1');
  el.setAttribute('label', 'gone');
  await settled();
  expect(text()).toBe('gone 1');
});
