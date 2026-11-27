import { isValidElement, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FileDown, Paperclip } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { findExcalidrawBlocks } from '@/features/notes/utils/canvasNote';
import { attachmentService, type NoteRecord } from '@/services';
import type { WikiLinkResolution } from '@/features/notes/stores/useNotesStore';
import { cn } from '@/utils/cn';
import { InlineDiagramCard } from './InlineDiagramCard';

export interface MarkdownPreviewProps {
  content: string;
  resolveWikiLink: (target: string) => WikiLinkResolution;
  onOpenWikiLink: (target: string) => void;
  onClickTag: (tagName: string) => void;
  onEditDiagramBlock?: (blockIndex: number, rawJson: string) => void;
}

const SAFE_URL_PROTOCOLS = /^(https?:|mailto:|tel:|nexus-wikilink:|nexus-tag:|nexus-attachment:)/i;

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeUrlTransform(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('#')) {
    return trimmed;
  }
  if (SAFE_URL_PROTOCOLS.test(trimmed)) {
    return trimmed;
  }
  // Allow relative filenames without explicit scheme
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  return '';
}

/**
 * Converts Obsidian `[[target]]` / `[[target|alias]]` links and `#tag` tokens
 * into clickable custom URI links for ReactMarkdown, leaving fenced code blocks,
 * inline code, math blocks, and existing Markdown links untouched.
 */
function transformWikiLinksAndTags(markdown: string): string {
  const preserved: string[] = [];
  const hold = (segment: string): string => {
    const token = `@@NEXUS_HOLD_${preserved.length}@@`;
    preserved.push(segment);
    return token;
  };

  // Preserve fenced code blocks, math blocks, inline code, inline math, and Markdown links
  let text = markdown
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, hold)
    .replace(/\$\$[\s\S]*?\$\$/g, hold)
    .replace(/(`+)([^`\n]|[^`][\s\S]*?[^`])\1/g, hold)
    .replace(/\$[^$\n]+\$/g, hold)
    .replace(/!?\[[^\]\n]*\]\([^)\n]+\)/g, hold);

  // Transform [[Target]] and [[Target|Alias]]
  text = text.replace(
    /\[\[([^[\]\n|]+?)(?:\|([^[\]\n]+?))?\]\]/g,
    (_full, rawTarget: string, rawAlias?: string) => {
      const target = rawTarget.trim();
      const label = (rawAlias ?? rawTarget).trim();
      if (!target) return _full;
      return hold(
        `[${label}](<nexus-wikilink://${encodeURIComponent(target)}>)`,
      );
    },
  );

  // Transform standalone #tags outside headings/URLs
  text = text.replace(
    /(^|[\s(])#([a-zA-Z][a-zA-Z0-9_/-]*)/gm,
    (_full, prefix: string, rawTag: string) => {
      const tag = rawTag.replace(/\/+$/, '').toLowerCase();
      if (!tag) return _full;
      return `${prefix}[#${tag}](<nexus-tag://${encodeURIComponent(tag)}>)`;
    },
  );

  // Restore held tokens in reverse order in case of nested references
  for (let i = preserved.length - 1; i >= 0; i -= 1) {
    const value = preserved[i];
    if (value !== undefined) {
      text = text.replace(`@@NEXUS_HOLD_${i}@@`, () => value);
    }
  }

  return text;
}

function AttachmentImage({
  attachmentId,
  alt,
}: {
  attachmentId: string;
  alt?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    void attachmentService.getAttachment(attachmentId).then((record) => {
      if (!active) return;
      if (!record) {
        setMissing(true);
        return;
      }
      createdUrl = URL.createObjectURL(record.data);
      setObjectUrl(createdUrl);
    });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [attachmentId]);

  if (missing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground">
        Missing attachment ({alt || attachmentId})
      </span>
    );
  }

  if (!objectUrl) {
    return (
      <span className="inline-block rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
        Loading image…
      </span>
    );
  }

  return (
    <img
      src={objectUrl}
      alt={alt || 'Attachment'}
      className="my-3 max-h-[480px] rounded-md border border-border object-contain"
    />
  );
}

