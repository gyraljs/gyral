import type { Command } from '@gyral/core';
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
