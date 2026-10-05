import { define, html } from '@gyral/core';
import './panel.js';
import { raceStyles } from './styles.js';

export interface State {
  readonly query: string;
}

export type Msg = { readonly _tag: 'Typed'; readonly query: string };

/** One field drives both panels, so they see exactly the same keystrokes. */
export const Race = define<State, Msg>('gy-typeahead-race', {
  init: () => ({ query: '' }),
  intent: {
    Typed: ({ value }) => ({ _tag: 'Typed', query: value ?? '' }),
  },
  update: {
    Typed: (_s, m) => ({ query: m.query }),
  },
  view: (s, i) => html`
    <p class="field">
      <label for="query">Search web platform APIs</label>
      <input
        id="query"
        type="search"
        autocomplete="off"
        spellcheck="false"
        .value=${s.query}
        data-intent=${i.Typed}
      />
    </p>
    <div class="panels">
      <gy-search-panel mode="naive" .query=${s.query}></gy-search-panel>
      <gy-search-panel mode="switch" .query=${s.query}></gy-search-panel>
    </div>
  `,
  styles: raceStyles,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-typeahead-race': InstanceType<typeof Race>;
  }
}
