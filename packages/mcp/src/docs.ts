// The docs corpus: https://gyral.dev/llms-full.txt split into pages and sections, a small
// ranked search over the sections, and lookup of one page or section.
import type { DocPage, DocSection } from './types.js';

const FENCE = /^(```|~~~)/;
const HEADING = /^(#{2,4}) (.+)$/;

/** The anchor the site gives a heading: lowercase, letters/digits/spaces/dashes, dashed. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

const unquote = (text: string): string => text.replace(/`/g, '');

/**
 * The id gyral.dev gives a heading: API symbols are `<package>-<name>` (`core-define`,
 * `ssr-static-prerender`), example titles end in `-title`, everything else is slugified.
 */
export function anchorFor(pageUrl: string, level: number, heading: string, h2: string): string {
  if (pageUrl.includes('/docs/api/') && level === 4 && h2.startsWith('`@gyral/')) {
    const pkg = unquote(h2)
      .replace(/^@gyral\//, '')
      .replace(/[^\w]+/g, '-');
    return `${pkg}-${unquote(heading)}`.toLowerCase();
  }
  if (pageUrl.endsWith('/examples/') && level === 3) return `${slugify(heading)}-title`;
  return slugify(heading);
}

/** Splits text into chunks at `---` lines outside code fences. */
function chunks(lines: readonly string[]): string[][] {
  const out: string[][] = [[]];
  let fenced = false;
  for (const line of lines) {
    if (FENCE.test(line)) fenced = !fenced;
    if (!fenced && line === '---') out.push([]);
    else out[out.length - 1]?.push(line);
  }
  return out;
}

function parsePage(lines: readonly string[]): DocPage | undefined {
  const title = lines
    .find((l) => l.startsWith('# '))
    ?.slice(2)
    .trim();
  const url = lines
    .find((l) => l.startsWith('Source: '))
    ?.slice(8)
    .trim();
  if (title === undefined || url === undefined) return undefined;
  const description =
    lines
      .find((l) => l.startsWith('> '))
      ?.slice(2)
      .trim() ?? '';
  const start = lines.findIndex((l) => l.startsWith('Source: ')) + 1;

  const sections: DocSection[] = [];
  const trail: string[] = [];
  let current = { level: 1, heading: '', trail: '', url, body: [] as string[] };
  const flush = (): void => {
    const body = current.body.join('\n').trim();
    if (body !== '' || current.level > 1) sections.push({ ...current, body });
  };
  let fenced = false;
  for (const line of lines.slice(start)) {
    if (FENCE.test(line)) fenced = !fenced;
    const match = fenced ? null : HEADING.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) {
      current.body.push(line);
      continue;
    }
    flush();
    const level = match[1].length;
    const heading = match[2].trim();
    trail.length = Math.max(0, level - 2);
    current = {
      level,
      heading,
      trail: [...trail, heading].join(' › '),
      url: `${url}#${anchorFor(url, level, heading, trail[0] ?? heading)}`,
      body: [],
    };
    trail.push(heading);
  }
  flush();
  return { title, description, url, sections };
}

/** Parses llms-full.txt: one page per `---`-separated chunk that names its `Source:`. */
export function parseLlmsFull(text: string): DocPage[] {
  return chunks(text.split('\n'))
    .map(parsePage)
    .filter((p): p is DocPage => p !== undefined);
}

const STOP = new Set(['the', 'and', 'for', 'with', 'how', 'what', 'does', 'are', 'can', 'use']);

/** A crude stem so a substring match finds other forms: hydrate → hydrat (hydration, hydrated). */
const stem = (word: string): string =>
  word.length > 4 && /^[a-z]+$/.test(word) ? word.replace(/(ions|ion|ing|ed|es|s|e)$/, '') : word;

function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9@/_.-]+/g) ?? [])
    .map((t) => t.replace(/^[._-]+|[._-]+$/g, ''))
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

export interface SearchHit {
  readonly page: string;
  readonly section: string;
  readonly url: string;
  readonly snippet: string;
  readonly score: number;
}

function count(haystack: string, needle: string): number {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) n++;
  return n;
}

function snippet(body: string, words: readonly string[]): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase();
  const at = Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0), flat.length);
  const start = at === flat.length ? 0 : Math.max(0, at - 80);
  const text = flat.slice(start, start + 240);
  return `${start > 0 ? '…' : ''}${text}${start + 240 < flat.length ? '…' : ''}`;
}

const K1 = 1.2;
const B = 0.75;
/** Guides explain concepts; API entries are one symbol each. Prefer guides on a tie. */
const API_WEIGHT = 0.7;

