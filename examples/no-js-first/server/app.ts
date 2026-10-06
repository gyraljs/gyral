import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { html, nothing } from '@gyral/core';
import type { IntentRejected } from '@gyral/core';
import { formAction, rejectWith, renderPage, seeOther, serverHtml } from '@gyral/ssr';
import '../src/rsvp.js'; // registers <gy-rsvp> so the server can render it
import { RsvpForm, type Attendee } from '../src/schema.js';

export interface AppOptions {
  /** URL of the client entry module (Vite dev: the source path; prod: the built asset). */
  readonly clientEntry: string;
  /**
   * The replies so far. The dev server re-creates the app on every request (to follow source
   * edits), so it creates this once and passes it in; otherwise each app starts its own.
   */
  readonly replies?: Reply[];
}

/** The examples' shared page styles (examples/shared/base.css), served at /shared/base.css. */
const sharedCss = readFileSync(new URL('../../shared/base.css', import.meta.url), 'utf8');

const head = serverHtml`<link rel="stylesheet" href="/shared/base.css" />
  <style>
    body > main { max-inline-size: 32rem; }
  </style>`;

export interface Reply extends Attendee {
  readonly email: string;
}

/** The two people who replied before the page opened. */
export const sampleReplies = (): Reply[] => [
  { name: 'Grace', guests: 1, email: 'grace@example.com' },
  { name: 'Alan', guests: 0, email: 'alan@example.com' },
];

interface View {
  readonly attendees: readonly Reply[];
  readonly joined?: string | undefined;
  readonly rejected?: IntentRejected;
}

function page(options: AppOptions, { attendees, joined, rejected }: View, status = 200) {
  // Emails stay on the server: the page (and its hydration seed) only gets names.
  const list: readonly Attendee[] = attendees.map(({ name, guests }) => ({ name, guests }));
  return renderPage(
    {
      title: 'RSVP: Web Platform Meetup — Gyral no-js-first',
      description: 'An RSVP form that works without JavaScript and gets better with it.',
      head,
      body: html`<main>
        <h1>Web Platform Meetup</h1>
        <p>Thursday at 18:30. Say you're coming:</p>
        <gy-rsvp
          .attendees=${list}
          joined=${joined ?? nothing}
          .initialMessages=${rejected === undefined ? [] : [rejected]}
        ></gy-rsvp>
      </main>`,
      scripts: [options.clientEntry],
    },
    { status },
  );
}

/**
 * GET renders the page. POST is the JavaScript-off path, and also what the JS path posts to:
 * `formAction` validates with the same schema as the browser; valid → 303 redirect
 * (Post/Redirect/Get, or JSON for the JS path), invalid → 422 with the page re-rendered from
 * the same `IntentRejected` the JS path would get.
 */
export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  const attendees = options.replies ?? sampleReplies();
  app.get('/shared/base.css', (c) => c.body(sharedCss, 200, { 'content-type': 'text/css' }));
  app.get('/', (c) => page(options, { attendees, joined: c.req.query('joined') }));
  app.post('/', (c) =>
    formAction(RsvpForm, {
      intent: 'Join',
      valid: (data) => {
        const email = data.email.toLowerCase();
        const already = attendees.find((a) => a.email === email);
        if (already !== undefined) {
          return rejectWith([
            { path: 'email', message: `${already.name} already replied with that email.` },
          ]);
        }
        attendees.push({ name: data.name, guests: data.guests, email });
        return seeOther(`/?joined=${encodeURIComponent(data.name)}`);
      },
      invalid: (rejected) => page(options, { attendees, rejected }, 422),
    })(c.req.raw),
  );
  return app;
}
