// The server registry (view/05-element.md "Registration", view/06-server.md "Components").
// Outside the browser `define()` records each spec (server-specs.ts); `@gyral/core/server`
// turns them into entries here (server-component.ts `registerRecordedSpecs`) before each
// render, and its renderer (view/server/) looks start tags up and renders the component in
// place. Providers (`<gyral-stores>`, ADR 0013) register a scope for their subtree. Plain data
// and functions, no DOM: it lives in view/ so view/server/ can read it.
import type { ChildValue } from './render/values.js';

/** What a server render of one component returns: its view and what its seed must carry. */
export interface ServerRendering {
  /** `view(state, intents, ctx)` for the resolved props and state. */
  readonly view: ChildValue;
  /**
   * The `data-gyral-seed` payload (ADR 0012): `props` that no attribute carries, and `state`
   * unless it equals `init(props)`'s state. JSON-serializable.
   */
  readonly seed: { readonly state?: unknown; readonly props: Readonly<Record<string, unknown>> };
}

/** The input of one server render, gathered from the start tag (06 "Components"). */
export interface ServerRenderInput {
  /** Static attributes plus attribute/boolean holes, as strings (`''` for a present boolean). */
  readonly attributes: Readonly<Record<string, string>>;
  /** Property holes: values as is. */
  readonly properties: Readonly<Record<string, unknown>>;
  /** Messages run through their reducers after `init` (ADR 0008's rejected-form re-render). */
  readonly initialMessages?: readonly unknown[] | undefined;
  /**
   * The nearest provider's scope (opaque to view/), or undefined for the request's own scope.
   * The renderer passes it down: a provider's subtree can span several streamed chunks, so a
   * global set around the subtree would not survive between pulls.
   */
  readonly scope?: unknown;
}

/** One registered component, as the server renderer sees it. */
export interface ServerComponent {
  readonly tag: string;
  /** `shadow: false` (ADR 0014): render as light-DOM children, not `<template shadowrootmode>`. */
  readonly light: boolean;
  /** CSS texts for the declarative shadow root's `<style>` (08). Empty for light components. */
  readonly styles: readonly string[];
  /** The island strategy (07): anything but `load` adds `defer-hydration` and `data-gyral-hydrate`. */
  readonly hydrate: 'load' | 'idle' | 'visible' | 'interaction';
  /** Parses props (validated as in the browser), runs `init` (commands dropped) and the view. */
  render(input: ServerRenderInput): ServerRendering;
}

const components = new Map<string, ServerComponent>();
let version = 0;

/** Records a component. A tag registered twice keeps its first entry, as `customElements` does. */
export function registerServerComponent(component: ServerComponent): void {
  if (components.has(component.tag)) return;
  components.set(component.tag, component);
  version++;
}

/**
 * Changes whenever the registry does (a component, and so its CSS, is added): caches derived
 * from the registry (the CSP header of `@gyral/ssr`'s `renderPage`) key on it.
 */
export const serverRegistryVersion = (): number => version;

/** The component registered under `tag`, if any. */
export const serverComponent = (tag: string): ServerComponent | undefined => components.get(tag);

/** Every registered component (for `styleHashes()`, 06 "CSP"). */
export const serverComponents = (): readonly ServerComponent[] => [...components.values()];

/**
 * A server-side provider element (`<gyral-stores>`, ADR 0013): written as a plain element, it
 * gives its subtree a scope (passed to components as `ServerRenderInput.scope`) and may add
 * attributes to its start tag (its seed).
 */
export interface ServerProvider {
  readonly tag: string;
  open(input: ServerRenderInput): {
    readonly scope: unknown;
    readonly attributes: Readonly<Record<string, string>>;
  };
}

const providers = new Map<string, ServerProvider>();

/** Records a provider element. A tag registered twice keeps its first entry. */
export function registerServerProvider(provider: ServerProvider): void {
  if (!providers.has(provider.tag)) providers.set(provider.tag, provider);
}

/** The provider registered under `tag`, if any. */
export const serverProvider = (tag: string): ServerProvider | undefined => providers.get(tag);
