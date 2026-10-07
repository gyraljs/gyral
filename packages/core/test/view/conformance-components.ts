// Components for the conformance properties (view/README.md "Conformance"): a shadow
// component with property props and a slot, and a light one that nests it. Defined for the
// client and registered for the server renderer, so both sides render them.
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { css, define, html, prop, type ComponentSpec } from '../../src/index.js';
import { serverComponent } from '../../src/server-component.js';
import { registerServerComponent } from '../../src/view/index.js';

/** Defines a component for the client and registers it for the server renderer. */
function both<S, P extends object>(tag: string, spec: ComponentSpec<S, never, P>): void {
  define<S, never, P>(tag, spec);
  registerServerComponent(serverComponent(tag, spec));
}

interface ShadowProps {
  readonly label: string;
  readonly items: readonly string[];
}
const strings: StandardSchemaV1<readonly string[]> = {
  '~standard': { version: 1, vendor: 't', validate: (v) => ({ value: v as readonly string[] }) },
};

both<object, ShadowProps>('cf-shadow', {
  props: { label: prop.string({ default: '' }), items: prop.value(strings, { default: [] }) },
  init: () => ({}),
  intent: {},
  update: {},
  view: (_s, _i, { props }) =>
    html`<p class="c">${props.label}</p>
      <ul>
        ${props.items.map((it) => html`<li>${it}</li>`)}
      </ul>
      <slot></slot>`,
  styles: css`
    p {
      color: rgb(1, 2, 3);
    }
  `,
});

both<object, { readonly n: number }>('cf-light', {
  shadow: false,
  props: { n: prop.number({ default: 0 }) },
  init: () => ({}),
  intent: {},
  update: {},
  view: (_s, _i, { props }) =>
    html`<h3>Light ${props.n}</h3>
      ${props.n > 1 ? html`<cf-shadow label="in light"></cf-shadow>` : ''}`,
});
