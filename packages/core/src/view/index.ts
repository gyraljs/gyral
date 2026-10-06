// The view layer's entry point for the rest of core (ADR 0018 "Where it lives"): code outside
// view/ imports only this module. @gyral/core's index re-exports the public part of it.
export { DEV } from '#view-dev';
export { html, compiled, isTemplateResult, templateOf, type TemplateResult } from './template.js';
export { templateElement } from './template-element.js';
export { normalize, analyze, type Analysis } from './normalize/normalize.js';
export { templateId } from './normalize/id.js';
export { TemplateError } from './normalize/errors.js';
export { shapeMismatch, repairError } from './normalize/shape.js';
export type {
  PartSpec,
  Path,
  Segment,
  Shape,
  ShapeNode,
  TemplateObject,
} from './normalize/types.js';
export { render, renderBatch } from './render/render.js';
export {
  each,
  nothing,
  raw,
  type ChildValue,
  type ListResult,
  type RawResult,
} from './render/values.js';
export { defineHook, type HookAttributes, type HookResult, type HookSpec } from './render/hooks.js';
export {
  css,
  isStyleSource,
  sheetsFor,
  styleTexts,
  type CssValue,
  type StyleSource,
  type Styles,
} from './styles.js';
export {
  ISLAND_ATTRIBUTE,
  LIGHT_ATTRIBUTE,
  SEED_ATTRIBUTE,
  registerServerComponent,
  registerServerProvider,
  serverComponent,
  serverComponents,
  serverProvider,
  type ServerComponent,
  type ServerProvider,
  type ServerRenderInput,
  type ServerRendering,
} from './registry.js';
