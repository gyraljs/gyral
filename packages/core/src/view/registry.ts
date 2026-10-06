// The server registry (view/05-element.md "Registration", view/06-server.md "Components").
// Outside the browser `define()` records each spec (server-specs.ts); the server entry turns
// them into entries here (server-component.ts `registerRecordedSpecs`), and
// `@gyral/core/server` (Phase 4, gyral-g1r.9) looks start tags up in it and renders the
// component in place. Plain data and functions, no DOM: it lives in view/ so view/server/ can
// read it.
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
  readonly initialMessages?: readonly unknown[];
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

/** Records a component. A tag registered twice keeps its first entry, as `customElements` does. */
export function registerServerComponent(component: ServerComponent): void {
  if (!components.has(component.tag)) components.set(component.tag, component);
}

/** The component registered under `tag`, if any. */
export const serverComponent = (tag: string): ServerComponent | undefined => components.get(tag);

/** Every registered component (for `styleHashes()`, 06 "CSP"). */
export const serverComponents = (): readonly ServerComponent[] => [...components.values()];
