import { define, html, type Stateless } from '@gyral/core';
import './counter.js';

// A page-level component in light DOM (`shadow: false`): its headings and text are plain
// children of <app-home>, visible to every crawler and styled by the document's CSS
// (src/styles.css). Keep widgets like <app-counter> in shadow DOM.
export const HomePage = define<Stateless, never>('app-home', {
  shadow: false,
  intent: {},
  update: {},
  view: () => html`
    <header>
      <h1>Hello, Gyral</h1>
      <p>
        This page was rendered on the server and prerendered to static HTML. It works before any
        JavaScript loads; then the counter below hydrates in place.
      </p>
    </header>
    <section aria-labelledby="try-it">
      <h2 id="try-it">Try it</h2>
      <app-counter start="3"></app-counter>
    </section>
    <footer>
      <p>
        Edit <code>src/home-page.ts</code>, or read the docs at
        <a href="https://gyral.dev/docs/">gyral.dev/docs</a>.
      </p>
    </footer>
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'app-home': InstanceType<typeof HomePage>;
  }
}
