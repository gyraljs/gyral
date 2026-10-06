// A spec as the server renderer sees it (view/05-element.md "Registration", view/06-server.md
// "Components"). Outside the browser `define()` records the spec (server-specs.ts) and the
// server entry registers one of these per spec in view/'s server registry. Rendering is `view(init(props))`: props parsed from the
// start tag's attributes (always validated) and property holes (validated in development),
// `init`'s commands dropped (the client's `init` starts them after hydration, ADR 0012), then
// `initialMessages` through their reducers. Consumed by `@gyral/core/server` (Phase 4).
import { splitNext, type Next } from './command.js';
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
import { serverScopeFor } from './store-scope.js';
import type { AnyStore, StoreRef } from './store.js';
import type { ComponentSpec, Ctx, IntentNames, Tagged } from './types.js';
import {
  DEV,
  registerServerComponent,
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
  const read = <T>(store: StoreRef<T>): T => {
    if (!declared.has(store.name)) {
      throw new Error(`<${tag}> uses store "${store.name}" without declaring it in spec.stores.`);
    }
    const instance = serverScopeFor(tag, store as unknown as AnyStore).get(store as never);
    return instance.state as T; // Sound: the ref carries this store's state type.
  };
  return {
    tag,
    light: isLight(spec),
    styles: isLight(spec) ? [] : styleTexts(spec.styles),
    hydrate: spec.hydrate ?? 'load',
    render(input): ServerRendering {
      const { values, carried } = propsFrom(tag, table, input);
      const missing = missingRequired(values, table);
      if (missing.length > 0) {
        console.warn(`<${tag}> is missing required prop(s): ${missing.join(', ')}.`);
      }
      const props = readProps(values, table) as P; // Sound: exactly the declared props.
      const ctx = { props, read } as Ctx<object>;
      const [initial] = splitNext(runInit(spec, props));
      let state = initial;
      for (const msg of (input.initialMessages ?? []) as Tagged[]) {
        const reducer = reducers[msg._tag];
        if (reducer !== undefined) [state] = splitNext(reducer(state, msg, ctx));
      }
      return {
        view: spec.view(state, intentNames as IntentNames<M>, ctx as Ctx<P>),
        seed: makeSeed(tag, state, initial, carried),
      };
    },
  };
}

/**
 * Registers every spec define() recorded outside the browser in view/'s server registry. The
 * server entry calls it before rendering (Phase 4); client code never imports this module.
 */
export function registerRecordedSpecs(): void {
  for (const [tag, spec] of recordedSpecs()) {
    // Sound: define() recorded exactly this tag's ComponentSpec.
    registerServerComponent(serverComponent(tag, spec as ComponentSpec<unknown, Tagged, object>));
  }
}
