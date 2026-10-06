// `define(tag, spec)` (docs/design-docs/view/05-element.md): compiles a Model-View-Intent spec
// into a custom element and registers it. Outside the browser it records the spec in the
// server registry instead (view/06-server.md) and returns a placeholder class.
import type { GyralElementClass } from './element-types.js';
import { elementClass } from './element.js';
import { markGyralHost } from './intent.js';
import { isLight } from './light-dom.js';
import { features } from './features.js';
import { recordSpec } from './server-specs.js';
import type { ComponentSpec, Tagged } from './types.js';
import { DEV } from './view/index.js';

export type { GyralElement, GyralElementClass } from './element-types.js';

interface SpecShape {
  readonly props?: object;
  readonly shadow?: boolean;
  readonly styles?: unknown;
}

function checkSpec(tag: string, spec: SpecShape): void {
  const names = Object.keys(spec.props ?? {});
  // The prop builders registered the prop feature (features.ts) if there are props.
  if (names.length > 0) features.props?.checkShadowed(tag, names);
  if (isLight(spec) && spec.styles !== undefined) {
    console.warn(`<${tag}> has shadow: false, so its styles are ignored; use document CSS.`);
  }
}

/**
 * Compiles a Model-View-Intent spec into a custom element and registers it under `tag`.
 * See docs/design-docs/0001-mvi-parsed-intent.md, 0006-effects-and-drivers.md, 0007-props.md,
 * 0008-forms.md and view/05-element.md.
 */
export function define<S, M extends Tagged, P extends object = object, O extends Tagged = never>(
  tag: string,
  spec: ComponentSpec<S, M, P>,
): GyralElementClass<S, M, P, O> {
  checkSpec(tag, spec);
  if (typeof HTMLElement === 'undefined') {
    // No DOM (Node, Workers): the server renderer renders the spec itself (Phase 4). Only the
    // spec is recorded here, so the server registry code never reaches client bundles.
    recordSpec(tag, spec);
    const Placeholder = Object.assign(
      function Placeholder(): never {
        throw new Error(`<${tag}> is a browser element; render it with @gyral/core/server.`);
      },
      { spec, tagName: tag },
    );
    // Sound enough: outside the browser the class only carries `spec` and `tagName`.
    return Placeholder as unknown as GyralElementClass<S, M, P, O>;
  }
  const existing = customElements.get(tag);
  if (existing !== undefined) {
    if (DEV && (existing as { readonly spec?: unknown }).spec !== spec) {
      console.warn(`<${tag}> is already defined with a different spec; keeping the first.`);
    }
    return existing as unknown as GyralElementClass<S, M, P, O>;
  }
  const Element = elementClass(tag, spec);
  markGyralHost(Element);
  customElements.define(tag, Element);
  // Sound: every declared prop is an accessor on the prototype.
  return Element as unknown as GyralElementClass<S, M, P, O>;
}
