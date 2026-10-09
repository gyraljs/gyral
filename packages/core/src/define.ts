// `define<S, M>()(tag, spec)` (docs/design-docs/view/05-element.md, ADR 0023): compiles a
// Model-View-Intent spec into a custom element and registers it. Outside the browser it
// records the spec in the server registry instead (view/06-server.md) and returns a
// placeholder class.
import type { GyralElementClass } from './element-types.js';
import { elementClass } from './element.js';
import { markGyralHost } from './intent.js';
import { isLight } from './light-dom.js';
import { features } from './features.js';
import { recordSpec } from './server-specs.js';
import type { ComponentSpec, ShadowOption, Tagged } from './types.js';
import { DEV, message } from './view/index.js';

export type { GyralElement, GyralElementClass } from './element-types.js';

interface SpecShape {
  readonly props?: object;
  readonly shadow?: ShadowOption;
  readonly styles?: unknown;
}

function checkSpec(tag: string, spec: SpecShape): void {
  const names = Object.keys(spec.props ?? {});
  // The prop builders registered the prop feature (features.ts) if there are props.
  if (names.length > 0) features.props?.checkShadowed(tag, names);
  if (DEV && isLight(spec) && spec.styles !== undefined) {
    console.warn(`<${tag}> has shadow: false, so its styles are ignored; use document CSS.`);
  }
}

/** The second call of `define()`: takes the tag and the spec, infers the intent names. */
export type Definer<S, M extends Tagged, P extends object, O extends Tagged> = <
  N extends string = never,
>(
  tag: string,
  spec: ComponentSpec<S, M, P, N>,
) => GyralElementClass<S, M, P, O, N>;

/**
 * Compiles a Model-View-Intent spec into a custom element and registers it under `tag`. Two
 * calls (ADR 0023): the first takes the types, the second the tag and spec, from whose
 * `intent` keys it infers the component's intent names.
 *
 *   define<State, Msg>()('x-counter', { init, intent: { Increment: … }, update, view })
 *
 * With no type arguments, `define()('x-badge', spec)` infers the state, messages, props and
 * intent names from the spec. See docs/design-docs/0001-mvi-parsed-intent.md,
 * 0006-effects-and-drivers.md, 0007-props.md, 0008-forms.md and view/05-element.md.
 */
export function define(): <
  S,
  M extends Tagged = never,
  P extends object = object,
  N extends string = never,
>(
  tag: string,
  spec: ComponentSpec<S, M, P, N>,
) => GyralElementClass<S, M, P, never, N>;
export function define<
  S,
  M extends Tagged,
  P extends object = object,
  O extends Tagged = never,
>(): Definer<S, M, P, O>;
// One function serves both call forms; the overloads type the result.
export function define(): (tag: string, spec: never) => unknown {
  return defineElement;
}

function defineElement(tag: string, spec: ComponentSpec<unknown, Tagged, object>): unknown {
  checkSpec(tag, spec);
  if (typeof HTMLElement === 'undefined') {
    // No DOM (Node, Workers): the server renderer renders the spec itself (Phase 4). Only the
    // spec is recorded here, so the server registry code never reaches client bundles.
    recordSpec(tag, spec);
    return Object.assign(
      function Placeholder(): never {
        throw new Error(message(1, tag));
      },
      { spec, tagName: tag },
    );
  }
  const existing = customElements.get(tag);
  if (existing !== undefined) {
    if (DEV && (existing as { readonly spec?: unknown }).spec !== spec) {
      console.warn(`<${tag}> is already defined with a different spec; keeping the first.`);
    }
    return existing;
  }
  const Element = elementClass(tag, spec);
  markGyralHost(Element);
  customElements.define(tag, Element);
  return Element;
}
