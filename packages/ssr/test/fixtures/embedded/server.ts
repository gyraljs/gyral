// The embedded-protocol fixture's server entry (ADR 0034): what an app gives gyral-rs, bundled
// into one IIFE by embedded-protocol.node.test.ts. It declares the protocol and installs
// gyralRender({ page, props }), which resolves to the page's HTML string. Unlike gyral-rs's
// example it installs no TextEncoder shim, so Gyral's server path is checked against the bare
// host profile: ECMAScript built-ins, Intl, queueMicrotask and console.
import { html, raw } from '@gyral/core';
import { renderToString, SSR_PROTOCOL } from '../../../src/index.js';
import { documentCss, VisitStore } from './components.js';

interface Request {
  readonly page: string;
  readonly props: { readonly name?: string; readonly visits?: number; readonly zone?: string };
}

async function gyralRender({ page, props }: Request): Promise<string> {
  if (page === 'broken') {
    return renderToString(html`<embedded-broken-card></embedded-broken-card>`, {
      onError: 'throw',
    });
  }
  if (page !== 'home') throw new Error('Unknown page');
  const visit = VisitStore.instance({ name: props.name ?? 'friend', count: props.visits ?? 7 });
  return renderToString(
    html`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>Gyral rendered by an embedded host</title>
          ${raw(`<style>${documentCss}</style>`)}
          <script type="module" src="/assets/client.js"></script>
        </head>
        <body>
          <main>
            <embedded-greeting .name=${props.name}></embedded-greeting>
            <embedded-counter></embedded-counter>
            <embedded-store-card></embedded-store-card>
            <embedded-store-card></embedded-store-card>
            <embedded-name-form .name=${props.name}></embedded-name-form>
            <embedded-time-card .zone=${props.zone ?? 'America/New_York'}></embedded-time-card>
          </main>
        </body>
      </html>`,
    { stores: [visit], onError: 'throw' },
  );
}

Object.assign(globalThis, { gyralBundleVersion: SSR_PROTOCOL, gyralRender });
