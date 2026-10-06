/// <reference types="node" />
// The app's request handler: every page is rendered here, in development, at build time
// (server/prerender.ts) and in production (server/prod.ts).
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import '../src/home-page.js';

export interface AppOptions {
  /** URL of the client entry module (dev: the source path; production: the built asset). */
  readonly clientEntry: string;
}

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

/** Paths prerendered to static HTML by `npm run build`. */
export const staticPaths: readonly string[] = ['/'];

export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  app.get('/', () =>
    renderPage({
      title: 'Gyral app',
      description: 'A Gyral app rendered on the server and hydrated in the browser.',
      styles,
      body: html`<app-home></app-home>`,
      scripts: [options.clientEntry],
    }),
  );
  app.notFound(() =>
    renderPage(
      {
        title: 'Not found',
        styles,
        body: html`<main>
          <h1>Not found</h1>
          <p><a href="/">Go home</a></p>
        </main>`,
      },
      { status: 404 },
    ),
  );
  return app;
}
