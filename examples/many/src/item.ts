import { css, define, emit, html } from '@gyral/core';
import { styleMap } from 'lit/directives/style-map.js';

export interface ItemSeed {
  readonly id: number;
  readonly color: string;
  readonly width: number;
}

export interface ItemState {
  readonly color: string;
  readonly width: number;
}

export type ItemMsg =
  | { readonly _tag: 'Color'; readonly color: string }
  | { readonly _tag: 'Width'; readonly width: number }
  | { readonly _tag: 'Remove' };

export type ItemOutput = { readonly _tag: 'Removed' };

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * One list item. Its color and width are *local* state, seeded from the parent's props once
 * (as in Cycle's `usePropsReducer`); only removal is reported up.
 */
export const Item = define<ItemState, ItemMsg, { readonly item: ItemSeed }, ItemOutput>(
  'gy-many-item',
  {
    props: { item: { attribute: false } },
    init: ({ item }) => ({ color: item.color, width: item.width }),
    intent: {
      Color: ({ value }) =>
        value !== undefined && HEX.test(value) ? { _tag: 'Color', color: value } : undefined,
      Width: ({ value }) => ({ _tag: 'Width', width: Number(value) }),
      Remove: () => ({ _tag: 'Remove' }),
    },
    update: {
      Color: (s, m) => ({ ...s, color: m.color }),
      Width: (s, m) => ({ ...s, width: m.width }),
      Remove: (s) => [s, [emit({ _tag: 'Removed' })]],
    },
    view: (s, i, { props }) => html`
      <fieldset style=${styleMap({ '--color': s.color, '--width': `${String(s.width)}px` })}>
        <legend>Item ${props.item.id}</legend>
        <label>Color <input type="color" .value=${s.color} data-intent=${i.Color} /></label>
        <label>
          Width
          <input
            type="range"
            min="200"
            max="1000"
            .value=${String(s.width)}
            data-intent=${i.Width}
          />
        </label>
        <output>${s.width}</output>
        <button type="button" data-intent=${i.Remove}>Remove</button>
      </fieldset>
    `,
    styles: css`
      @layer component {
        :host {
          display: block;
          /* Off-screen items skip layout and paint: keeps 1000+ items responsive. */
          content-visibility: auto;
          contain-intrinsic-size: auto 7rem;
        }
        fieldset {
          inline-size: min(var(--width), 100%);
          margin-block: 0.5rem;
          padding: 1rem;
          border: 1px solid oklch(from var(--color) calc(l - 0.2) c h);
          border-radius: 0.5rem;
          background: var(--color);
          color: contrast-color(var(--color));
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
        }
        @supports not (color: contrast-color(red)) {
          fieldset {
            color: black;
            text-shadow: 0 0 2px white;
          }
        }
        output {
          font-variant-numeric: tabular-nums;
        }
      }
    `,
  },
);

declare global {
  interface HTMLElementTagNameMap {
    'gy-many-item': InstanceType<typeof Item>;
  }
}
