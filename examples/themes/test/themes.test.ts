import axe from 'axe-core';
import { afterEach, expect, it } from 'vitest';
import { commandsFor, fakeDriver, run } from '@gyral/testing';
import { Board } from '../src/board.js';
import { Picker } from '../src/picker.js';
import '../src/themes.css';
import { THEMES, themeDriver, type Theme } from '../src/theme-driver.js';

afterEach(() => {
  document.body.replaceChildren();
  delete document.documentElement.dataset['theme'];
});

it('picking a theme is state plus one command for the theme driver', () => {
  const { state, commands } = run(Picker.spec, [{ _tag: 'Pick', theme: 'paper' }]);
  expect(state.theme).toBe('paper');
  expect(commandsFor(commands, themeDriver).map((c) => c.input)).toEqual(['paper']);
});

it('the board toggles and resets tasks', () => {
  const { state } = run(Board.spec, [
    { _tag: 'Toggle', id: 'demo', done: true },
    { _tag: 'Toggle', id: 'ship', done: true },
  ]);
  expect(state.tasks.every((t) => t.done)).toBe(true);
  expect(run(Board.spec, [{ _tag: 'Reset' }]).state.tasks.filter((t) => t.done)).toHaveLength(2);
});

it('the picker sends the chosen theme to the driver', async () => {
  const theme = fakeDriver<Theme, Theme>(themeDriver, { impl: (t) => t });
  const picker = document.createElement('gy-theme-picker');
  picker.drivers = { theme };
  document.body.append(picker);
  await picker.updateComplete;
  picker.shadowRoot?.querySelector<HTMLInputElement>('input[value=brutalist]')?.click();
  await picker.updateComplete;
  // pipewise lanes start drivers a few microtasks after the command is issued.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(theme.inputs).toEqual(['brutalist']);
});

it.each(THEMES)('the %s theme passes axe, contrast included', async (theme) => {
  document.documentElement.dataset['theme'] = theme;
  const picker = document.createElement('gy-theme-picker');
  const board = document.createElement('gy-team-board');
  document.body.append(picker, board);
  await picker.updateComplete;
  await board.updateComplete;
  const result = await axe.run(document.body, { runOnly: ['wcag2a', 'wcag2aa'] });
  expect(
    result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`),
  ).toEqual([]);
});
