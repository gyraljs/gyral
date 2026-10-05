import { describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { renderToString } from '../src/index.js';
import './support/light.js';

const render = () =>
  renderToString(html`<test-light-page></test-light-page><test-shadow-host></test-shadow-host>`);

/** The markup between a host's opening tag and its first child element. */
const afterOpen = (out: string, tag: string): string => {
  const at = out.indexOf(`<${tag}`);
  const start = out.indexOf('>', at) + 1;
  return out.slice(start, start + 60);
};

describe('light-DOM components on the server (ADR 0014)', () => {
  it('render the view as plain children, with no Declarative Shadow DOM', async () => {
    const out = await render();
    expect(afterOpen(out, 'test-light-page')).toMatch(/^<h1 class="light-title">Light page/);
    expect(afterOpen(out, 'test-light-item')).toMatch(/^<button class="inc"/);
    expect(out).not.toContain('gyral:light');
  });

  it('carry no hydration comments inside their light content', async () => {
    const out = await render();
    const page = out.slice(out.indexOf('<test-light-page'), out.indexOf('</test-light-page>'));
    const withoutNestedShadow = page.replace(/<template[\s\S]*?<\/template>/g, '');
    expect(withoutNestedShadow).not.toMatch(/<!--\/?lit-/);
  });

  it('keep Declarative Shadow DOM for shadow components nested inside', async () => {
    const out = await render();
    expect(afterOpen(out, 'test-shadow-item')).toMatch(/^<template shadowroot="open"/);
    expect(afterOpen(out, 'test-shadow-host')).toMatch(/^<template shadowroot="open"/);
  });

  it('seed every component and match the golden file', async () => {
    const out = await render();
    expect(out.match(/data-gyral-seed/g)?.length).toBe(5);
    await expect(out).toMatchFileSnapshot('./fixtures/light.ssr.html');
  });
});
