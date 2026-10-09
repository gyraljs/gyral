// Shared setup for the ADR 0024 regression cases (errors-cases*.ts): collects what Gyral reports,
// watches window for error events and unhandled rejections, and offers small helpers.
import { afterEach, beforeEach, expect } from 'vitest';
import { collectErrors, type Collected } from './collect-errors.js';
import { settled } from '../src/index.js';

export const boom = (): never => {
  throw new Error('boom');
};

export type El<S, M> = HTMLElement & { readonly state: S; send(msg: M): void };
export const mount = async <S, M>(tag: string): Promise<El<S, M>> => {
  const el = document.createElement(tag) as El<S, M>;
  document.body.append(el);
  await settled();
  return el;
};
export const shadow = (el: Element): string =>
  el.shadowRoot?.innerHTML.replace(/<!--[^>]*-->/g, '') ?? '';
export const click = (el: Element, selector = 'button'): void => {
  (el.shadowRoot?.querySelector(selector) as HTMLElement).click();
};
export const turn = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export type Msg =
  | { readonly _tag: 'Go' }
  | { readonly _tag: 'Got'; readonly v: number }
  | { readonly _tag: 'Reset' };

export interface Tracking {
  /** What Gyral reported, claimed so the run stays green. */
  reported: Collected;
  /** Every `error` event that reached window (bubble phase), Gyral's or not. */
  atWindow: ErrorEvent[];
}

/** Registers the per-test hooks; none of Gyral's failures may become unhandled rejections. */
export function trackErrors(): Tracking {
  const t = {} as Tracking;
  let rejections: unknown[] = [];
  const seeWindow = (event: ErrorEvent): void => {
    t.atWindow.push(event);
  };
  const seeRejection = (event: PromiseRejectionEvent): void => {
    rejections.push(event.reason);
  };
  beforeEach(() => {
    t.reported = collectErrors();
    t.atWindow = [];
    rejections = [];
    window.addEventListener('error', seeWindow);
    window.addEventListener('unhandledrejection', seeRejection);
  });
  afterEach(() => {
    t.reported.stop();
    window.removeEventListener('error', seeWindow);
    window.removeEventListener('unhandledrejection', seeRejection);
    document.body.replaceChildren();
    expect(rejections).toEqual([]);
  });
  return t;
}
