// Documentation library shared by every condition (protocol v3, H1/H2): an llms.txt-style
// index, per-page Markdown, section lookup and a ranked heading/keyword search. Every rule
// here is framework-neutral; the same code serves Gyral, React and Svelte pages.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DOC_LIMITS = Object.freeze({
  pageCharacters: 12000,
  descriptionCharacters: 140,
  searchDefault: 8,
  searchMax: 10,
  snippetCharacters: 220,
  sectionMatchThreshold: 0.5,
});

const STOPWORDS = new Set(
  'a an and are as at be by can do does for from how i in into is it of on or the to what when where which with you your'.split(
    ' ',
  ),
);

/** Lower-case words, keeping `$state`/`@const`-style names; stopwords removed. */
export function tokens(text) {
  return String(text)
    .toLowerCase()
    .replace(/\{\/\*.*?\*\/\}/g, ' ')
    .split(/[^a-z0-9$@_]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/** Heading text without Markdown decoration or React's `{/*anchor*\/}` suffix. */
export function cleanHeading(text) {
  return text
    .replace(/\{\/\*.*?\*\/\}/g, '')
    .replace(/\s+#+\s*$/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .trim();
}
const normalized = (text) => tokens(cleanHeading(text)).join(' ');

/** Page id from a documentation URL: host, `/index.md`, `.md` and `/llms.txt` removed. */
export function pageId(url) {
  const { pathname } = new URL(url);
  const id = decodeURIComponent(pathname)
    .replace(/\/index\.md$/, '')
    .replace(/\/llms\.txt$/, '')
    .replace(/\.md$/, '')
    .replace(/^\/+|\/+$/g, '');
  if (!id) throw new Error(`No page id for ${url}`);
  return id;
}
export const pageFile = (id) => `pages/${id.replaceAll('/', '__')}.md`;

/**
 * Parses an llms.txt index: its H1, its `>` summary and every `- [Title](url): description`
 * entry with the headings it sits under. Only Markdown page links are kept.
 */
export function parseIndex(text) {
  const lines = text.split('\n');
  const title =
    lines
      .find((line) => line.startsWith('# '))
      ?.slice(2)
      .trim() ?? '';
  const summary =
    lines
      .find((line) => line.startsWith('> '))
      ?.slice(2)
      .trim() ?? '';
  const groups = [];
  const entries = [];
  for (const line of lines) {
    const heading = /^(#{2,6})\s+(.+)$/.exec(line);
    if (heading) {
      groups.length = heading[1].length - 2;
      groups.push(heading[2].trim());
      continue;
    }
    const entry = /^\s*[-*]\s+\[([^\]]+)\]\(([^)\s]+)\)\s*(?::\s*(.*))?$/.exec(line);
    if (!entry) continue;
    const url = entry[2];
    if (!/^https:\/\//.test(url) || !/(\.md|\/llms\.txt)$/.test(url)) continue;
    entries.push({
      title: entry[1].trim(),
      url,
      description: entry[3]?.trim() ?? '',
      group: groups.filter(Boolean).join(' › '),
    });
  }
  return { title, summary, entries };
}

function stripFences(text) {
  // Lines inside fenced code blocks, so headings in examples are not mistaken for sections.
  let fence;
  return text.split('\n').map((line) => {
    const marker = /^\s*(```+|~~~+)/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = undefined;
      return { line, code: true };
    }
    return { line, code: Boolean(fence) };
  });
}

/** Frontmatter `description:` if present. */
function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return { body: text, description: '', title: '' };
  const field = (name) =>
    new RegExp(`^${name}:\\s*(.+)$`, 'm')
      .exec(match[1])?.[1]
      .trim()
      .replace(/^['"]|['"]$/g, '') ?? '';
  return {
    body: text.slice(match[0].length),
    description: field('description'),
    title: field('title'),
  };
}

const shorten = (text, max) => {
  const clean = text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2))}…`;
};

/**
 * One-line description, the same rule for every framework: the index's description, else the
 * page's frontmatter description, else its first prose paragraph.
 */
export function describe(indexDescription, text) {
  if (indexDescription) return shorten(indexDescription, DOC_LIMITS.descriptionCharacters);
  const { body, description } = frontmatter(text);
  if (description) return shorten(description, DOC_LIMITS.descriptionCharacters);
  const paragraph = [];
  for (const { line, code } of stripFences(body)) {
    const trimmed = line.trim();
    const prose =
      !code &&
      trimmed &&
      !/^(#|<|>|\||!\[|Source:|import |export |---|\* |- |\d+\. )/.test(trimmed) &&
      !/^\{.*\}$/.test(trimmed);
    if (prose) paragraph.push(trimmed);
    else if (paragraph.length) break;
  }
  return shorten(paragraph.join(' '), DOC_LIMITS.descriptionCharacters);
}

/** Headings of a page (outside code) with each section's extent and own-text extent. */
export function sections(text) {
  const lines = stripFences(text);
  const found = [];
  let offset = 0;
  for (const { line, code } of lines) {
    const heading = !code && /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading)
      found.push({ level: heading[1].length, heading: cleanHeading(heading[2]), start: offset });
    offset += line.length + 1;
  }
  const path = [];
  return found.map((entry, index) => {
    const next = found.slice(index + 1).find((other) => other.level <= entry.level);
    path.length = Math.max(0, entry.level - 1);
    path[entry.level - 1] = entry.heading;
    // The page title (an H1, when a page has one) is not repeated in section paths.
    return {
      ...entry,
      path: entry.level === 1 ? entry.heading : path.slice(1).filter(Boolean).join(' › '),
      end: next?.start ?? text.length,
      ownEnd: found[index + 1]?.start ?? text.length,
    };
  });
}

/** Loads a frozen library: pages from `sources.json` files in each directory, in order. */
export function loadLibrary(directories) {
  const pages = [];
  let summary = '';
  for (const dir of directories) {
    if (!existsSync(join(dir, 'sources.json'))) continue;
    const sources = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
    summary ||= sources.summary ?? '';
    for (const entry of sources.pages) {
      const text = readFileSync(join(dir, entry.file), 'utf8');
      pages.push({ ...entry, text, sections: sections(text) });
    }
  }
  return { summary, pages };
}

export function listDocs(library) {
  return {
    summary: library.summary,
    pages: library.pages.map(
      (page) =>
        `${page.id} | ${page.title}${page.group ? ` (${page.group})` : ''}${page.description ? `: ${page.description}` : ''}`,
    ),
    usage:
      'Each line is "page id | title (group): description". Call get_doc with a page id, optionally with a section heading, or search_docs with keywords.',
  };
}

function findPage(library, page) {
  if (typeof page !== 'string' || !page.trim()) throw new Error('page must be a page id');
  const wanted = page.trim();
  let id = wanted;
  try {
    id = pageId(wanted);
  } catch {
    // Not a URL: a page id or title.
  }
  id = id.replace(/^\/+|\/+$/g, '');
  const lower = id.toLowerCase();
  return (
    library.pages.find((entry) => entry.id === id) ??
    library.pages.find((entry) => entry.id.toLowerCase() === lower) ??
    library.pages.find((entry) => entry.title.toLowerCase() === wanted.toLowerCase())
  );
}

function rankTitles(library, query) {
  const words = new Set(tokens(query));
  return library.pages
    .map((page, order) => ({
      page,
      order,
      score: tokens(`${page.id} ${page.title}`).filter((word) => words.has(word)).length,
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 5)
    .map((entry) => entry.page.id);
}

function excerpt(page, start, end, outline) {
  const text = page.text.slice(start, end);
  if (text.length <= DOC_LIMITS.pageCharacters) return { text, truncated: false };
  let cut = text.lastIndexOf('\n', DOC_LIMITS.pageCharacters);
  if (cut < DOC_LIMITS.pageCharacters / 2) cut = DOC_LIMITS.pageCharacters;
  return {
    text: text.slice(0, cut),
    truncated: true,
    note: `Showing ${cut} of ${text.length} characters. Request one of the listed sections to read the rest.`,
    outline,
  };
}

/** Resolves a section request: exact heading or heading path first, then best word overlap. */
export function resolveSection(page, section) {
  const wanted = normalized(section);
  if (!wanted) return undefined;
  const exact = page.sections.find(
    (entry) => normalized(entry.heading) === wanted || normalized(entry.path) === wanted,
  );
  if (exact) return { entry: exact, exact: true };
  const words = wanted.split(' ');
  const ranked = page.sections
    .map((entry, order) => {
      const own = new Set(tokens(entry.heading));
      const overlap = words.filter((word) => own.has(word)).length;
      return { entry, order, score: overlap / Math.max(words.length, own.size) };
    })
    .filter((candidate) => candidate.score >= DOC_LIMITS.sectionMatchThreshold)
    .sort((a, b) => b.score - a.score || a.entry.level - b.entry.level || a.order - b.order);
  return ranked[0] ? { entry: ranked[0].entry, exact: false } : undefined;
}

/** get_doc: a whole page (or its first part with an outline) or one section of it. */
export function getDoc(library, page, section) {
  const found = findPage(library, page);
  if (!found) {
    const suggestions = rankTitles(library, page);
    return {
      error: `No page "${page}". Use a page id from list_docs.`,
      ...(suggestions.length ? { closest: suggestions } : {}),
    };
  }
  const outline = (entries) =>
    entries.map((entry) => `${'#'.repeat(entry.level)} ${entry.heading}`);
  const base = { page: found.id, title: found.title, url: found.url };
  if (section === undefined || section === '') {
    const shown = excerpt(found, 0, found.text.length, outline(found.sections));
    return { ...base, key: `${found.id}@0-${found.text.length}`, ...shown };
  }
  if (typeof section !== 'string') throw new Error('section must be a heading string');
  const resolved = resolveSection(found, section);
  if (!resolved)
    return {
      ...base,
      error: `No section "${section}" on this page.`,
      outline: outline(found.sections),
    };
  const { entry, exact } = resolved;
  const inner = found.sections.filter(
    (other) => other.start > entry.start && other.start < entry.end,
  );
  return {
    ...base,
    section: entry.path,
    ...(exact ? {} : { matched: `Closest heading to "${section}": ${entry.heading}` }),
    // Keyed by extent, so a page and its whole-page H1 section count as the same read.
    key: `${found.id}@${entry.start}-${entry.end}`,
    ...excerpt(found, entry.start, entry.end, outline(inner)),
  };
}

/**
 * Ranked search over every section's own text: query words found in the heading score most,
 * then the page title, the description, and (log-scaled) the body. Ties keep library order.
 */
export function searchDocs(library, query, limit = DOC_LIMITS.searchDefault) {
  if (typeof query !== 'string' || !tokens(query).length)
    throw new Error('query must contain at least one keyword');
  if (!Number.isInteger(limit) || limit < 1 || limit > DOC_LIMITS.searchMax)
    throw new Error(`limit must be an integer from 1 to ${DOC_LIMITS.searchMax}`);
  const words = [...new Set(tokens(query))];
  const phrase = words.join(' ');
  const results = [];
  library.pages.forEach((page, pageOrder) => {
    const title = new Set(tokens(page.title));
    const description = new Set(tokens(page.description ?? ''));
    const chunks = page.sections.length
      ? [
          ...(page.sections[0].start > 0
            ? [{ heading: page.title, path: page.title, start: 0, ownEnd: page.sections[0].start }]
            : []),
          ...page.sections,
        ]
      : [{ heading: page.title, path: page.title, start: 0, ownEnd: page.text.length }];
    chunks.forEach((chunk, chunkOrder) => {
      const heading = new Set(tokens(chunk.heading));
      const body = page.text.slice(chunk.start, chunk.ownEnd);
      const bodyWords = tokens(body);
      let score = 0;
      let hits = 0;
      for (const word of words) {
        const frequency = bodyWords.filter((other) => other === word).length;
        const hit =
          (heading.has(word) ? 4 : 0) +
          (title.has(word) ? 2 : 0) +
          (description.has(word) ? 1 : 0) +
          Math.min(3, Math.log2(1 + frequency));
        if (hit > 0) hits++;
        score += hit;
      }
      if (!hits) return;
      if (words.length > 1 && normalized(chunk.heading).includes(phrase)) score += 5;
      else if (words.length > 1 && bodyWords.join(' ').includes(phrase)) score += 2;
      score *= hits / words.length;
      const lower = body.toLowerCase();
      const at = Math.max(
        0,
        Math.min(...words.map((word) => lower.indexOf(word)).filter((index) => index >= 0)),
      );
      const from = Math.max(0, at - DOC_LIMITS.snippetCharacters / 3);
      results.push({
        page: page.id,
        title: page.title,
        section: chunk.path,
        score: Math.round(score * 100) / 100,
        snippet: shorten(
          body.slice(from, from + DOC_LIMITS.snippetCharacters),
          DOC_LIMITS.snippetCharacters,
        ),
        order: [pageOrder, chunkOrder],
      });
    });
  });
  results.sort((a, b) => b.score - a.score || a.order[0] - b.order[0] || a.order[1] - b.order[1]);
  return {
    query,
    results: results.slice(0, limit).map(({ page, title, section, score, snippet }) => ({
      page,
      title,
      section,
      score,
      snippet,
    })),
    usage: 'Read a result with get_doc({ page, section }).',
  };
}
