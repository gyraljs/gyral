// Switching the page's theme is a side effect on the document, so it is a driver (ADR 0006):
// the picker only returns a command, and tests swap the driver for a fake.
import { command, defineDriver, type Command } from '@gyral/core';

export const THEMES = ['calm', 'midnight', 'paper', 'brutalist'] as const;
export type Theme = (typeof THEMES)[number];

export const isTheme = (value: string | undefined): value is Theme =>
  (THEMES as readonly (string | undefined)[]).includes(value);

interface TransitionDocument {
  startViewTransition(update: () => void): unknown;
}

const canTransition = (doc: Document): doc is Document & TransitionDocument =>
  'startViewTransition' in doc && !matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Sets `<html data-theme>`, cross-fading the whole page where View Transitions exist. */
export const themeDriver = defineDriver<Theme, Theme>({
  name: 'theme',
  run: (theme) => {
    const apply = (): void => {
      document.documentElement.dataset['theme'] = theme;
    };
    if (canTransition(document)) document.startViewTransition(apply);
    else apply();
    return theme;
  },
});

/** Applies `theme` to the page. Only the newest choice matters. */
export const applyTheme = (theme: Theme): Command<never> =>
  command<Theme, Theme, unknown, never>(themeDriver, theme, {
    onSuccess: () => undefined,
    concurrency: 'switch',
  });
