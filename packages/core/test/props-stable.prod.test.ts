// A pick that captures ctx.props (gyral-bn7): props are a stable reference, so a pick result
// holding them equals the last one (one level, Object.is per entry) and every row is skipped
// while only the host's state changes; gymtime's calendar re-rendered every row. Production
// (browser-prod project): development's row check re-runs rows on purpose.
import { afterEach, expect, it } from 'vitest';
import { define, each, html, prop, settled, type TemplateResult } from '../src/index.js';
import { DEV } from '../src/view/index.js';

afterEach(() => {
  document.body.replaceChildren();
});

interface Props {
  readonly selected: string;
}
const rows = { count: 0 };
const Day = (day: string, { props }: { readonly props: Props }): TemplateResult => {
  rows.count += 1;
  return html`<li aria-current=${day === props.selected ? 'date' : null}>${day}</li>`;
};
const Week = define<
  { readonly days: readonly string[]; readonly ticks: number },
  { readonly _tag: 'Tick' },
  Props
>()('stable-props-week', {
  props: { selected: prop.string({ default: 'mon' }) },
  init: () => ({ days: ['mon', 'tue', 'wed'], ticks: 0 }),
  update: { Tick: (s) => ({ ...s, ticks: s.ticks + 1 }) },
  view: (s, _i, { props }) =>
    html`<p>${s.ticks}</p>
      <ul>
        ${each(
          s.days,
          (d) => d,
          Day,
          () => ({ props }),
        )}
      </ul>`,
});

it.runIf(!DEV)('skips rows whose pick holds ctx.props while no prop changes', async () => {
  const el = new Week();
  document.body.append(el);
  await settled();
  expect(rows.count).toBe(3);
  rows.count = 0;
  el.send({ _tag: 'Tick' });
  await settled();
  expect(rows.count).toBe(0);
  el.selected = 'tue';
  await settled();
  expect(rows.count).toBe(3);
  expect(el.shadowRoot?.querySelector('[aria-current]')?.textContent).toBe('tue');
});
