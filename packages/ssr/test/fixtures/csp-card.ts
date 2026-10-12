import { css, define, html, prop } from '@gyral/core';
export const CspCard = define<
  { readonly width: number },
  { readonly _tag: 'Grow' },
  { readonly dark: boolean }
>()('csp-fixture-card', {
  props: { dark: prop.boolean() },
  init: () => ({ width: 120 }),
  intent: { Grow: true },
  update: { Grow: () => ({ width: 180 }) },
  view: (s, i, { props }) =>
    html`<article class=${props.dark ? 'local-dark' : 'default'}>
      <p style=${`inline-size: ${String(s.width)}px`}>Nested component styles</p>
      <button type="button" data-intent=${i.Grow}>Grow</button>
    </article>`,
  styles: css`
    @layer component {
      article {
        & p {
          color: rgb(10, 20, 30);
        }
      }
      @media (prefers-color-scheme: dark) {
        article {
          & p {
            color: rgb(210, 220, 230);
          }
        }
      }
      article.local-dark {
        & p {
          color: rgb(100, 110, 120);
        }
      }
    }
  `,
});
