// ctx.props is a stable reference (gyral-bn7, ADR 0018's 0.3.9 addendum): the same object while
// every declared prop's value is the same, a new one when one changes. A pick, a store selector
// or a `PropsChanged` comparison that captures it then holds across renders.
import { afterEach, expect, it } from 'vitest';
import { define, html, prop, settled } from '../src/index.js';

afterEach(() => {
  document.body.replaceChildren();
});

type Msg = { readonly _tag: 'Next' };
const seen: unknown[] = [];
const Badge = define<
  { readonly n: number },
  Msg,
  { readonly label: string; readonly size: number }
>()('stable-props', {
  props: { label: prop.string({ default: '' }), size: prop.number({ default: 1 }) },
  init: () => ({ n: 0 }),
  update: { Next: (s, _m, { props }) => (seen.push(props), { n: s.n + 1 }) },
  view: (s, _i, { props }) => (seen.push(props), html`<p>${props.label}:${s.n}</p>`),
});

it('is the same object while every prop is unchanged, a new one when one changes', async () => {
  seen.length = 0;
  const el = new Badge();
  el.label = 'a';
  document.body.append(el);
  await settled();
  el.send({ _tag: 'Next' });
  await settled();
  el.label = 'a'; // the same value
  el.send({ _tag: 'Next' });
  await settled();
  const first = seen[0];
  expect(seen.length).toBeGreaterThan(3);
  expect(seen.every((props) => props === first)).toBe(true);
  el.label = 'b';
  await settled();
  const changed = seen.at(-1);
  expect(changed).not.toBe(first);
  expect(changed).toEqual({ label: 'b', size: 1 });
});
