import { command, defineDriver, type Command } from '@gyral/core';
import { get, type HttpError } from '@gyral/http';
import * as v from 'valibot';

const Repo = v.object({
  id: v.number(),
  full_name: v.string(),
  html_url: v.string(),
  description: v.nullable(v.string()),
  stargazers_count: v.number(),
});

/** Valibot implements Standard Schema, so @gyral/http can decode with it directly. */
const SearchResponse = v.object({ items: v.array(Repo) });

export type Repo = v.InferOutput<typeof Repo>;

/**
 * Debounce = a timer under `switch` concurrency: every new keystroke interrupts the pending
 * timer (ADR 0006). Replaces Cycle's `Time.debounce(500)`.
 */
export const debounce = defineDriver<{ readonly ms: number }, undefined>({
  name: 'debounce',
  concurrency: 'switch',
  run: ({ ms }, { signal }) =>
    new Promise<undefined>((resolve) => {
      const timer = setTimeout(() => {
        resolve(undefined);
      }, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
      });
    }),
});

export const searchUrl = (query: string): string =>
  `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=10`;

/** Searches under `switch`: a newer query cancels the in-flight request. */
export function searchRepos<M>(
  query: string,
  onSuccess: (repos: readonly Repo[]) => M,
  onFailure: (error: HttpError) => M,
): Command<M> {
  return get(searchUrl(query), {
    schema: SearchResponse,
    key: 'github',
    concurrency: 'switch',
    onSuccess: (body) => onSuccess(body.items),
    onFailure,
  });
}

export function afterPause<M>(ms: number, msg: M): Command<M> {
  return command(debounce, { ms }, { onSuccess: () => msg });
}
