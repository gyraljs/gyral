import { describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { renderToString } from '../src/index.js';
import './support/light.js';

const render = () =>
  renderToString(html`<test-light-page></test-light-page><test-shadow-host></test-shadow-host>`, {
    dev: false,
  });

/** The markup right after a host's start tag. */
const afterOpen = (out: string, tag: string): string => {
  const at = out.indexOf(`<${tag}`);
  const start = out.indexOf('>', at) + 1;
  return out.slice(start, start + 60);
};

describe('light-DOM components on the server (ADR 0014, view/06-server.md)', () => {
  it('render the view as plain children, with no Declarative Shadow DOM', async () => {
    const out = await render();
    expect(afterOpen(out, 'test-light-page')).toMatch(/^<h1 class="light-title">Light page/);
    expect(afterOpen(out, 'test-light-item')).toMatch(/^<button class="inc"/);
  });

  it('write no hydration markers: production markup is the template HTML plus values', async () => {
    const out = await render();
    expect(out).not.toMatch(/<!--(?!-->)/); // no comment but empty anchors
  });

  it('mark light hosts, so hydration knows their own content', async () => {
    const out = await render();
    expect(out).toMatch(/<test-light-page data-gyral-light data-gyral-seed=/);
    expect(out.match(/<test-light-item[^>]*data-gyral-light/g)?.length).toBe(2);
    expect(out).not.toMatch(/<test-shadow-item[^>]*data-gyral-light/);
  });

  it('keep Declarative Shadow DOM for shadow components nested inside', async () => {
    const out = await render();
    expect(afterOpen(out, 'test-shadow-item')).toMatch(/^<template shadowrootmode="open">/);
    expect(afterOpen(out, 'test-shadow-host')).toMatch(/^<template shadowrootmode="open">/);
  });

  it('seed every component and match the golden file', async () => {
    const out = await renderToString(
      html`<test-light-page></test-light-page><test-shadow-host></test-shadow-host>`,
    );
    expect(out.match(/data-gyral-seed/g)?.length).toBe(5);
    // Golden file for light-hydration.test.ts, with development markers (update with `pnpm test -u`).
    await expect(out).toMatchFileSnapshot('./fixtures/light.ssr.html');
  });
});
