// TemplateError: what the template rules (view/09-template-rules.md) throw. Kept apart from the
// rule checks so code that only needs the class (template-element.ts) stays small.

export const RULES_DOC = 'docs/design-docs/view/09-template-rules.md';

/** Rule 11's message, here so the client's template cache needn't load the rule messages. */
export const SERVER_ONLY =
  'This template has document-level tags (<!doctype>, <html>, <head> or <body>): it is a page ' +
  'shell, and only the server renders those. Render it with @gyral/core/server, and render ' +
  'components (not the page) in the browser.';

/** A template breaks rule `rule` of view/09-template-rules.md. */
export class TemplateError extends Error {
  readonly rule: number;
  readonly loc: string | undefined;

  constructor(rule: number, message: string, loc?: string, near?: string) {
    const doc = ` (${RULES_DOC}, rule ${String(rule)})`;
    const context =
      (near === undefined ? '' : `\n  near: ${near}`) + (loc === undefined ? '' : `\n  at ${loc}`);
    super(`[gyral template rule ${String(rule)}] ${message}${doc}${context}`);
    this.name = 'TemplateError';
    this.rule = rule;
    this.loc = loc;
  }
}
