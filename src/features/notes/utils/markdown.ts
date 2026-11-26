export interface ParsedWikiLink {
  readonly raw: string;
  readonly target: string;
  readonly alias?: string;
}

export interface MarkdownMetrics {
  readonly words: number;
  readonly chars: number;
}

const ATTACHMENT_URI_RE = /nexus-attachment:\/\/([a-zA-Z0-9-]+)/g;
const WIKI_LINK_RE = /\[\[([^[\]\n|]+?)(?:\|([^[\]\n]+?))?\]\]/g;
const TAG_RE = /(^|[\s(])#([a-zA-Z][a-zA-Z0-9_/-]*)/gm;

/**
 * Replaces fenced code blocks and inline code spans with spaces of equal length
 * so regex scanners ignore code examples while preserving character offsets.
 */
function maskCodeSegments(markdown: string): string {
  // 1. Mask fenced code blocks (``` or ~~~)
  let masked = markdown.replace(
    /^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm,
    (match) => match.replace(/[^\n]/g, ' '),
  );

  // 2. Mask inline code spans (`...` or ``...``)
  masked = masked.replace(/(`+)([^`\n]|[^`][\s\S]*?[^`])\1/g, (match) =>
    match.replace(/[^\n]/g, ' '),
  );

  return masked;
}

/**
 * Extracts Obsidian-style `[[Note Title]]` and `[[Note Title|Alias]]` links
 * outside fenced and inline code blocks.
 */
export function extractWikiLinks(markdown: string): ParsedWikiLink[] {
  const masked = maskCodeSegments(markdown);
  const links: ParsedWikiLink[] = [];

  WIKI_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKI_LINK_RE.exec(masked)) !== null) {
    const rawTarget = match[1]?.trim() ?? '';
    if (!rawTarget) continue;

    const rawAlias = match[2]?.trim();
    const raw = markdown.slice(match.index, match.index + match[0].length);
    links.push({
      raw,
      target: rawTarget,
      ...(rawAlias ? { alias: rawAlias } : {}),
    });
  }

  return links;
}

/**
 * Rewrites `[[oldTitle]]` / `[[folderPath/oldTitle]]` wiki-links outside code
 * blocks when a target note is renamed, preserving any display alias.
 */
export function rewriteWikiLinksForRename(
  markdown: string,
  oldTitle: string,
  newTitle: string,
  folderPath?: string,
): string {
  const normalizedOld = oldTitle.trim().toLowerCase();
  const normalizedNew = newTitle.trim();
  if (!normalizedOld || !normalizedNew || normalizedOld === normalizedNew.toLowerCase()) {
    if (oldTitle.trim() === normalizedNew) return markdown;
  }

  const oldWithFolder = folderPath
    ? `${folderPath.toLowerCase()}/${normalizedOld}`
    : null;

  const masked = maskCodeSegments(markdown);
  const replacements: Array<{ start: number; end: number; value: string }> = [];

  WIKI_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKI_LINK_RE.exec(masked)) !== null) {
    const rawTarget = match[1]?.trim() ?? '';
    const lowerTarget = rawTarget.toLowerCase();
    const aliasPart = match[2] !== undefined ? `|${match[2]}` : '';

    let nextTarget: string | null = null;
    if (lowerTarget === normalizedOld) {
      nextTarget = normalizedNew;
    } else if (oldWithFolder && lowerTarget === oldWithFolder && folderPath) {
      nextTarget = `${folderPath}/${normalizedNew}`;
    }

    if (nextTarget !== null) {
      replacements.push({
        start: match.index,
        end: match.index + match[0].length,
        value: `[[${nextTarget}${aliasPart}]]`,
      });
    }
  }

  if (replacements.length === 0) return markdown;

  let result = '';
  let cursor = 0;
  for (const rep of replacements) {
    result += markdown.slice(cursor, rep.start) + rep.value;
    cursor = rep.end;
  }
  result += markdown.slice(cursor);
  return result;
}

/**
 * Extracts normalized lowercase `#tag` values outside code blocks, headings,
 * and URLs. Preserves first-seen order without duplicates.
 */
export function extractTags(markdown: string): string[] {
  const masked = maskCodeSegments(markdown);
  const seen = new Set<string>();
  const tags: string[] = [];

  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(masked)) !== null) {
    const rawTag = match[2];
    if (!rawTag) continue;
    const normalized = rawTag.replace(/\/+$/, '').toLowerCase();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      tags.push(normalized);
    }
  }

  return tags;
}

/**
 * Extracts unique `nexus-attachment://<id>` identifiers referenced in Markdown.
 */
export function extractAttachmentIds(markdown: string): string[] {
  const seen = new Set<string>();
  ATTACHMENT_URI_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTACHMENT_URI_RE.exec(markdown)) !== null) {
    const id = match[1];
    if (id) seen.add(id);
  }
  return Array.from(seen);
}

/**
 * Computes word and character counts for the editor footer.
 */
export function countWordsAndChars(markdown: string): MarkdownMetrics {
  const trimmed = markdown.trim();
  return {
    words: trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length,
    chars: markdown.length,
  };
}

/**
 * Sanitizes a note or folder title into a safe cross-platform filename segment.
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '');
  return cleaned || 'Untitled';
}

/**
 * Formats a Date into local `YYYY-MM-DD` for Daily Notes.
 */
export function formatDailyNoteDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Shifts a `YYYY-MM-DD` string by a number of calendar days.
 */
export function shiftDailyDate(dateStr: string, offsetDays: number): string {
  const parts = dateStr.split('-').map(Number);
  const year = parts[0] ?? new Date().getFullYear();
  const month = (parts[1] ?? 1) - 1;
  const day = parts[2] ?? 1;
  const shifted = new Date(year, month, day + offsetDays);
  return formatDailyNoteDate(shifted);
}
