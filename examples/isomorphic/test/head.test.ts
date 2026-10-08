// ADR 0019 round trip: the head the server writes for a URL is the head a client navigation to
// that URL leaves, and the first navigation after hydration adopts the server's head unchanged.
import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import serverHtml from './fixtures/about.ssr.html?raw';

const original = { href: location.href, title: document.title };
let page: MountedSsr | undefined;

/** The managed head as comparable text: tag, sorted attributes and text, in document order. */
const managedHead = () =>
  [...document.head.querySelectorAll('[data-gyral-head]')].map((el) => {
    const attrs = [...el.attributes].map((a) => `${a.name}=${a.value}`).sort();
    return `${el.localName} ${attrs.join(' ')} ${el.textContent}`;
  });

const serverTitle = /<title>([^<]*)<\/title>/.exec(serverHtml)?.[1];
let serverHead: string[] = [];
const records: MutationRecord[] = [];
const observer = new MutationObserver((list) => records.push(...list));

beforeAll(() => {
  history.replaceState(null, '', '/about');
  page = mountSsr(serverHtml);
  serverHead = managedHead();
  // The app sets the title through setHead(); start from the server's title, as a page load does.
  document.title = serverTitle ?? '';
  observer.observe(document.head, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
});

afterAll(() => {
  observer.disconnect();
  history.replaceState(null, '', original.href);
  document.title = original.title;
  page?.unmount();
});

const app = () => document.querySelector('gy-iso-app')?.shadowRoot ?? null;
const click = async (href: string) => {
  const link = app()?.querySelector(`a[href="${href}"]`);
  if (!(link instanceof HTMLAnchorElement)) throw new Error(`no link to ${href}`);
  link.click();
  await new Promise((r) => setTimeout(r, 20));
  await settled();
};

it('the server writes a managed head: description and canonical', () => {
  expect(serverHead).toEqual([
    'meta content=A Gyral app rendered on the server and hydrated in the browser. ' +
      'data-gyral-head=name:description name=description ',
    'link data-gyral-head=canonical href=https://iso.example/about rel=canonical ',
  ]);
});

it('the first Routed after hydration adopts the server head without writing', async () => {
  await import('../src/app.js');
  await import('../src/contact.js');
  if (page === undefined) throw new Error('not mounted');
  await hydrated(page);
  await new Promise((r) => setTimeout(r, 20));
  await settled();
  records.push(...observer.takeRecords());
  expect(records).toEqual([]);
  expect(managedHead()).toEqual(serverHead);
  expect(document.title).toBe(serverTitle);
});

it('a client navigation away and back leaves the server head for that URL', async () => {
  await click('/');
  expect(document.title).toBe('The homepage — Gyral isomorphic');
  expect(managedHead()).toContain(
    'link data-gyral-head=canonical href=https://iso.example/ rel=canonical ',
  );
  await click('/about');
  expect(managedHead()).toEqual(serverHead);
  expect(document.title).toBe(serverTitle);
});
