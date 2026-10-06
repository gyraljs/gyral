// The view layer's entry point for the rest of core (ADR 0018 "Where it lives"): code outside
// view/ imports only this module. Not exported from @gyral/core yet (Phase 3 swaps it in).
export { html, compiled, isTemplateResult, templateOf, type TemplateResult } from './template.js';
export { templateElement } from './template-element.js';
export { normalize } from './normalize/normalize.js';
export { templateId } from './normalize/id.js';
export { TemplateError } from './normalize/errors.js';
export type { PartSpec, Path, Segment, TemplateObject } from './normalize/types.js';
export { render } from './render/render.js';
export {
  each,
  nothing,
  raw,
  type ChildValue,
  type ListResult,
  type RawResult,
} from './render/values.js';
export { defineHook, type HookAttributes, type HookResult, type HookSpec } from './render/hooks.js';
