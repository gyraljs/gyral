import { define, each, html, nothing, type Next } from '@gyral/core';
import { debounce, delay } from '@gyral/time/delay';
import { popoverOpen } from './popover.js';
import { styles } from './styles.js';
import { suggest } from './wikipedia.js';

export const DEBOUNCE_MS = 300;

export interface State {
  readonly query: string;
  readonly suggestions: readonly string[];
  /** Index of the highlighted option, if any (aria-activedescendant). */
  readonly highlighted: number | undefined;
  readonly open: boolean;
  readonly status: 'idle' | 'loading' | 'error';
}

export type NavKey = 'ArrowDown' | 'ArrowUp' | 'Enter' | 'Escape';

export type Msg =
  | { readonly _tag: 'Typed'; readonly query: string }
  | { readonly _tag: 'Search'; readonly query: string }
  | { readonly _tag: 'Found'; readonly query: string; readonly titles: readonly string[] }
  | { readonly _tag: 'Failed'; readonly query: string }
  | { readonly _tag: 'Key'; readonly key: NavKey }
  | { readonly _tag: 'Pick'; readonly index: number }
  | { readonly _tag: 'Blurred' }
  | { readonly _tag: 'Dismiss' };

/** Long enough for a click on an option to land after the field loses focus. */
const BLUR_GRACE_MS = 150;

const NAV_KEYS: readonly string[] = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'];
const isNavKey = (key: string): key is NavKey => NAV_KEYS.includes(key);

const closed = (s: State): State => ({ ...s, open: false, highlighted: undefined });

/** Puts the chosen title in the field and closes the list (no new search). */
const select = (s: State, index: number): State => {
  const title = s.suggestions[index];
  return title === undefined ? s : { ...closed(s), query: title, suggestions: [] };
};

/** Arrow keys wrap around; the first press from "nothing highlighted" picks an end. */
export function move(s: State, delta: 1 | -1): State {
  const n = s.suggestions.length;
  if (n === 0) return s;
  const from = s.highlighted ?? (delta === 1 ? -1 : 0);
  return { ...s, open: true, highlighted: (from + delta + n) % n };
}

function onKey(s: State, key: NavKey): State {
  switch (key) {
    case 'ArrowDown':
      return move(s, 1);
    case 'ArrowUp':
      return move(s, -1);
    case 'Enter':
      return s.open && s.highlighted !== undefined ? select(s, s.highlighted) : s;
    case 'Escape':
      return closed(s);
  }
}

function onTyped(s: State, query: string): Next<State, Msg> {
  const next: State = { ...closed(s), query };
  if (query.trim() === '') return { ...next, suggestions: [], status: 'idle' };
  // Each keystroke restarts the timer: one search once typing pauses.
  return [next, [debounce<Msg>(DEBOUNCE_MS, { _tag: 'Search', query }, 'autocomplete')]];
}

function statusText(s: State): string {
  if (s.status === 'loading') return 'Searching…';
  if (s.status === 'error') return 'Suggestions are unavailable right now.';
  if (!s.open) return '';
  const n = s.suggestions.length;
  return `${String(n)} suggestion${n === 1 ? '' : 's'}. Use the up and down arrows to choose.`;
}

/** One suggestion; pure: its index, highlight and intent come through `pick`. */
const option = (title: string, [index, highlighted, pick]: readonly [number, boolean, string]) =>
  html`<li
    id="option-${String(index)}"
    role="option"
    aria-selected=${highlighted ? 'true' : 'false'}
    data-index=${index}
    data-intent=${pick}
  >
    ${title}
  </li>`;

export const Autocomplete = define<State, Msg>()('gy-autocomplete', {
  init: () => ({ query: '', suggestions: [], highlighted: undefined, open: false, status: 'idle' }),
  intent: {
    Typed: ({ value }) => ({ _tag: 'Typed', query: value ?? '' }),
    Key: ({ key, event }) => {
      if (key === undefined || !isNavKey(key) || (event as KeyboardEvent).isComposing) return;
      if (key === 'ArrowDown' || key === 'ArrowUp') event.preventDefault(); // keep the caret
      return { _tag: 'Key', key };
    },
    Blurred: () => ({ _tag: 'Blurred' }),
    Pick: ({ target }) => {
      const index = Number(target.getAttribute('data-index'));
      return Number.isInteger(index) ? { _tag: 'Pick', index } : undefined;
    },
  },
  update: {
    Typed: (s, m) => onTyped(s, m.query),
    Search: (s, m) =>
      m.query !== s.query
        ? s
        : [
            { ...s, status: 'loading' },
            [
              suggest<Msg>(
                m.query,
                (titles) => ({ _tag: 'Found', query: m.query, titles }),
                () => ({ _tag: 'Failed', query: m.query }),
              ),
            ],
          ],
    // Answers for an older query are ignored (the switch lane usually cancels them anyway).
    Found: (s, m) =>
      m.query !== s.query
        ? s
        : {
            ...s,
            suggestions: m.titles,
            open: m.titles.length > 0,
            highlighted: undefined,
            status: 'idle',
          },
    Failed: (s, m) => (m.query !== s.query ? s : { ...closed(s), status: 'error' }),
    Key: (s, m) => onKey(s, m.key),
    Pick: (s, m) => select(s, m.index),
    // Close when focus leaves the combobox, after a grace period so option clicks still land.
    Blurred: (s) => (s.open ? [s, [delay<Msg>(BLUR_GRACE_MS, { _tag: 'Dismiss' })]] : s),
    Dismiss: (s) => closed(s),
  },
  view: (s, i) => html`
    <div class="field">
      <label for="query">Wikipedia article</label>
      <span class="combo" data-intent=${i.Blurred} data-intent-on="focusout">
        <span class="keys" data-intent=${i.Key} data-intent-on="keydown">
          <input
            id="query"
            type="text"
            role="combobox"
            autocomplete="off"
            spellcheck="false"
            aria-autocomplete="list"
            aria-controls="suggestions"
            aria-expanded=${s.open ? 'true' : 'false'}
            aria-activedescendant=${
              s.highlighted === undefined ? nothing : `option-${String(s.highlighted)}`
            }
            value=${s.query}
            data-intent=${i.Typed}
          />
        </span>
        <ul
          id="suggestions"
          role="listbox"
          aria-label="Suggestions"
          ?hidden=${!s.open}
          ${popoverOpen(s.open)}
        >
          ${each(
            s.suggestions,
            (title) => title,
            option,
            (title) => {
              const index = s.suggestions.indexOf(title);
              return [index, index === s.highlighted, i.Pick] as const;
            },
          )}
        </ul>
      </span>
    </div>
    <p class="status" role="status">${statusText(s)}</p>
    <div class="field">
      <label for="other">Some field</label>
      <input id="other" type="text" />
    </div>
  `,
  styles,
});
