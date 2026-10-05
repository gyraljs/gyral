import { define, focus, html, liveBoolean, repeat, styleMap } from '@gyral/core';
import { delay } from '@gyral/time';
import { ORDERS, css, findPigment, isOrder, sorted, type Order, type Pigment } from './pigments.js';

export interface State {
  readonly order: Order;
  readonly reversed: boolean;
  /** The pigment shown large, if any. */
  readonly open: string | undefined;
}

export type Msg =
  | { readonly _tag: 'Sort'; readonly order: Order }
  | { readonly _tag: 'Reverse' }
  | { readonly _tag: 'Open'; readonly id: string }
  | { readonly _tag: 'Close' }
  | { readonly _tag: 'Focus'; readonly selector: string; readonly preventScroll: boolean };

const LABELS: Readonly<Record<Order, string>> = {
  name: 'Name',
  hue: 'Hue',
  lightness: 'Lightness',
};

/**
 * Each swatch keeps one `view-transition-name` wherever it is drawn (in the grid or large),
 * so the browser animates it from its old place and size to its new one. Cards are named
 * too, so a whole card travels with its swatch when the grid is re-sorted.
 */
const named = (p: Pigment) =>
  styleMap({ 'view-transition-name': `pigment-${p.id}`, background: css(p) });

/**
 * Moves focus one turn later. WORKAROUND: a focus() command returned by a reducer whose change
 * renders inside a View Transition runs before that render, so it finds nothing to focus
 * (reported against @gyral/core). Deferring it to its own message lets it wait for the render.
 */
const focusSoon = (selector: string, preventScroll = false) =>
  delay<Msg>(0, { _tag: 'Focus', selector, preventScroll });

const card = (p: Pigment, open: string) =>
  html`<li>
    <button
      type="button"
      class="card"
      data-id=${p.id}
      data-intent=${open}
      style=${styleMap({ 'view-transition-name': `card-${p.id}` })}
    >
      <span class="swatch" style=${named(p)}></span>
      <span class="name">${p.name}</span>
      <code>${css(p)}</code>
    </button>
  </li>`;

/**
 * A light-DOM component (ADR 0014): its markup is ordinary page content and the page's
 * stylesheet styles it. `viewTransition` asks for a View Transition on every change below,
 * which is all the animation code there is.
 */
export const Gallery = define<State, Msg>('gy-pigment-gallery', {
  shadow: false,
  init: () => ({ order: 'name', reversed: false, open: undefined }),
  // Animate every change of state (Focus changes none).
  viewTransition: (prev, next) => prev !== next,
  intent: {
    Sort: ({ value }) => (isOrder(value) ? { _tag: 'Sort', order: value } : undefined),
    Reverse: () => ({ _tag: 'Reverse' }),
    Open: ({ target }) => {
      const id = target.getAttribute('data-id');
      return id === null ? undefined : { _tag: 'Open', id };
    },
    Close: () => ({ _tag: 'Close' }),
  },
  update: {
    Sort: (s, m) => ({ ...s, order: m.order }),
    Reverse: (s) => ({ ...s, reversed: !s.reversed }),
    Open: (s, m) => [{ ...s, open: m.id }, [focusSoon('.back')]],
    // Back in the grid, focus returns to the card that was opened.
    Close: (s) =>
      s.open === undefined
        ? s
        : [{ ...s, open: undefined }, [focusSoon(`[data-id="${s.open}"]`, true)]],
    Focus: (s, m) => [s, [focus(m.selector, { preventScroll: m.preventScroll })]],
  },
  view: (s, i) => {
    const pigment = findPigment(s.open);
    if (pigment !== undefined) {
      return html`<article class="detail">
        <div class="swatch" style=${named(pigment)}></div>
        <div class="about">
          <h2>${pigment.name}</h2>
          <p>${pigment.note}</p>
          <p><code>${css(pigment)}</code></p>
          <button type="button" class="back" data-intent=${i.Close}>Back to all pigments</button>
        </div>
      </article>`;
    }
    return html`
      <div class="toolbar">
        <fieldset>
          <legend>Sort by</legend>
          ${ORDERS.map(
            (order) =>
              html`<label>
                <input
                  type="radio"
                  name="order"
                  value=${order}
                  ?checked=${liveBoolean(s.order === order)}
                  data-intent=${i.Sort}
                />
                ${LABELS[order]}
              </label>`,
          )}
        </fieldset>
        <button
          type="button"
          aria-pressed=${s.reversed ? 'true' : 'false'}
          data-intent=${i.Reverse}
        >
          Reverse
        </button>
      </div>
      <ol class="cards">
        ${repeat(
          sorted(s.order, s.reversed),
          (p) => p.id,
          (p) => card(p, i.Open),
        )}
      </ol>
    `;
  },
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-pigment-gallery': InstanceType<typeof Gallery>;
  }
}
