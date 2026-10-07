import { css, define, each, html } from '@gyral/core';

// The model only counts runs; the motion is a CSS animation the browser runs on its own
// (no per-frame state, no JS timer, no coordinates tweened in JS).

/** A keyframe: time (0..1), position in units of the travel distance, easing to the next stop. */
export interface Stop {
  readonly at: number;
  readonly x: number;
  readonly y: number;
  readonly ease: string;
}

/** The three legs of the original, in milliseconds: right, down, then a curve back home. */
const LEGS = [500, 500, 1600] as const;
export const DURATION_MS = LEGS[0] + LEGS[1] + LEGS[2];

const EASE_IN_CUBIC = 'cubic-bezier(0.32, 0, 0.67, 0)'; // tween.power3.easeIn
const EASE_OUT_CUBIC = 'cubic-bezier(0.33, 1, 0.68, 1)'; // tween.power3.easeOut
const ARC_STEPS = 12;

/** Inverse of easeInOutCubic: the fraction of the arc's time at which it reaches `progress`. */
const arcTime = (progress: number): number =>
  progress < 0.5 ? Math.cbrt(progress / 4) : 1 - Math.cbrt(2 * (1 - progress)) / 2;

const round = (n: number): number => Math.round(n * 1e4) / 1e4 || 0; // `|| 0` drops -0

/**
 * The original path as keyframe stops. The quarter circle (centre at (1, 0), from (1, 1) back to
 * (0, 0)) is sampled so its angle follows easeInOutCubic, like `tween.power3.easeInOut`.
 */
export function path(): readonly Stop[] {
  const right = LEGS[0] / DURATION_MS;
  const down = (LEGS[0] + LEGS[1]) / DURATION_MS;
  const stops: Stop[] = [
    { at: 0, x: 0, y: 0, ease: EASE_IN_CUBIC },
    { at: right, x: 1, y: 0, ease: EASE_OUT_CUBIC },
    { at: down, x: 1, y: 1, ease: 'linear' },
  ];
  for (let k = 1; k <= ARC_STEPS; k++) {
    const angle = (Math.PI / 2) * (1 + k / ARC_STEPS);
    stops.push({
      at: round(down + (1 - down) * arcTime(k / ARC_STEPS)),
      x: round(1 + Math.cos(angle)),
      y: round(Math.sin(angle)),
      ease: 'linear',
    });
  }
  return stops;
}

const offset = (n: number): string => `calc(var(--travel) * ${String(n)})`;

/** `@keyframes travel` for the stops, using the individual `translate` property. */
export function keyframes(stops: readonly Stop[]): string {
  const frames = stops.map(
    (s) =>
      `${(s.at * 100).toFixed(2)}% { translate: ${offset(s.x)} ${offset(s.y)}; ` +
      `animation-timing-function: ${s.ease}; }`,
  );
  return `@keyframes travel { ${frames.join(' ')} }`;
}

export interface State {
  /** How many times the animation was started. Each run gets a fresh element. */
  readonly runs: number;
}

export type Msg = { readonly _tag: 'Animate' };

/** One run's element; keyed by the run number, so each run gets a fresh one. */
const target = (run: number) => html`<div class=${run === 0 ? 'target' : 'target moving'}></div>`;

export const Animation = define<State, Msg>('gy-animation', {
  init: () => ({ runs: 0 }),
  intent: { Animate: () => ({ _tag: 'Animate' }) },
  update: { Animate: (s) => ({ runs: s.runs + 1 }) },
  view: (s, i) => html`
    <button type="button" data-intent=${i.Animate}>Animate it!</button>
    <div class="stage" aria-hidden="true">
      ${each(
        // A new key per run replaces the element, which restarts the CSS animation.
        [s.runs],
        (run) => run,
        target,
      )}
    </div>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
        container-type: inline-size;
        --accent: oklch(55% 0.2 260);
      }
      button {
        font: inherit;
        font-size: 1.25rem;
        padding-block: 0.5rem;
        padding-inline: 1rem;
        border: 1px solid var(--accent);
        border-radius: 0.5rem;
        background: oklch(from var(--accent) l c h / 0.1);
        color: inherit;
        cursor: pointer;
      }
      button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .stage {
        --size: 3.75rem;
        /* 250px like the original, but never wider than the component. */
        --travel: min(15.625rem, 100cqi - var(--size));
        inline-size: calc(var(--travel) + var(--size));
        block-size: calc(var(--travel) + var(--size));
        margin-block-start: 1.25rem;
      }
      .target {
        inline-size: var(--size);
        aspect-ratio: 1;
        border-radius: 0.25rem;
        background: var(--accent);
      }
      .moving {
        animation: travel ${DURATION_MS}ms both;
      }
      ${keyframes(path())}
      @keyframes flash {
        50% {
          opacity: 0.3;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .moving {
          animation: flash 400ms;
        }
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-animation': InstanceType<typeof Animation>;
  }
}
