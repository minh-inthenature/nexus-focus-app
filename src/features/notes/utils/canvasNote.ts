import type { NoteRecord } from '@/services/storage/db';

export interface CanvasSceneData {
  readonly type: 'excalidraw';
  readonly version: number;
  readonly elements: readonly Record<string, unknown>[];
  readonly appState: Record<string, unknown>;
  readonly files: Record<string, unknown>;
}

export interface ExcalidrawMarkdownBlock {
  readonly index: number;
  readonly from: number;
  readonly to: number;
  readonly rawJson: string;
}

const CANVAS_FILE_EXT_RE = /\.(canvas|draw|excalidraw)$/i;
const EXCALIDRAW_FENCE_RE =
  /^```excalidraw[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;

export function isCanvasNote(
  note?: Pick<NoteRecord, 'type'> | null,
): boolean {
  return note?.type === 'canvas';
}

export function isCanvasFileName(title: string): boolean {
  return CANVAS_FILE_EXT_RE.test(title.trim());
}

export function createEmptyCanvasScene(
  bgColor = '#141414',
): CanvasSceneData {
  return {
    type: 'excalidraw',
    version: 2,
    elements: [],
    appState: {
      viewBackgroundColor: bgColor,
    },
    files: {},
  };
}

/**
 * Strips non-serializable or runtime-only `appState` fields (especially
 * `collaborators`, which Excalidraw expects as a `Map` rather than `{}`).
 */
function sanitizeAppState(
  rawAppState: unknown,
  fallbackBg = '#141414',
): Record<string, unknown> {
  if (!rawAppState || typeof rawAppState !== 'object') {
    return { viewBackgroundColor: fallbackBg };
  }

  const record = rawAppState as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (
      key === 'collaborators' ||
      key === 'selectedElementIds' ||
      key === 'selectedGroupIds' ||
      key === 'editingGroupId' ||
      key === 'editingLinearElement' ||
      key === 'activeTool' ||
      key === 'openMenu' ||
      key === 'openPopup' ||
      key === 'openSidebar' ||
      key === 'toast'
    ) {
      continue;
    }
    cleaned[key] = value;
  }

  if (
    typeof cleaned.viewBackgroundColor !== 'string' ||
    !cleaned.viewBackgroundColor ||
    cleaned.viewBackgroundColor === 'transparent'
  ) {
    cleaned.viewBackgroundColor = fallbackBg;
  }

  return cleaned;
}

export function normalizeCanvasBgForTheme(
  bg: unknown,
  isDark: boolean,
): string {
  if (typeof bg !== 'string' || !bg || bg === 'transparent') {
    return 'transparent';
  }
  if (
    isDark &&
    (bg.toLowerCase() === '#141414' ||
      bg.toLowerCase() === '#191919' ||
      bg.toLowerCase() === '#1f1e1c')
  ) {
    return 'transparent';
  }
  return bg;
}

export function parseCanvasScene(
  raw: string,
  fallbackBg = '#141414',
): CanvasSceneData {
  const trimmed = raw.trim();
  if (!trimmed) {
    return createEmptyCanvasScene(fallbackBg);
  }

  try {
    const parsed = JSON.parse(trimmed) as Partial<CanvasSceneData> | null;
    if (!parsed || typeof parsed !== 'object') {
      return createEmptyCanvasScene(fallbackBg);
    }

    const elements = Array.isArray(parsed.elements)
      ? parsed.elements.filter(
          (el): el is Record<string, unknown> =>
            Boolean(el) && typeof el === 'object',
        )
      : [];
    const files =
      parsed.files && typeof parsed.files === 'object'
        ? { ...(parsed.files as Record<string, unknown>) }
        : {};

    return {
      type: 'excalidraw',
      version: typeof parsed.version === 'number' ? parsed.version : 2,
      elements,
      appState: sanitizeAppState(parsed.appState, fallbackBg),
      files,
    };
  } catch {
    return createEmptyCanvasScene(fallbackBg);
  }
}

export function serializeCanvasScene(scene: {
  readonly elements: readonly Record<string, unknown>[];
  readonly appState?: unknown;
  readonly files?: unknown;
}): string {
  const normalized: CanvasSceneData = {
    type: 'excalidraw',
    version: 2,
    elements: scene.elements.filter((el) => !el.isDeleted),
    appState: sanitizeAppState(scene.appState),
    files:
      scene.files && typeof scene.files === 'object'
        ? { ...(scene.files as Record<string, unknown>) }
        : {},
  };
  return JSON.stringify(normalized);
}

export function getCanvasElementCount(rawOrScene: string | CanvasSceneData): number {
  const scene =
    typeof rawOrScene === 'string' ? parseCanvasScene(rawOrScene) : rawOrScene;
  let count = 0;
  for (const el of scene.elements) {
    if (!el.isDeleted) {
      count += 1;
    }
  }
  return count;
}

/**
 * Deterministic signature used to avoid dirty writes / spurious autosaves when
 * Excalidraw fires onChange for viewport panning or initial mount.
 */
export function computeCanvasChangeSignature(
  elements: readonly Record<string, unknown>[],
  appState?: Record<string, unknown> | null,
  files?: Record<string, unknown> | null,
): string {
  const activePart = elements
    .filter((el) => !el.isDeleted)
    .map(
      (el) =>
        `${String(el.id ?? '')}:${String(el.version ?? 0)}:${String(el.versionNonce ?? 0)}`,
    )
    .join('|');
  const bg =
    typeof appState?.viewBackgroundColor === 'string'
      ? appState.viewBackgroundColor
      : '';
  const fileKeys = files ? Object.keys(files).sort().join(',') : '';
  return `${bg}::${fileKeys}::${activePart}`;
}

export function createInlineDiagramMarkdown(
  scene: CanvasSceneData = createEmptyCanvasScene(),
): string {
  const json = serializeCanvasScene(scene);
  return `\`\`\`excalidraw\n${json}\n\`\`\``;
}

export function findExcalidrawBlocks(
  markdown: string,
): ExcalidrawMarkdownBlock[] {
  const blocks: ExcalidrawMarkdownBlock[] = [];
  EXCALIDRAW_FENCE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = EXCALIDRAW_FENCE_RE.exec(markdown)) !== null) {
    blocks.push({
      index: idx,
      from: match.index,
      to: match.index + match[0].length,
      rawJson: (match[1] ?? '').trim(),
    });
    idx += 1;
  }
  return blocks;
}

export function replaceExcalidrawBlockAt(
  markdown: string,
  blockIndex: number,
  nextJson: string,
): string {
  const blocks = findExcalidrawBlocks(markdown);
  const target = blocks[blockIndex];
  if (!target) return markdown;

  const replacement = `\`\`\`excalidraw\n${nextJson}\n\`\`\``;
  return (
    markdown.slice(0, target.from) + replacement + markdown.slice(target.to)
  );
}
