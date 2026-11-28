import { extractTags } from '@/features/notes/utils/markdown';
import type {
  CodeLanguage,
  NoteRecord,
  NoteType,
} from '@/services/storage/db';

export interface CodeLanguageMeta {
  readonly id: CodeLanguage;
  readonly label: string;
  readonly badge: string;
  readonly ext: string;
  readonly defaultTitle: string;
  readonly monacoId: string;
  readonly starterCode: string;
}

export const CODE_LANGUAGES: readonly CodeLanguageMeta[] = [
  {
    id: 'cpp',
    label: 'C++',
    badge: 'C++',
    ext: '.cpp',
    defaultTitle: 'untitled.cpp',
    monacoId: 'cpp',
    starterCode: `#include <iostream>

int main() {
  std::cout << "Hello, Nexus!" << std::endl;
  return 0;
}
`,
  },
  {
    id: 'python',
    label: 'Python',
    badge: 'PY',
    ext: '.py',
    defaultTitle: 'untitled.py',
    monacoId: 'python',
    starterCode: `def main() -> None:
    print("Hello, Nexus!")


if __name__ == "__main__":
    main()
`,
  },
  {
    id: 'c',
    label: 'C',
    badge: 'C',
    ext: '.c',
    defaultTitle: 'untitled.c',
    monacoId: 'c',
    starterCode: `#include <stdio.h>

int main(void) {
  printf("Hello, Nexus!\\n");
  return 0;
}
`,
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    badge: 'TS',
    ext: '.ts',
    defaultTitle: 'untitled.ts',
    monacoId: 'typescript',
    starterCode: `export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`,
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    badge: 'JS',
    ext: '.js',
    defaultTitle: 'untitled.js',
    monacoId: 'javascript',
    starterCode: `export function greet(name) {
  return \`Hello, \${name}!\`;
}
`,
  },
] as const;

const LANGUAGE_MAP: ReadonlyMap<CodeLanguage, CodeLanguageMeta> = new Map(
  CODE_LANGUAGES.map((meta) => [meta.id, meta]),
);

const CODE_EXTENSION_MAP: Readonly<Record<string, CodeLanguage>> = {
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  py: 'python',
  pyw: 'python',
  c: 'c',
  h: 'c',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
};

const C_PREPROCESSOR_KEYWORDS = new Set<string>([
  'include',
  'define',
  'undef',
  'ifdef',
  'ifndef',
  'if',
  'else',
  'elif',
  'endif',
  'pragma',
  'error',
  'warning',
  'line',
]);

export function getNoteType(
  note?: Pick<NoteRecord, 'type'> | null,
): NoteType {
  if (
    note?.type === 'code' ||
    note?.type === 'canvas' ||
    note?.type === 'text'
  ) {
    return note.type;
  }
  return 'markdown';
}

export function isCodeNote(note?: Pick<NoteRecord, 'type'> | null): boolean {
  return getNoteType(note) === 'code';
}

export function getCodeLanguageMeta(language: CodeLanguage): CodeLanguageMeta {
  return LANGUAGE_MAP.get(language) ?? CODE_LANGUAGES[0]!;
}

/**
 * Resolves the effective CodeLanguage for a note, falling back to title
 * extension inference or `'cpp'` when unspecified.
 */
export function getNoteLanguage(
  note?: Pick<NoteRecord, 'language' | 'title'> | null,
): CodeLanguage {
  if (note?.language && LANGUAGE_MAP.has(note.language)) {
    return note.language;
  }
  const detected = note?.title ? detectCodeLanguageFromTitle(note.title) : null;
  return detected ?? 'cpp';
}

/**
 * Infers a supported code language from a filename or note title extension,
 * returning `null` if the title has no recognized code extension.
 */
export function detectCodeLanguageFromTitle(
  title: string,
): CodeLanguage | null {
  const trimmed = title.trim();
  const dotIdx = trimmed.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === trimmed.length - 1) return null;
  const ext = trimmed.slice(dotIdx + 1).toLowerCase();
  return CODE_EXTENSION_MAP[ext] ?? null;
}

export function isMarkdownFileName(title: string): boolean {
  return /\.(md|markdown)$/i.test(title.trim());
}

/**
 * Replaces or appends the extension on a code note title when switching
 * languages (preserving user stem, e.g. `binary_search.cpp` -> `binary_search.py`).
 */
export function swapCodeTitleExtension(
  title: string,
  nextLanguage: CodeLanguage,
): string {
  const trimmed = title.trim();
  const meta = getCodeLanguageMeta(nextLanguage);
  if (!trimmed) return meta.defaultTitle;

  const detected = detectCodeLanguageFromTitle(trimmed);
  if (detected !== null) {
    const dotIdx = trimmed.lastIndexOf('.');
    return `${trimmed.slice(0, dotIdx)}${meta.ext}`;
  }

  return trimmed;
}

export function countLinesAndChars(content: string): {
  readonly lines: number;
  readonly chars: number;
} {
  return {
    lines: content.length === 0 ? 0 : content.split(/\r?\n/).length,
    chars: content.length,
  };
}

/**
 * Extracts `#tags` from source files while filtering out C/C++ preprocessor
 * directives (`#include`, `#define`, etc.) so they do not pollute Vault tags.
 */
export function extractCodeTags(content: string): string[] {
  return extractTags(content).filter(
    (tag) => !C_PREPROCESSOR_KEYWORDS.has(tag),
  );
}
