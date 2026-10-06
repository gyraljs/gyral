// The view layer's entry point for the rest of core (ADR 0018 "Where it lives"): code outside
// view/ imports only this module. Not exported from @gyral/core yet (Phase 3 swaps it in).
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
