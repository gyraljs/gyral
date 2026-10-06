import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { html, nothing } from '@gyral/core';
import type { IntentRejected } from '@gyral/core';
import { formAction, rejectWith, renderPage, seeOther } from '@gyral/ssr';
import '../src/register.js'; // registers <gy-register> so the server can render it
import { RegisterForm } from '../src/schema.js';

export interface AppOptions {
  /** URL of the client entry module (Vite dev: the source path; prod: the built asset). */
  readonly clientEntry: string;
  /**
   * Registered accounts. The dev server re-creates the app on every request (to follow source
   * edits), so it creates this once with createState() and passes it in (examples/shared/
   * dev-fetch.ts); otherwise each app starts its own.
   */
  readonly state?: RegisterState;
}

/** Pretend persistence: the registered emails. */
export interface RegisterState {
  readonly emails: Set<string>;
}

export const createState = (): RegisterState => ({ emails: new Set() });

/** The examples' shared page styles (examples/shared/base.css), served at /shared/base.css. */
const sharedCss = readFileSync(new URL('../../shared/base.css', import.meta.url), 'utf8');

const baseStyles = html`<link rel="stylesheet" href="/shared/base.css" />
  <style>
    @layer reset, base;
    @layer base {
      body > main {
        max-inline-size: 30rem;
      }
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
  // A server-only check (the browser can't know who registered), answered with rejectWith on
  // both paths.
  const { emails } = options.state ?? createState();
  app.get('/shared/base.css', (c) => c.body(sharedCss, 200, { 'content-type': 'text/css' }));
  app.get('/', (c) => view(options, { welcome: c.req.query('welcome') }));
  app.post('/', (c) =>
    formAction(RegisterForm, {
      intent: 'Register',
      valid: (data) => {
        const email = data.email.toLowerCase();
        if (emails.has(email)) {
          return rejectWith([{ path: 'email', message: 'That email is already registered.' }]);
        }
        emails.add(email);
        return seeOther(`/?welcome=${encodeURIComponent(data.name)}`);
      },
      invalid: (rejected) => view(options, { rejected }, 422),
    })(c.req.raw),
  );
  return app;
}
