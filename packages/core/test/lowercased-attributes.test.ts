// A camelCase prop's name written as an attribute where no template rule sees it: a page's HTML,
// or a host framework setting attributes (gyral-k97.5). HTML lowercases attribute names, so
// `playerBase="7"` arrives as `playerbase`, and the prop reads `player-base`. Development warns
// at the host's first connect (G0024); templates are checked as they are written (rule 16).
import { afterEach, expect, it, vi } from 'vitest';
import { define, html, prop, settled } from '../src/index.js';

const Card = define()('test-lc-card', {
  props: { playerBase: prop.number(), label: prop.string() },
  view: (_s, _i, ctx) => html`<p>${ctx.props.label}: ${ctx.props.playerBase}</p>`,
});
define()('test-lc-override', {
  props: { playerBase: prop.number({ attribute: 'playerbase' }) },
  view: (_s, _i, ctx) => html`<p>${ctx.props.playerBase}</p>`,
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const warnings = () => vi.spyOn(console, 'warn').mockImplementation(() => undefined);

it('warns once, at connect, about an attribute HTML lowercased from a camelCase prop', async () => {
  const warn = warnings();
  document.body.innerHTML = '<test-lc-card playerBase="7" label="Ann"></test-lc-card>';
  const el = document.querySelector('test-lc-card') as InstanceType<typeof Card>;
  await settled();
  expect(el).toBeInstanceOf(Card);
  expect(el.playerBase).toBeUndefined();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(String(warn.mock.calls[0]?.[0])).toBe(
    '<test-lc-card> has a "playerbase" attribute, which no prop reads: HTML lowercases ' +
      'attribute names, and prop playerBase reads "player-base". Write player-base="…", or set ' +
      'the property (el.playerBase = …).',
  );
  el.remove();
  document.body.append(el); // a reconnect: no second warning
  await settled();
  expect(warn).toHaveBeenCalledTimes(1);
});

it("says nothing for the prop's own attribute, or an attribute: override in lower case", async () => {
  const warn = warnings();
  document.body.innerHTML =
    '<test-lc-card player-base="7" label="Ann"></test-lc-card>' +
    '<test-lc-override playerbase="3"></test-lc-override>';
  await settled();
  expect(warn).not.toHaveBeenCalled();
  expect(document.body.textContent).toBe('');
  expect(document.querySelector('test-lc-card')?.shadowRoot?.textContent).toBe('Ann: 7');
  expect(document.querySelector('test-lc-override')?.shadowRoot?.textContent).toBe('3');
});
