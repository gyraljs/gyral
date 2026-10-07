import type { Command } from '@gyral/core';
import { get, type HttpError } from '@gyral/http';
import * as v from 'valibot';

/** OpenSearch answers `[query, titles, descriptions, urls]`; only the titles are used. */
const OpenSearch = v.looseTuple([v.string(), v.array(v.string())]);

/** Wikipedia's OpenSearch endpoint. `origin=*` enables anonymous CORS, so no JSONP is needed. */
export const suggestUrl = (query: string): string =>
  'https://en.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=10&search=' +
  encodeURIComponent(query);

/** Fetches article titles under `switch`: a newer query cancels the in-flight request. */
export function suggest<M>(
  query: string,
  onSuccess: (titles: readonly string[]) => M,
  onFailure: (error: HttpError) => M,
): Command<M> {
  return get(suggestUrl(query), {
    schema: OpenSearch,
    key: 'wikipedia',
    concurrency: 'switch',
    onSuccess: (body) => onSuccess(body[1]),
    onFailure,
  });
}
