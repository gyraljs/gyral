// Render skipping in production (browser-prod project, gyral-337.1): a host whose state, props and
// stores are unchanged doesn't run its view at all.
import { afterEach, expect, it } from 'vitest';
import { settled } from '../src/index.js';
import { DEV } from '../src/view/index.js';
import { Counter, text, views } from './render-skip-fixture.js';

afterEach(() => {
  document.body.replaceChildren();
});

it.runIf(!DEV)('runs the view only when its state, a prop or a store changed', async () => {
  const el = new Counter();
  document.body.append(el);
  await settled();
  views.count = 0;
  el.send({ _tag: 'Same' }); // same state
  el.label = ''; // the prop's value already
  el.send({ _tag: 'Hold' }); // the store keeps its state
  await settled();
  expect(views.count).toBe(0);
  el.send({ _tag: 'Next' });
  await settled();
  expect(views.count).toBe(1);
  el.label = 'a';
  await settled();
  expect(views.count).toBe(2);
  el.send({ _tag: 'Raise' });
  await settled();
  expect([views.count, text(el)]).toEqual([3, 'a:1:1']);
});
