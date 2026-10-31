// Types for strip-dev.mjs, which vitest.config.ts (TypeScript) imports.
import type { Plugin } from 'vite';

export declare const FLAGS: ReadonlySet<string>;

export interface StripOptions {
  readonly file?: string;
  readonly specifier?: (specifier: string) => string | undefined;
  readonly sourcemap?: boolean;
  readonly map?: string;
}

export declare function stripDevelopment(
  code: string,
  options?: StripOptions,
): Promise<{ code: string; map: string | undefined }>;

export declare function importsOf(code: string, file?: string): string[];

export declare function stripDevelopmentPlugin(options: { readonly include: RegExp }): Plugin;
