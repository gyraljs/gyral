import { Hono } from 'hono';
import { html, nothing } from 'lit';
import type { IntentRejected } from '@gyral/core';
import { formAction, renderPage, seeOther, serverHtml } from '@gyral/ssr';
import '../src/register.js'; // registers <gy-register> so the server can render it
import { RegisterForm } from '../src/schema.js';

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
    main { max-inline-size: 30rem; margin-inline: auto; padding: 2rem 1rem; }
  }
</style>`;

interface View {
  readonly welcome?: string | undefined;
  readonly rejected?: IntentRejected;
}

function view(options: AppOptions, { welcome, rejected }: View, status = 200): Response {
  return renderPage(
    {
      title: 'Create an account — Gyral register',
      description: 'A form that validates the same way with and without JavaScript.',
      head: baseStyles,
      body: html`<main>
        <h1>Create an account</h1>
        <gy-register
          welcome=${welcome ?? nothing}
          .initialMessages=${rejected === undefined ? [] : [rejected]}
        ></gy-register>
      </main>`,
      scripts: [options.clientEntry],
    },
    { status },
  );
}

/**
 * GET renders the form. POST is the no-JavaScript path: `formAction` validates with the same
 * schema as the client; valid → 303 redirect (Post/Redirect/Get), invalid → 422 with the
 * component re-rendered from the same `IntentRejected` the JS path would produce.
 */
export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  app.get('/', (c) => view(options, { welcome: c.req.query('welcome') }));
  app.post('/', (c) =>
    formAction(RegisterForm, {
      intent: 'Register',
      valid: (data) => seeOther(`/?welcome=${encodeURIComponent(data.name)}`),
      invalid: (rejected) => view(options, { rejected }, 422),
    })(c.req.raw),
  );
  return app;
}
