import { describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { renderToString } from '../src/index.js';
import './support/light.js';

const render = () =>
  renderToString(html`<test-light-page></test-light-page><test-shadow-host></test-shadow-host>`);

/** The markup after a host's opening tag, without comments (hidden markers). */
const afterOpen = (out: string, tag: string): string => {
  const at = out.indexOf(`<${tag}`);
  const start = out.indexOf('>', at) + 1;
  return out
    .slice(start, start + 400)
    .replace(/<!--[\s\S]*?-->/g, '')
    .slice(0, 60);
};

describe('light-DOM components on the server (ADR 0014)', () => {
  it('render the view as plain children, with no Declarative Shadow DOM', async () => {
    const out = await render();
    expect(afterOpen(out, 'test-light-page')).toMatch(/^<h1 class="light-title">Light page/);
    expect(afterOpen(out, 'test-light-item')).toMatch(/^<button class="inc"/);
    expect(out).not.toContain('gyral:light');
  });

  it('hide the hydration markers inside their light content from ancestor walks', async () => {
    const out = await render();
    const page = out.slice(out.indexOf('<test-light-page'), out.indexOf('</test-light-page>'));
    const withoutNestedShadow = page.replace(/<template[\s\S]*?<\/template>/g, '');
    // Lit's hydrate() only acts on comments starting lit-part, /lit-part or lit-node.
    expect(withoutNestedShadow).not.toMatch(/<!--\/?lit-/);
    expect(withoutNestedShadow).toMatch(/<!--gyral:lit-part [^ ]+-->/);
    expect(withoutNestedShadow).toMatch(/<!--gyral:\/lit-part-->/);
    expect(withoutNestedShadow).toMatch(/<!--gyral:lit-node \d+-->/);
  });

  it('mark light hosts so the client can scope their markers', async () => {
    const out = await render();
    expect(out).toMatch(/<test-light-page[^>]*data-gyral-light/);
    expect(out.match(/<test-light-item[^>]*data-gyral-light/g)?.length).toBe(2);
    expect(out).not.toMatch(/<test-shadow-item[^>]*data-gyral-light/);
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
