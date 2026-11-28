import {
  createEmptyCanvasScene,
  isCanvasFileName,
  isCanvasNote,
  serializeCanvasScene,
} from '@/features/notes/utils/canvasNote';
import {
  detectCodeLanguageFromTitle,
  getCodeLanguageMeta,
  getNoteLanguage,
  isCodeNote,
} from '@/features/notes/utils/codeNote';
import {
  extractAttachmentIds,
  sanitizeFileName,
} from '@/features/notes/utils/markdown';
import { isTextFileName, isTextNote } from '@/features/notes/utils/textNote';
import { attachmentService } from './attachment.service';
import { db, type NoteRecord } from './db';
import {
  buildFolderPathMap,
  ensureFolderHierarchy,
  listFolders,
} from './folders.repository';
import { createNote, listNotes, updateNoteContent } from './notes.repository';

export interface ImportResult {
  readonly importedNotes: NoteRecord[];
  readonly importedAttachmentCount: number;
}

const IMAGE_OR_ATTACHMENT_EXT_RE =
  /\.(png|jpe?g|gif|webp|svg|bmp|ico|pdf|txt|csv)$/i;
const MARKDOWN_EXT_RE = /\.(md|markdown)$/i;
const IMPORTABLE_TEXT_EXT_RE =
  /\.(md|markdown|txt|canvas|draw|excalidraw|cpp|cc|cxx|hpp|hh|hxx|c|h|py|pyw|ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getUniqueRelativePath(
  candidatePath: string,
  usedPaths: Set<string>,
): string {
  if (!usedPaths.has(candidatePath.toLowerCase())) {
    usedPaths.add(candidatePath.toLowerCase());
    return candidatePath;
  }

  const lastDot = candidatePath.lastIndexOf('.');
  const hasExt = lastDot > candidatePath.lastIndexOf('/');
  const base = hasExt ? candidatePath.slice(0, lastDot) : candidatePath;
  const ext = hasExt ? candidatePath.slice(lastDot) : '';

  let counter = 2;
  while (usedPaths.has(`${base} (${counter})${ext}`.toLowerCase())) {
    counter += 1;
  }
  const unique = `${base} (${counter})${ext}`;
  usedPaths.add(unique.toLowerCase());
  return unique;
}

/**
 * Exports a single note as a standard `.md` file.
 */
export function exportNoteAsMarkdown(note: NoteRecord): void {
  const safeBase = sanitizeFileName(note.title);
  if (isCanvasNote(note)) {
    const fileName = isCanvasFileName(safeBase)
      ? safeBase
      : `${safeBase}.canvas`;
    const blob = new Blob([note.content], {
      type: 'application/json;charset=utf-8',
    });
    triggerDownload(blob, fileName);
    return;
  }

  if (isCodeNote(note)) {
    const lang = getNoteLanguage(note);
    const meta = getCodeLanguageMeta(lang);
    const hasCodeExt = detectCodeLanguageFromTitle(safeBase) !== null;
    const fileName = hasCodeExt ? safeBase : `${safeBase}${meta.ext}`;
    const blob = new Blob([note.content], {
      type: 'text/plain;charset=utf-8',
    });
    triggerDownload(blob, fileName);
    return;
  }

  if (isTextNote(note)) {
    const fileName = isTextFileName(safeBase) ? safeBase : `${safeBase}.txt`;
    const blob = new Blob([note.content], {
      type: 'text/plain;charset=utf-8',
    });
    triggerDownload(blob, fileName);
    return;
  }

  const safeName = `${safeBase}.md`;
  const blob = new Blob([note.content], {
    type: 'text/markdown;charset=utf-8',
  });
  triggerDownload(blob, safeName);
}

/**
 * Exports the entire local vault as a standard ZIP archive preserving folder
 * structures, standard Markdown files, and attachments with relative links.
 */
export async function exportVaultAsZip(): Promise<void> {
  const [notes, folders, allAttachments] = await Promise.all([
    listNotes(),
    listFolders(),
    db.attachments.filter((a) => !a.deletedAt).toArray(),
  ]);

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const folderPathMap = buildFolderPathMap(folders);
  const usedPaths = new Set<string>();
  const attachmentZipPaths = new Map<string, string>();

  // 1. Export attachments first so notes can link to relative paths
  for (const attachment of allAttachments) {
    const safeAttachmentName = sanitizeFileName(attachment.fileName);
    const relativeAttachmentPath = getUniqueRelativePath(
      `attachments/${safeAttachmentName}`,
      usedPaths,
    );
    attachmentZipPaths.set(attachment.id, relativeAttachmentPath);
    zip.file(relativeAttachmentPath, attachment.data);
  }

  // Ensure empty folders are represented in the archive
  for (const folder of folders) {
    const rawPath = folderPathMap.get(folder.id);
    if (!rawPath) continue;
    const sanitizedSegments = rawPath
      .split('/')
      .map((s) => sanitizeFileName(s))
      .join('/');
    if (sanitizedSegments) {
      zip.folder(sanitizedSegments);
    }
  }

  // 2. Export notes with relative attachment references
  for (const note of notes) {
    const folderSegments = note.folderId
      ? (folderPathMap.get(note.folderId) ?? '')
          .split('/')
          .filter(Boolean)
          .map((s) => sanitizeFileName(s))
      : [];

    const noteTitle = sanitizeFileName(note.title);
    let archiveFileName: string;
    if (isCanvasNote(note)) {
      archiveFileName = isCanvasFileName(noteTitle)
        ? noteTitle
        : `${noteTitle}.canvas`;
    } else if (isCodeNote(note)) {
      const langMeta = getCodeLanguageMeta(getNoteLanguage(note));
      archiveFileName =
        detectCodeLanguageFromTitle(noteTitle) !== null
          ? noteTitle
          : `${noteTitle}${langMeta.ext}`;
    } else if (isTextNote(note)) {
      archiveFileName = isTextFileName(noteTitle)
        ? noteTitle
        : `${noteTitle}.txt`;
    } else {
      archiveFileName = `${noteTitle}.md`;
    }

    const rawNotePath =
      folderSegments.length > 0
        ? `${folderSegments.join('/')}/${archiveFileName}`
        : archiveFileName;
    const uniqueNotePath = getUniqueRelativePath(rawNotePath, usedPaths);

    const depth = folderSegments.length;
    const relativePrefix = depth > 0 ? '../'.repeat(depth) : './';
    let fileContent = note.content;
    if (!isCodeNote(note) && !isCanvasNote(note) && !isTextNote(note)) {
      const referencedIds = extractAttachmentIds(fileContent);
      for (const attachmentId of referencedIds) {
        const zipPath = attachmentZipPaths.get(attachmentId);
        if (zipPath) {
          fileContent = fileContent.replaceAll(
            `nexus-attachment://${attachmentId}`,
            `${relativePrefix}${zipPath}`,
          );
        }
      }
    }

    zip.file(uniqueNotePath, fileContent);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const timestamp = new Date().toISOString().slice(0, 10);
  triggerDownload(zipBlob, `nexus-notes-export-${timestamp}.zip`);
}

function getRelativePathSegments(file: File): string[] {
  const rel = file.webkitRelativePath;
  if (!rel) return [file.name];
  return rel.split('/').filter(Boolean);
}

/**
 * Imports single or multiple Markdown, Canvas, or source code files (and
 * optional nested folders and accompanying attachment files) into IndexedDB.
 */
export async function importMarkdownFiles(
  fileList: FileList | readonly File[],
): Promise<ImportResult> {
  const files = Array.from(fileList);
  const textFiles = files.filter((f) => IMPORTABLE_TEXT_EXT_RE.test(f.name));
  const assetFiles = files.filter(
    (f) =>
      !IMPORTABLE_TEXT_EXT_RE.test(f.name) &&
      IMAGE_OR_ATTACHMENT_EXT_RE.test(f.name),
  );

  const importedNotes: NoteRecord[] = [];
  let importedAttachmentCount = 0;

  // Map lowercase asset filename and relative path -> File
  const assetByRelPath = new Map<string, File>();
  const assetByFileName = new Map<string, File>();
  for (const asset of assetFiles) {
    if (asset.webkitRelativePath) {
      assetByRelPath.set(asset.webkitRelativePath.toLowerCase(), asset);
    }
    assetByFileName.set(asset.name.toLowerCase(), asset);
  }

  const existingNotes = await listNotes();
  const folderPathMap = buildFolderPathMap(await listFolders());

  for (const textFile of textFiles) {
    const rawText = await textFile.text();
    const pathSegments = getRelativePathSegments(textFile);
    const folderSegments = pathSegments.slice(0, -1);
    const folderId =
      folderSegments.length > 0
        ? await ensureFolderHierarchy(folderSegments)
        : null;

    const isCanvas = isCanvasFileName(textFile.name);
    const isText = !isCanvas && isTextFileName(textFile.name);
    const detectedLang =
      isCanvas || isText ? null : detectCodeLanguageFromTitle(textFile.name);
    const isMarkdown =
      !isCanvas &&
      !isText &&
      (MARKDOWN_EXT_RE.test(textFile.name) || detectedLang === null);
    const rawTitle = isMarkdown
      ? textFile.name.replace(MARKDOWN_EXT_RE, '').trim() || 'Imported Note'
      : textFile.name.trim() || 'untitled';

    // Handle duplicate titles inside the exact same destination folder safely
    const siblingsInFolder = existingNotes.filter(
      (n) => n.folderId === folderId,
    );
    let finalTitle = rawTitle;
    let suffix = 2;
    while (
      siblingsInFolder.some(
        (n) => n.title.toLowerCase() === finalTitle.toLowerCase(),
      )
    ) {
      if (!isMarkdown && (detectedLang || isCanvas || isText)) {
        const dotIdx = rawTitle.lastIndexOf('.');
        const stem = dotIdx > 0 ? rawTitle.slice(0, dotIdx) : rawTitle;
        const ext = dotIdx > 0 ? rawTitle.slice(dotIdx) : '';
        finalTitle = `${stem} (${suffix})${ext}`;
      } else {
        finalTitle = `${rawTitle} (${suffix})`;
      }
      suffix += 1;
    }

    const createdNote = await createNote({
      title: finalTitle,
      folderId,
      content:
        isCanvas && !rawText.trim()
          ? serializeCanvasScene(createEmptyCanvasScene())
          : rawText,
      ...(isCanvas
        ? { type: 'canvas' as const }
        : isText
          ? { type: 'text' as const }
          : detectedLang
            ? { type: 'code' as const, language: detectedLang }
            : {}),
    });
    existingNotes.push(createdNote);

    if (detectedLang || isCanvas || isText) {
      importedNotes.push(createdNote);
      continue;
    }

    // Import referenced relative images/attachments if included in selection
    let updatedMarkdown = rawText;
    const mdRefRe = /(!?\[[^\]]*\]\()([^)\s]+)(\))/g;
    const replacements: Array<{ target: string; uri: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = mdRefRe.exec(rawText)) !== null) {
      const refTarget = match[2];
      if (
        !refTarget ||
        refTarget.startsWith('http://') ||
        refTarget.startsWith('https://') ||
        refTarget.startsWith('data:') ||
        refTarget.startsWith('nexus-attachment://')
      ) {
        continue;
      }

      let decoded = refTarget;
      try {
        decoded = decodeURIComponent(refTarget);
      } catch {
        decoded = refTarget;
      }
      decoded = decoded.replace(/\\/g, '/');
      const baseName = decoded.split('/').pop()?.toLowerCase() ?? '';
      const folderPrefix = folderId ? folderPathMap.get(folderId) : '';
      const candidateRel = folderPrefix
        ? `${folderPrefix}/${decoded.replace(/^\.\//, '')}`.toLowerCase()
        : decoded.replace(/^\.\//, '').toLowerCase();

      const assetFile =
        assetByRelPath.get(candidateRel) ?? assetByFileName.get(baseName);
      if (assetFile) {
        const saved = await attachmentService.saveAttachment(
          assetFile,
          createdNote.id,
          assetFile.name,
        );
        importedAttachmentCount += 1;
        replacements.push({
          target: refTarget,
          uri: `nexus-attachment://${saved.id}`,
        });
      }
    }

    if (replacements.length > 0) {
      for (const rep of replacements) {
        updatedMarkdown = updatedMarkdown.replaceAll(rep.target, rep.uri);
      }
      const savedNote = await updateNoteContent(createdNote.id, updatedMarkdown);
      importedNotes.push(savedNote);
    } else {
      importedNotes.push(createdNote);
    }
  }

  return {
    importedNotes,
    importedAttachmentCount,
  };
}
