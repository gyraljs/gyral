import { afterEach, expect, it, vi } from 'vitest';
import { initial, run, step } from '@gyral/testing';
import { Gallery } from '../src/gallery.js';
import { PIGMENTS, sorted } from '../src/pigments.js';

afterEach(() => {
  document.body.replaceChildren();
});

it('sorts by name, hue or lightness, and reverses, without touching the data', () => {
  expect(sorted('name', false)[0]?.name).toBe('Cerulean');
  expect(sorted('hue', false)[0]?.id).toBe('crimson');
  expect(sorted('lightness', false)[0]?.id).toBe('chartreuse');
  expect(sorted('lightness', true)[0]?.id).toBe('indigo');
  expect(PIGMENTS[0]?.id).toBe('ultramarine');
});

it('opening a card asks to focus Back; closing returns focus to the card', () => {
  const opened = step(Gallery.spec, initial(Gallery.spec).state, { _tag: 'Open', id: 'teal' });
  expect(opened.state.open).toBe('teal');
  expect(opened.commands.map((c) => c.onSuccess(undefined))).toEqual([
    { _tag: 'Focus', selector: '.back', preventScroll: false },
  ]);
  const closed = step(Gallery.spec, opened.state, { _tag: 'Close' });
  expect(closed.state.open).toBeUndefined();
  expect(closed.commands.map((c) => c.onSuccess(undefined))).toEqual([
    { _tag: 'Focus', selector: '[data-id="teal"]', preventScroll: true },
  ]);
  const focusing = step(Gallery.spec, closed.state, {
    _tag: 'Focus',
    selector: '.back',
    preventScroll: false,
  });
  expect(focusing.state).toBe(closed.state);
  expect(focusing.commands.map((c) => c.input)).toEqual([
    { selector: '.back', preventScroll: false },
  ]);
  expect(run(Gallery.spec, [{ _tag: 'Reverse' }, { _tag: 'Reverse' }]).state.reversed).toBe(false);
});

it('asks for a view transition on every change of state', () => {
  const s = initial(Gallery.spec).state;
  expect(Gallery.spec.viewTransition?.(s, { ...s, order: 'hue' }, { _tag: 'Sort' })).toBe(true);
  expect(Gallery.spec.viewTransition?.(s, s, { _tag: 'Focus' })).toBe(false);
});

it('renders in the light DOM, re-orders cards and keeps each swatch name', async () => {
  const el = document.createElement('gy-pigment-gallery');
  document.body.append(el);
  await el.updateComplete;
  expect(el.shadowRoot).toBeNull();
  const names = () => [...el.querySelectorAll('.card .name')].map((n) => n.textContent);
  expect(names()[0]).toBe('Cerulean');
  el.querySelector<HTMLInputElement>('input[value=lightness]')?.click();
  await vi.waitFor(() => {
    expect(names()[0]).toBe('Chartreuse');
  });
  const swatch = el.querySelector<HTMLElement>('[data-id=teal] .swatch');
  expect(swatch?.style.getPropertyValue('view-transition-name')).toBe('pigment-teal');

  el.querySelector<HTMLButtonElement>('[data-id=teal]')?.click();
  await vi.waitFor(() => {
    expect(el.querySelector('.detail h2')?.textContent).toBe('Teal');
  });
  await vi.waitFor(() => {
    expect(document.activeElement?.classList.contains('back')).toBe(true);
  });
  el.querySelector<HTMLButtonElement>('.back')?.click();
  await vi.waitFor(() => {
    expect(document.activeElement?.getAttribute('data-id')).toBe('teal');
  });
});
