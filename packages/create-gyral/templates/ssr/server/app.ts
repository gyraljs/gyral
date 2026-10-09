/// <reference types="node" />
// The app's request handler: every page is rendered here, in development, at build time
// (server/prerender.ts) and in production (server/prod.ts).
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { html } from '@gyral/core';
import { renderPage, type ComponentAssets, type CspOptions } from '@gyral/ssr';
import '../src/home-page.js'; // registers <app-home> so the server can render it

export interface AppOptions {
  /**
   * The components' client modules (dev: from the dev server; production: from the build). Each
   * page loads exactly the components it rendered, with their preloads; a page that renders
   * none loads no JavaScript. Leave it out (tests) to render without loading anything.
   */
  readonly components?: ComponentAssets | undefined;
}

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

/** Paths prerendered to static HTML by `npm run build`. */
export const staticPaths: readonly string[] = ['/'];

/**
 * A Content-Security-Policy whose style-src allows the page's and the components' <style>
 * elements by hash, so no 'unsafe-inline' is needed. renderPage builds it when the page
 * renders (every component imported by then); add your other directives here.
 */
const csp: CspOptions = {};

export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  app.get('/', () =>
    renderPage({
      title: 'Gyral app',
      description: 'A Gyral app rendered on the server and hydrated in the browser.',
      styles,
      body: html`<app-home></app-home>`,
      ...(options.components === undefined ? {} : { components: options.components }),
      csp,
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
        csp,
      },
      { status: 404 },
    ),
  );
  return app;
}
