import { css, define, html, repeat, type Next } from '@gyral/core';
import { delay } from '@gyral/time';
import { unsafeCSS } from 'lit';
import { letterKeys } from './keyboard.js';

// Cycle's version ran a per-frame easing loop over every letter. Here the model only knows
// which letters are present or leaving; CSS transitions do the growing and shrinking.

/** How long a letter takes to grow in or shrink out. The model waits this long to drop it. */
export const TRANSITION_MS = 600;

export interface Letter {
  readonly key: string;
  /** Shrinking out; removed from the model once the transition has had time to finish. */
  readonly leaving: boolean;
}

export interface State {
  readonly letters: readonly Letter[];
}

export type Msg =
  | { readonly _tag: 'Key'; readonly letter: string }
  | { readonly _tag: 'Gone'; readonly letter: string };

const byKey = (a: Letter, b: Letter): number => a.key.localeCompare(b.key);

const setLeaving = (s: State, letter: string, leaving: boolean): State => ({
  letters: s.letters.map((l) => (l.key === letter ? { ...l, leaving } : l)),
});

/** Toggles a letter: absent → added, present → leaving (dropped later), leaving → back. */
export function toggle(s: State, letter: string): Next<State, Msg> {
  const existing = s.letters.find((l) => l.key === letter);
  if (existing === undefined) {
    return { letters: [...s.letters, { key: letter, leaving: false }].toSorted(byKey) };
  }
  if (existing.leaving) return setLeaving(s, letter, false);
  return [
    setLeaving(s, letter, true),
    // One lane per letter: toggling it again restarts its own timer, nobody else's.
    [delay<Msg>(TRANSITION_MS, { _tag: 'Gone', letter }, { key: `leave:${letter}` })],
  ];
}

export const AnimatedLetters = define<State, Msg>('gy-animated-letters', {
  init: () => [
    // The original starts with just "A"; "GYRAL" shows the staggered entrance.
    { letters: ['A', 'G', 'L', 'R', 'Y'].map((key) => ({ key, leaving: false })) },
    [letterKeys<Msg>((letter) => ({ _tag: 'Key', letter }))],
  ],
  intent: {},
  update: {
    Key: (s, m) => toggle(s, m.letter),
    // Ignore a stale timer if the letter came back while it was shrinking.
    Gone: (s, m) => ({ letters: s.letters.filter((l) => l.key !== m.letter || !l.leaving) }),
  },
  view: (s) => html`
    <p id="hint">Press a letter key (A–Z) to add it, or press it again to remove it.</p>
    <ul aria-label="Letters" aria-describedby="hint">
      ${repeat(
        s.letters,
        (l) => l.key,
        (l) =>
          html`<li class=${l.leaving ? 'out' : 'in'} aria-hidden=${l.leaving ? 'true' : 'false'}>
            ${l.key}
          </li>`,
      )}
    </ul>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
        --accent: oklch(55% 0.2 300);
        --stagger: 40ms;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        min-block-size: 3.6rem;
        color: var(--accent);
      }
      li {
        font-size: 3rem;
        font-weight: 700;
        line-height: 1.2;
        transition: font-size ${unsafeCSS(TRANSITION_MS)}ms ease-out;
      }
      /* Grow in from nothing when a letter is inserted. */
      @starting-style {
        li.in {
          font-size: 0;
        }
      }
      li.out {
        font-size: 0;
      }
      /* Stagger entrances (capped, so a late letter never waits long). */
      @supports (transition-delay: calc(sibling-index() * 1ms)) {
        li.in {
          transition-delay: calc(min(sibling-index() - 1, 5) * var(--stagger));
        }
      }
      @supports not (transition-delay: calc(sibling-index() * 1ms)) {
        li.in:nth-child(2) {
          transition-delay: calc(1 * var(--stagger));
        }
        li.in:nth-child(3) {
          transition-delay: calc(2 * var(--stagger));
        }
        li.in:nth-child(4) {
          transition-delay: calc(3 * var(--stagger));
        }
        li.in:nth-child(5) {
          transition-delay: calc(4 * var(--stagger));
        }
        li.in:nth-child(n + 6) {
          transition-delay: calc(5 * var(--stagger));
        }
      }
      @media (prefers-reduced-motion: reduce) {
        li {
          transition: none;
        }
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-animated-letters': InstanceType<typeof AnimatedLetters>;
  }
}
