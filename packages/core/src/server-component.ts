// A spec as the server renderer sees it (view/05-element.md "Registration", view/06-server.md
// "Components"). Outside the browser `define()` records the spec (server-specs.ts) and
// `@gyral/core/server` registers one of these per spec in view/'s server registry. Rendering is
// `view(init(props))`: props parsed from the start tag's attributes (always validated) and
// property holes (validated in development), `init`'s commands dropped (the client's `init`
// starts them after hydration, ADR 0012), then `initialMessages` through their reducers.
// `ctx.read` uses the nearest `<gyral-stores>` provider's registry, else the request's.
import { splitNext, type Next } from './command.js';
import { GyralError, type ErrorPhase } from './errors.js';
import { makeSeed } from './hydration.js';
import { runInit } from './init.js';
import { intentNames } from './intent.js';
import { isLight } from './light-dom.js';
import {
  attributeOf,
  checkValue,
  missingRequired,
  parseAttribute,
  readProps,
  reportInvalid,
  type PropTable,
} from './props.js';
import { recordedSpecs } from './server-specs.js';
import { serverScopeFor, StoreRegistry } from './store-scope.js';
import type { AnyStore, StoreRef } from './store.js';
import type { ComponentSpec, Ctx, IntentNames, Tagged } from './types.js';
import {
  DEV,
  message,
  nothing,
  registerServerComponent,
  serverComponent as registered,
  styleTexts,
  type ServerComponent,
  type ServerRenderInput,
  type ServerRendering,
} from './view/index.js';

type Reducers<S> = Readonly<
  Record<string, ((s: S, m: Tagged, ctx: Ctx<object>) => Next<S, Tagged>) | undefined>
>;

/** Resolves props from a start tag: attributes always validated, properties in development. */
function propsFrom(tag: string, table: PropTable, input: ServerRenderInput) {
  const values: Record<string, unknown> = {};
  const carried: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(table)) {
    if (name in input.properties) {
      const value = input.properties[name];
      if (value === undefined) continue;
      const checked = DEV ? checkValue(tag, name, def, value) : { ok: true as const, value };
      if (checked.ok) values[name] = value;
      else reportInvalid(tag, name, 'a property', checked.issues);
      carried[name] = value; // no attribute carries it: the seed does
      continue;
    }
    const attr = attributeOf(name, def);
    if (attr === undefined) continue;
    const raw = input.attributes[attr];
    const parsed = parseAttribute(def, raw ?? null);
    if (parsed === undefined) continue;
    const checked = parsed.ok ? checkValue(tag, name, def, parsed.value) : parsed;
    if (checked.ok) values[name] = checked.value;
    else reportInvalid(tag, name, `the attribute ${attr}`, checked.issues);
  }
  return { values, carried };
}

/** The server registry entry for `spec`. */
export function serverComponent<S, M extends Tagged, P>(
  tag: string,
  spec: ComponentSpec<S, M, P>,
): ServerComponent {
  const table = (spec.props ?? {}) as PropTable;
  const reducers = spec.update as unknown as Reducers<S>;
  const declared = new Set((spec.stores ?? []).map((store: AnyStore) => store.name));
  const reader =
    (scope: unknown) =>
    <T>(store: StoreRef<T>): T => {
      if (!declared.has(store.name)) {
        throw new Error(`<${tag}> uses store "${store.name}" without declaring it in spec.stores.`);
      }
      const any = store as unknown as AnyStore;
      const registry = scope instanceof StoreRegistry ? scope : serverScopeFor(tag, any);
      return registry.get(any).state as T; // Sound: the ref carries this store's state type.
    };
  /**
   * The rendering of a component that threw (ADR 0024): its error view (or nothing, also when
   * the error view throws), no seed, and the GyralError the renderer reports.
   */
  const failed = (phase: ErrorPhase, cause: unknown, state: S | undefined): ServerRendering => {
    const error = new GyralError(phase, message(78, tag), cause, tag);
    let view: ServerRendering['view'] = nothing;
    try {
      if (spec.error !== undefined) view = spec.error(error, state);
    } catch {
      view = nothing; // the error view failed too: the host stays empty
    }
    return { view, seed: { props: {} }, failed: error };
  };
  return {
    tag,
    light: isLight(spec),
    delegatesFocus: typeof spec.shadow === 'object' && spec.shadow.delegatesFocus === true,
    styles: isLight(spec) ? [] : styleTexts(spec.styles),
    hydrate: spec.hydrate ?? 'load',
    render(input): ServerRendering {
      const { values, carried } = propsFrom(tag, table, input);
      const missing = missingRequired(values, table);
      if (missing.length > 0) {
        console.warn(`<${tag}> is missing required prop(s): ${missing.join(', ')}.`);
      }
      const props = readProps(values, table) as P; // Sound: exactly the declared props.
      const ctx = { props, read: reader(input.scope) } as Ctx<object>;
      let initial: S;
      let state: S;
      try {
        [initial] = splitNext(runInit(spec, props));
        state = initial;
        for (const msg of (input.initialMessages ?? []) as Tagged[]) {
          const reducer = reducers[msg._tag];
          if (reducer !== undefined) [state] = splitNext(reducer(state, msg, ctx));
        }
      } catch (cause) {
        return failed('init', cause, undefined);
      }
      try {
        return {
          view: spec.view(state, intentNames as IntentNames<string>, ctx as Ctx<P>),
          seed: makeSeed(tag, state, initial, carried),
        };
      } catch (cause) {
        return failed('view', cause, state);
      }
    },
    fallback: (cause) => failed('view', cause, undefined),
  };
}

/**
 * Registers every spec define() recorded outside the browser (and not registered yet) in
 * view/'s server registry. `@gyral/core/server` calls it before each render; client code never
 * imports this module.
 */
export function registerRecordedSpecs(): void {
  for (const [tag, spec] of recordedSpecs()) {
    if (registered(tag) !== undefined) continue;
    // Sound: define() recorded exactly this tag's ComponentSpec.
    registerServerComponent(serverComponent(tag, spec as ComponentSpec<unknown, Tagged, object>));
  }
}
