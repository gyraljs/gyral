import { afterEach, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { step, virtualTime, type VirtualTime } from '@gyral/testing';
import { Panel, type Props, type State } from '../src/panel.js';
import '../src/race.js';
import { latency, searchCatalog } from '../src/search.js';

let clock: VirtualTime | undefined;

afterEach(() => {
  document.body.replaceChildren();
  clock?.restore();
  clock = undefined;
});

const changed = (prev: Props, props: Props) => ({ _tag: 'PropsChanged' as const, prev, props });
const empty: State = { results: undefined, requests: [] };

it('the simulated server is deterministic: shorter queries are slower', () => {
  expect([latency(''), latency('v'), latency('vi'), latency('vie'), latency('view')]).toEqual([
    0, 800, 500, 250, 250,
  ]);
  expect(searchCatalog('view')).toEqual(['ViewTransition', 'VisualViewport']);
  expect(searchCatalog('wor').slice(0, 2)).toEqual(['Worker', 'ServiceWorker']);
});

it('each panel asks for one search per keystroke; only the lane policy differs', () => {
  for (const mode of ['naive', 'switch'] as const) {
    const { state, commands } = step(
      Panel.spec,
      empty,
      changed({ query: '', mode }, { query: 'v', mode }),
      { query: 'v', mode },
    );
    expect(state.requests).toEqual([{ query: 'v', ms: 800, status: 'pending' }]);
    expect(commands).toHaveLength(1);
    expect(commands[0]?.concurrency).toBe(mode === 'naive' ? 'merge' : 'switch');
  }
});

it('switch marks the request in flight as cancelled in the log', () => {
  const props = { query: 'vi', mode: 'switch' as const };
  const pending: State = {
    results: undefined,
    requests: [{ query: 'v', ms: 800, status: 'pending' }],
  };
  const { state } = step(
    Panel.spec,
    pending,
    changed({ query: 'v', mode: 'switch' }, props),
    props,
  );
  expect(state.requests.map((r) => r.status)).toEqual(['pending', 'cancelled']);
});

async function typeFast(text: string, input: HTMLInputElement, time: VirtualTime) {
  for (let n = 1; n <= text.length; n += 1) {
    input.value = text.slice(0, n);
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await time.advance(120);
  }
}

it('typing fast: the naive panel ends stale, the switch panel shows the final query', async () => {
  clock = virtualTime();
  const race = document.createElement('gy-typeahead-race');
  document.body.append(race);
  await settled();
  const input = race.shadowRoot?.querySelector('input');
  if (!(input instanceof HTMLInputElement)) throw new Error('no input');
  await typeFast('view', input, clock);
  await clock.advance(1000); // every answer is back
  const [naive, switched] = [...(race.shadowRoot?.querySelectorAll('gy-search-panel') ?? [])];
  await settled();
  expect(naive?.state.results?.query).toBe('v'); // the slowest, oldest answer arrived last
  expect(naive?.shadowRoot?.querySelector('section')?.dataset['verdict']).toBe('stale');
  expect(switched?.state.results?.query).toBe('view');
  expect(switched?.shadowRoot?.querySelector('section')?.dataset['verdict']).toBe('fresh');
  expect(switched?.state.requests.map((r) => r.status)).toEqual([
    'arrived',
    'cancelled',
    'cancelled',
    'cancelled',
  ]);
});
