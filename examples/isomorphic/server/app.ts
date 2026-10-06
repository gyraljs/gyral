import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { html } from '@gyral/core';
import { renderPage, serverHtml } from '@gyral/ssr';
import '../src/app.js'; // registers <gy-iso-app> so the server can render it
import '../src/contact.js'; // and <gy-iso-contact>, rendered inside it on /about
import { pageTitle, site } from '../src/routes.js';

export interface AppOptions {
  /** URL of the client entry module (Vite dev: the source path; prod: the built asset). */
  readonly clientEntry: string;
}

/** The examples' shared page styles (examples/shared/base.css), served at /shared/base.css. */
const sharedCss = readFileSync(new URL('../../shared/base.css', import.meta.url), 'utf8');

const baseStyles = serverHtml`<link rel="stylesheet" href="/shared/base.css" />
  <style>
    @layer reset, base;
    @layer base {
      gy-iso-app { max-inline-size: 40rem; margin-inline: auto; padding: 2rem 1rem; }
    }
  </style>`;

/**
 * Every GET renders the app for its path. All async work (none here) would happen in this
 * handler, before rendering; components render synchronously from props (ADR 0012).
 */
export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  app.get('/shared/base.css', (c) => c.body(sharedCss, 200, { 'content-type': 'text/css' }));
  app.get('*', (c) => {
    const { pathname } = new URL(c.req.url);
    return renderPage(
      {
        title: pageTitle(pathname),
        description: 'A Gyral app rendered on the server and hydrated in the browser.',
        head: baseStyles,
        body: html`<gy-iso-app path=${pathname}></gy-iso-app>`,
        scripts: [options.clientEntry],
      },
      { status: site.match(pathname) === undefined ? 404 : 200 },
    );
  });
  return app;
}
