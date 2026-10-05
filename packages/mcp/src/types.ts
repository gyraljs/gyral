// The data the server answers from. `scripts/build-corpus.mjs` writes it to dist/corpus.json at
// build time, so the published package works offline and answers for its own Gyral version.

/** One `##`–`####` section of a docs page, or the page's intro (level 1, empty heading). */
export interface DocSection {
  readonly level: number;
  readonly heading: string;
  /** Headings above this one, e.g. `Props › Reacting to prop changes`. */
  readonly trail: string;
  /** `https://gyral.dev/docs/intent/#trigger-events`, or the page URL for the intro. */
  readonly url: string;
  readonly body: string;
}

/** One page of https://gyral.dev/llms-full.txt. */
export interface DocPage {
  readonly title: string;
  readonly description: string;
  /** `https://gyral.dev/docs/intent/`. */
  readonly url: string;
  readonly sections: readonly DocSection[];
}

export type ApiKind = 'function' | 'class' | 'constant' | 'type';

/** One public export of a published entry point. */
export interface ApiEntry {
  readonly name: string;
  /** `@gyral/core` or `@gyral/ssr/static`. */
  readonly specifier: string;
  readonly kind: ApiKind;
  /** The declaration as written, bodies removed. */
  readonly declaration: string;
  readonly doc: string;
}

export interface ExampleFile {
  /** Relative to the example, e.g. `src/counter.ts`. */
  readonly path: string;
  readonly source: string;
}

export interface Example {
  /** Directory name under examples/, e.g. `counter`. */
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly url: string;
  /** Files that define components (`define(`), the ones worth reading first. */
  readonly components: readonly ExampleFile[];
  /** Every other source file, by path only. */
  readonly otherFiles: readonly string[];
}

export interface SkillFile {
  /** `SKILL.md` or `references/intent.md`. */
  readonly path: string;
  readonly content: string;
}

export interface Corpus {
  /** The Gyral version these docs and types describe. */
  readonly version: string;
  readonly docs: readonly DocPage[];
  readonly api: readonly ApiEntry[];
  readonly examples: readonly Example[];
  readonly skill: readonly SkillFile[];
  readonly llmsTxt: string;
}
