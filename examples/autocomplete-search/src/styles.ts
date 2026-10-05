import { css } from '@gyral/core';

export const styles = css`
  @layer component {
    :host {
      display: block;
      --accent: oklch(55% 0.17 160);
      --muted: color-mix(in oklch, currentColor 60%, transparent);
      --surface: oklch(99% 0 0);
    }
    @supports (color: light-dark(black, white)) {
      :host {
        --surface: light-dark(oklch(99% 0 0), oklch(25% 0.02 250));
      }
    }
    .field {
      display: grid;
      grid-template-columns: minmax(7rem, auto) 1fr;
      align-items: center;
      gap: 0.75rem;
      margin-block: 0 0.75rem;
    }
    .combo {
      position: relative;
      display: block;
    }
    .keys {
      display: block;
    }
    input {
      inline-size: 100%;
      font: inherit;
      padding: 0.4rem 0.6rem;
      border: 1px solid var(--muted);
      border-radius: 0.375rem;
      background: transparent;
      color: inherit;
    }
    input:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    /* Baseline: an absolutely positioned list under the field. */
    [role='listbox'] {
      position: absolute;
      inset-inline: 0;
      inset-block-start: calc(100% + 0.25rem);
      z-index: 1;
      margin: 0;
      padding: 0;
      list-style: none;
      max-block-size: 18rem;
      overflow-y: auto;
      border: 1px solid var(--muted);
      border-radius: 0.375rem;
      background: var(--surface);
      color: inherit;
      box-shadow: 0 0.25rem 1rem oklch(0% 0 0 / 0.15);
    }
    /* Enhanced: top layer (never clipped) and placed by anchor positioning. The condition
       must match ANCHOR_SUPPORT in popover.ts, which decides whether to use the popover. */
    @supports (anchor-name: --a) and (position-anchor: --a) and
      (position-area: block-end span-inline-end) and (position-try-fallbacks: flip-block) and
      (inline-size: anchor-size(inline)) {
      #query {
        anchor-name: --query;
      }
      [role='listbox'][popover] {
        position: fixed;
        position-anchor: --query;
        inset: auto;
        position-area: block-end span-inline-end;
        inline-size: anchor-size(inline);
        margin-block-start: 0.25rem;
        position-try-fallbacks: flip-block;
      }
    }
    [role='option'] {
      padding-block: 0.35rem;
      padding-inline: 0.6rem;
      cursor: pointer;
    }
    [role='option']:hover,
    [role='option'][aria-selected='true'] {
      background: color-mix(in oklch, var(--accent) 25%, transparent);
    }
    .status {
      min-block-size: 1.5em;
      margin-block: 0 0.75rem;
      color: var(--muted);
    }
  }
`;
