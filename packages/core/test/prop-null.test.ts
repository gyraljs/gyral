// A prop's `default` replaces only `undefined` (view/05 "Props"): `null` is a value, so a
// nullable schema gives components an explicit "nobody" next to the default.
import * as v from 'valibot';
import { afterEach, describe, expect, it } from 'vitest';
import { define, html, prop, settled, type PropsOf, type Stateless } from '../src/index.js';

const props = {
  owner: prop.value(v.nullable(v.string()), { default: 'the team' }),
  reviewer: prop.json(v.nullable(v.string()), { default: 'the team' }),
};

const Owner = define<Stateless, never, PropsOf<typeof props>>('test-prop-null', {
  props,
  intent: {},
  update: {},
  view: (_s, _i, { props }) =>
    html`<p>${props.owner ?? 'nobody'}</p>
      <i>${props.reviewer ?? 'nobody'}</i>`,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('prop defaults and null', () => {
  it('replaces undefined with the default and keeps null', async () => {
    const el = new Owner();
    document.body.append(el);
    await settled();
    const text = (selector: string) => el.shadowRoot?.querySelector(selector)?.textContent;
    expect([text('p'), text('i')]).toEqual(['the team', 'the team']);

    el.owner = null;
    el.setAttribute('reviewer', 'null');
    await settled();
    expect([text('p'), text('i')]).toEqual(['nobody', 'nobody']);

    el.owner = undefined as unknown as null; // "unset": the default again
    el.removeAttribute('reviewer');
    await settled();
    expect([text('p'), text('i')]).toEqual(['the team', 'the team']);
  });
});