/**
 * BM25 over sections (substring matches, so "hydrat" finds "hydration"), plus a bonus when a
 * term is in the page title or heading trail, and a larger one when the section's own heading
 * contains the whole query. Sections matching only some terms are scaled down.
 */
export function searchDocs(pages: readonly DocPage[], query: string, limit = 8): SearchHit[] {
  const words = [...new Set(terms(query))];
  if (words.length === 0) return [];
  const all = pages.flatMap((page) =>
    page.sections.map((section) => ({ page, section, body: section.body.toLowerCase() })),
  );
  const average = all.reduce((sum, s) => sum + s.body.length, 0) / Math.max(1, all.length);
  const idf = new Map(
    words.map((w) => {
      const n = all.filter((s) => s.body.includes(w)).length;
      return [w, Math.log(1 + (all.length - n + 0.5) / (n + 0.5))];
    }),
  );
  const phrase = query.toLowerCase().trim();
  return all
    .map(({ page, section, body }) => {
      const heading = `${page.title} ${section.trail}`.toLowerCase();
      const norm = K1 * (1 - B + (B * body.length) / average);
      let score = 0;
      let matched = 0;
      for (const w of words) {
        const tf = count(body, w);
        const inHeading = heading.includes(w);
        if (tf > 0 || inHeading) matched++;
        const weight = idf.get(w) ?? 0;
        score += weight * ((tf * (K1 + 1)) / (tf + norm)) + (inHeading ? 1.5 * weight : 0);
      }
      if (phrase.includes(' ') && body.includes(phrase)) score *= 1.5;
      // A section named after the query is about it (`Lazy hydration` for "lazy hydration").
      if (section.heading.toLowerCase().includes(phrase)) score *= 2;
      score *= (matched / words.length) ** 2;
      if (page.url.includes('/docs/api/')) score *= API_WEIGHT;
      return {
        page: page.title,
        section: section.trail,
        url: section.url,
        snippet: snippet(section.body, words),
        score: Math.round(score * 100) / 100,
      };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function normalise(ref: string): { path: string; anchor: string } {
  const [rawPath = '', anchor = ''] = ref.trim().split('#');
  const path = rawPath
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/index\.md$/, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^docs\//, '');
  return { path, anchor };
}

/** Finds a page by URL, path (`/docs/intent/`, `intent`, `api/core`) or title. */
export function findPage(pages: readonly DocPage[], ref: string): DocPage | undefined {
  const { path } = normalise(ref);
  const key = (url: string): string => normalise(url).path;
  return (
    pages.find((p) => key(p.url) === path) ??
    pages.find((p) => p.title.toLowerCase() === ref.trim().toLowerCase()) ??
    (path === '' ? undefined : pages.find((p) => key(p.url).endsWith(`/${path}`)))
  );
}

const heading = (s: DocSection): string =>
  s.level > 1 ? `${'#'.repeat(s.level)} ${s.heading}\n\n` : '';

/** One page (or one section, when the ref has `#anchor`) as markdown, capped at `max` chars. */
export function getDoc(pages: readonly DocPage[], ref: string, max = 24_000): string | undefined {
  const page = findPage(pages, ref);
  if (page === undefined) return undefined;
  const { anchor } = normalise(ref);
  if (anchor !== '') {
    const index = page.sections.findIndex((s) => s.url.endsWith(`#${anchor}`));
    const section = page.sections[index];
    if (section === undefined) return undefined;
    // A section includes its subsections.
    const rest = page.sections.slice(index + 1);
    const end = rest.findIndex((s) => s.level <= section.level);
    const parts = [section, ...(end === -1 ? rest : rest.slice(0, end))];
    return `# ${page.title} › ${section.trail}\n\nSource: ${section.url}\n\n${parts
      .map((s) => `${heading(s)}${s.body}`)
      .join('\n\n')}`.slice(0, max);
  }
  const full = `# ${page.title}\n\n> ${page.description}\n\nSource: ${page.url}\n\n${page.sections
    .map((s) => `${heading(s)}${s.body}`)
    .join('\n\n')}`;
  if (full.length <= max) return full;
  // Long pages are the API reference: list entry points and groups, not every symbol.
  const outline = page.sections
    .filter((s) => s.level === 2 || s.level === 3)
    .map((s) => `${'  '.repeat(s.level - 2)}- ${s.heading}: ${s.url}`)
    .join('\n');
  return `${full.slice(0, max)}\n\n[Truncated at ${String(max)} characters. Ask for one section with its #anchor:]\n${outline}`;
}
