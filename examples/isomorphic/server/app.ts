import { Hono } from 'hono';
import { html } from 'lit';
import { renderPage, serverHtml } from '@gyral/ssr';
import '../src/app.js'; // registers <gy-iso-app> so the server can render it
import { pageTitle, site } from '../src/routes.js';

export interface AppOptions {
  /** URL of the client entry module (Vite dev: the source path; prod: the built asset). */
  readonly clientEntry: string;
}

const baseStyles = serverHtml`<style>
  @layer reset, base;
  @layer reset {
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; }
  }
  @layer base {
    :root {
      color-scheme: light dark;
      font-family: system-ui, sans-serif;
      --surface: light-dark(oklch(98% 0.01 250), oklch(20% 0.02 250));
      --ink: light-dark(oklch(25% 0.03 250), oklch(92% 0.01 250));
    }
    body { background: var(--surface); color: var(--ink); }
    gy-iso-app { max-inline-size: 40rem; margin-inline: auto; padding: 2rem 1rem; }
  }
</style>`;

/**
 * Every GET renders the app for its path. All async work (none here) would happen in this
 * handler, before rendering; components render synchronously from props (ADR 0012).
 */
export function createApp(options: AppOptions): Hono {
  const app = new Hono();
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
