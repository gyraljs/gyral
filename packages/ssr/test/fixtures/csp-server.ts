import './csp-card.js';
import { html } from '@gyral/core';
import { renderPage, styleHashes } from '../../src/index.js';
export const styleMetadata = async () => ({ schema: 1, hashes: [...(await styleHashes())].sort() });
export function response(script: string, hashes: readonly string[]): Response {
  return renderPage({
    title: 'CSP fixture',
    dev: false,
    body: html`<csp-fixture-card></csp-fixture-card><csp-fixture-card dark></csp-fixture-card>`,
    scripts: [script],
    csp: {
      componentStyleHashes: hashes,
      directives: {
        'default-src': "'self'",
        'script-src': "'self'",
        'base-uri': "'none'",
        'object-src': "'none'",
      },
      styleAttributes: 'hash',
    },
  });
}
