// gathered-wishes' shape (gyral-qqa): components whose views put a <noscript> notice next to
// the interactive content it stands in for, one shadow host and one light host.
import { define, html } from '../../src/index.js';

interface State {
  readonly recording: boolean;
}
type Msg = { readonly _tag: 'Toggle' };

const spec = {
  init: (): State => ({ recording: false }),
  intent: { Toggle: true as const },
  update: { Toggle: (s: State): State => ({ recording: !s.recording }) },
  view: (s: State, i: { readonly Toggle: 'Toggle' }) =>
    html`<noscript
        ><p>Recording needs JavaScript. <a href="/upload">Upload a file</a> instead.</p></noscript
      >
      <button type="button" data-intent=${i.Toggle} aria-pressed=${s.recording ? 'true' : 'false'}>
        ${s.recording ? 'Stop' : 'Record'}
      </button>`,
};

export const Recorder = define<State, Msg>()('test-noscript-recorder', spec);
export const Preferences = define<State, Msg>()('test-noscript-prefs', { ...spec, shadow: false });

export const page = () =>
  html`<main>
    <test-noscript-recorder></test-noscript-recorder>
    <test-noscript-prefs></test-noscript-prefs>
  </main>`;
