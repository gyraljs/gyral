// Size fixture for the view layer's client API (ADR 0018 "Measuring"): measure-bundles.mjs
// builds this with the `gyral-compiled` condition (no runtime preparer), minified, and records
// its gzip size as the "view" budget.
import {
  compiled,
  defineHook,
  each,
  html,
  nothing,
  raw,
  render,
} from '../../packages/core/src/view/index.ts';

globalThis.gyralView = { compiled, defineHook, each, html, nothing, raw, render };
