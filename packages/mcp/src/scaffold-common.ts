// Helpers shared by the scaffold templates (scaffold.ts, scaffold-forms.ts).
import { has, type Installed } from './project.js';

export interface ScaffoldFile {
  readonly path: string;
  readonly code: string;
}

export interface Scaffold {
  readonly files: readonly ScaffoldFile[];
  readonly notes: readonly string[];
}

export const comment = (description: string | undefined): string =>
  description === undefined || description.trim() === ''
    ? ''
    : `${description
        .trim()
        .split('\n')
        .map((line) => `// ${line}`)
        .join('\n')}\n`;

export /** Model tests need both: `vitest` runs them, `@gyral/testing` steps the model. */
const canTest = (installed: Installed): boolean =>
  has(installed, '@gyral/testing') && has(installed, 'vitest');

export function testNote(installed: Installed): string {
  return installed.known
    ? 'No test file: the project lacks @gyral/testing or vitest. Add them (npm i -D vitest @gyral/testing) and scaffold again for a DOM-free model test.'
    : 'No test file: no package.json was found, so only @gyral/core is assumed. Pass project_dir (or installed) to get a model test when @gyral/testing and vitest are installed.';
}