function AttachmentDownloadLink({
  attachmentId,
  label,
}: {
  attachmentId: string;
  label: string;
}) {
  const handleDownload = async () => {
    const record = await attachmentService.getAttachment(attachmentId);
    if (!record) return;
    const url = URL.createObjectURL(record.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = record.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <button
      type="button"
      onClick={() => void handleDownload()}
      className="inline-flex items-center gap-1.5 rounded border border-border bg-muted/60 px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-accent cursor-pointer"
    >
      <Paperclip className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      <span>{label}</span>
      <FileDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/**
 * Standard Markdown reading/preview renderer with GFM tables, checklists, KaTeX
 * math equations, local IndexedDB attachment rendering, clickable `#tags`, and
 * Obsidian-style `[[internal links]]`.
 */
export function MarkdownPreview({
  content,
  resolveWikiLink,
  onOpenWikiLink,
  onClickTag,
  onEditDiagramBlock,
}: MarkdownPreviewProps) {
  const transformed = useMemo(
    () => transformWikiLinksAndTags(content),
    [content],
  );

  if (!content.trim()) {
    return (
      <p className="py-6 text-sm text-muted-foreground italic">
        This note is empty. Switch to Edit mode to start writing.
      </p>
    );
  }

  return (
    <div className="nexus-prose py-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={safeUrlTransform}
        components={{
          pre: ({ node, children }) => {
            const firstChild = Array.isArray(children) ? children[0] : children;
            if (
              isValidElement<{ className?: string; children?: ReactNode }>(
                firstChild,
              ) &&
              typeof firstChild.props.className === 'string' &&
              firstChild.props.className.includes('language-excalidraw')
            ) {
              const rawJson = String(firstChild.props.children ?? '').trim();
              const blockLine = node?.position?.start.line;
              const allBlocks = findExcalidrawBlocks(content);
              const matchedBlock =
                (blockLine !== undefined
                  ? allBlocks.find((b) => {
                      const lineStart = content
                        .slice(0, b.from)
                        .split('\n').length;
                      return lineStart === blockLine;
                    })
                  : undefined) ??
                allBlocks.find((b) => b.rawJson === rawJson);
              const blockIdx = matchedBlock?.index ?? 0;

              return (
                <InlineDiagramCard
                  rawJson={rawJson}
                  onEdit={() => onEditDiagramBlock?.(blockIdx, rawJson)}
                />
              );
            }

            return <pre>{children}</pre>;
          },
          a: ({ href, children }) => {
            if (href?.startsWith('nexus-wikilink://')) {
              const target = safeDecodeURIComponent(
                href.slice('nexus-wikilink://'.length),
              );
              const resolution = resolveWikiLink(target);
              const isResolved =
                Boolean(resolution.exactMatch) ||
                resolution.ambiguousMatches.length > 0;
              const isAmbiguous = resolution.ambiguousMatches.length > 1;

              return (
                <button
                  type="button"
                  onClick={() => onOpenWikiLink(target)}
                  title={
                    isAmbiguous
                      ? `Multiple notes match "${target}" — click to choose`
                      : isResolved
                        ? `Open "${target}"`
                        : `"${target}" does not exist yet — click to create`
                  }
                  className={cn(
                    'inline cursor-pointer rounded-sm px-0.5 font-medium underline underline-offset-4 transition-colors',
                    isResolved
                      ? 'text-blue-600 decoration-blue-600/40 hover:bg-blue-500/10 dark:text-blue-400 dark:decoration-blue-400/40'
                      : 'text-muted-foreground decoration-dashed decoration-muted-foreground/60 hover:text-foreground',
                  )}
                >
                  {children}
                  {isAmbiguous ? ' ?' : ''}
                </button>
              );
            }

            if (href?.startsWith('nexus-tag://')) {
              const tagName = safeDecodeURIComponent(
                href.slice('nexus-tag://'.length),
              );
              return (
                <button
                  type="button"
                  onClick={() => onClickTag(tagName)}
                  className="inline-flex cursor-pointer items-center rounded bg-accent/80 px-1.5 py-0.5 font-mono text-[12px] text-foreground transition-colors hover:bg-accent"
                >
                  {children}
                </button>
              );
            }

            if (href?.startsWith('nexus-attachment://')) {
              const id = href.slice('nexus-attachment://'.length);
              return (
                <AttachmentDownloadLink
                  attachmentId={id}
                  label={String(children || 'Download attachment')}
                />
              );
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline underline-offset-4 hover:opacity-80 dark:text-blue-400"
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => {
            if (src?.startsWith('nexus-attachment://')) {
              const id = src.slice('nexus-attachment://'.length);
              return <AttachmentImage attachmentId={id} alt={alt} />;
            }
            return (
              <img
                src={src}
                alt={alt || ''}
                className="my-3 max-h-[480px] rounded-md border border-border object-contain"
              />
            );
          },
        }}
      >
        {transformed}
      </ReactMarkdown>
    </div>
  );
}

export type { NoteRecord };
