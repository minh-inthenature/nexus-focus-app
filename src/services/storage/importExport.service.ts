import {
  extractAttachmentIds,
  sanitizeFileName,
} from '@/features/notes/utils/markdown';
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
  const safeName = `${sanitizeFileName(note.title)}.md`;
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
    const rawNotePath =
      folderSegments.length > 0
        ? `${folderSegments.join('/')}/${noteTitle}.md`
        : `${noteTitle}.md`;
    const uniqueNotePath = getUniqueRelativePath(rawNotePath, usedPaths);

    const depth = folderSegments.length;
    const relativePrefix = depth > 0 ? '../'.repeat(depth) : './';
    let markdown = note.content;
    const referencedIds = extractAttachmentIds(markdown);
    for (const attachmentId of referencedIds) {
      const zipPath = attachmentZipPaths.get(attachmentId);
      if (zipPath) {
        markdown = markdown.replaceAll(
          `nexus-attachment://${attachmentId}`,
          `${relativePrefix}${zipPath}`,
        );
      }
    }

    zip.file(uniqueNotePath, markdown);
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
 * Imports single or multiple Markdown files (and optional nested folders and
 * accompanying attachment files) into IndexedDB.
 */
export async function importMarkdownFiles(
  fileList: FileList | readonly File[],
): Promise<ImportResult> {
  const files = Array.from(fileList);
  const markdownFiles = files.filter((f) => MARKDOWN_EXT_RE.test(f.name));
  const assetFiles = files.filter(
    (f) => !MARKDOWN_EXT_RE.test(f.name) && IMAGE_OR_ATTACHMENT_EXT_RE.test(f.name),
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

  for (const mdFile of markdownFiles) {
    const rawText = await mdFile.text();
    const pathSegments = getRelativePathSegments(mdFile);
    const folderSegments = pathSegments.slice(0, -1);
    const folderId =
      folderSegments.length > 0
        ? await ensureFolderHierarchy(folderSegments)
        : null;

    const rawTitle = mdFile.name.replace(MARKDOWN_EXT_RE, '').trim() || 'Imported Note';

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
      finalTitle = `${rawTitle} (${suffix})`;
      suffix += 1;
    }

    const createdNote = await createNote({
      title: finalTitle,
      folderId,
      content: rawText,
    });
    existingNotes.push(createdNote);

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
