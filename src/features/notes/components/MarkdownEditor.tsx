import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  HighlightStyle,
  syntaxHighlighting,
} from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import {
  Annotation,
  Compartment,
  EditorState,
  StateField,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
  keymap,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import {
  createInlineDiagramMarkdown,
  findExcalidrawBlocks,
  getCanvasElementCount,
} from '@/features/notes/utils/canvasNote';
import { renderExcalidrawSvg } from '@/features/notes/utils/excalidrawSvg';
import { useTheme } from '@/hooks/useTheme';
import { buildFolderPathMap, type FolderRecord, type NoteRecord } from '@/services';
import type { ResolvedTheme } from '@/types/theme';

export type FormatAction =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'ul'
  | 'ol'
  | 'checklist'
  | 'quote'
  | 'code'
  | 'codeblock'
  | 'link'
  | 'table'
  | 'math'
  | 'diagram';

export interface MarkdownEditorHandle {
  applyFormat: (action: FormatAction) => void;
  insertText: (text: string) => void;
  replaceRange: (from: number, to: number, text: string) => void;
  focus: () => void;
}

const programmaticSync = Annotation.define<boolean>();

export interface DiagramEditRequest {
  readonly from: number;
  readonly to: number;
  readonly rawJson: string;
}

export interface MarkdownEditorProps {
  noteId: string;
  value: string;
  notes: readonly NoteRecord[];
  folders: readonly FolderRecord[];
  onChange: (nextValue: string) => void;
  onTogglePreview: () => void;
  onEditDiagram?: (request: DiagramEditRequest) => void;
}

function buildEditorTheme(theme: ResolvedTheme) {
  const isDark = theme !== 'light';
  const isForest = theme === 'forest';
  const ink = isForest ? '#e4e8e6' : isDark ? '#eceae4' : '#1f1e1c';
  const tooltipBg = isForest ? '#0d1210' : isDark ? '#272623' : '#ffffff';
  const tooltipBorder = isForest
    ? '#1e2623'
    : isDark
      ? 'rgba(236, 234, 228, 0.08)'
      : 'rgba(31, 30, 28, 0.09)';

  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'transparent',
        color: ink,
        fontSize: '15px',
        height: '100%',
      },
      '.cm-scroller': {
        fontFamily: 'var(--font-sans)',
        lineHeight: '1.75',
        overflow: 'auto',
      },
      '.cm-content': {
        padding: '16px 0 64px 0',
        caretColor: isDark ? '#d97757' : '#c86445',
      },
      '.cm-line': {
        padding: '0 2px',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: isDark ? '#d97757' : '#c86445',
        borderLeftWidth: '1.5px',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        {
          backgroundColor: isDark
            ? 'rgba(217, 119, 87, 0.22)'
            : 'rgba(200, 100, 69, 0.16)',
        },
      '.cm-activeLine': {
        backgroundColor: isForest
          ? 'rgba(255, 255, 255, 0.025)'
          : isDark
            ? 'rgba(236, 234, 228, 0.03)'
            : 'rgba(31, 30, 28, 0.025)',
      },
      '.cm-placeholder': {
        color: isForest ? '#6e7d76' : isDark ? '#6b6860' : '#8a867e',
      },
      '.cm-tooltip': {
        backgroundColor: tooltipBg,
        border: `1px solid ${tooltipBorder}`,
        borderRadius: '10px',
        color: ink,
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: isForest ? '#18221e' : isDark ? '#383632' : '#e7e3d9',
        color: ink,
      },
      '.cm-tooltip-autocomplete .cm-completionDetail': {
        color: isForest ? '#7e8b85' : isDark ? '#9b978e' : '#6b6860',
        fontSize: '11px',
        marginLeft: '8px',
      },
      '.cm-nexus-wikilink': {
        color: isDark ? '#d97757' : '#c86445',
        textDecoration: 'underline',
        textDecorationColor: isDark
          ? 'rgba(217, 119, 87, 0.45)'
          : 'rgba(200, 100, 69, 0.45)',
        textUnderlineOffset: '3px',
      },
      '.cm-nexus-tag': {
        color: isForest ? '#8ab8a3' : isDark ? '#74c69d' : '#2d6a4f',
        backgroundColor: isForest
          ? 'rgba(138, 184, 163, 0.12)'
          : isDark
            ? 'rgba(36, 76, 58, 0.55)'
            : 'rgba(228, 242, 234, 0.9)',
        borderRadius: '4px',
        padding: '0 4px',
      },
    },
    { dark: isDark },
  );
}

function buildHighlightStyle(theme: ResolvedTheme) {
  const isDark = theme !== 'light';
  const isForest = theme === 'forest';
  const headingInk = isForest ? '#e4e8e6' : isDark ? '#eceae4' : '#1f1e1c';
  return HighlightStyle.define([
    {
      tag: tags.heading1,
      fontFamily: 'var(--font-serif)',
      fontSize: '1.5em',
      fontWeight: '500',
      letterSpacing: '-0.02em',
      color: headingInk,
    },
    {
      tag: tags.heading2,
      fontSize: '1.25em',
      fontWeight: '600',
      color: headingInk,
    },
    {
      tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6],
      fontSize: '1.08em',
      fontWeight: '600',
      color: headingInk,
    },
    { tag: tags.strong, fontWeight: '600' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through', opacity: '0.7' },
    {
      tag: tags.monospace,
      fontFamily: 'var(--font-mono)',
      fontSize: '0.9em',
      color: isForest ? '#8ab8a3' : isDark ? '#d6d2c8' : '#373734',
    },
    {
      tag: tags.link,
      color: isDark ? '#d97757' : '#c86445',
      textDecoration: 'underline',
    },
    { tag: tags.url, color: isForest ? '#7e8b85' : isDark ? '#9b978e' : '#6b6860' },
    {
      tag: tags.quote,
      color: isForest ? '#7e8b85' : isDark ? '#9b978e' : '#6b6860',
      fontStyle: 'italic',
    },
    { tag: tags.meta, color: isForest ? '#6e7d76' : isDark ? '#6b6860' : '#8a867e' },
    { tag: tags.keyword, color: isDark ? '#d97757' : '#c86445' },
    { tag: tags.string, color: isForest ? '#8ab8a3' : isDark ? '#74c69d' : '#2d6a4f' },
    { tag: tags.number, color: isDark ? '#e6a87c' : '#b45309' },
    { tag: tags.comment, color: isForest ? '#6e7d76' : isDark ? '#6b6860' : '#8a867e' },
  ]);
}

const wikiLinkDecorator = new MatchDecorator({
  regexp: /\[\[[^[\]\n]+\]\]/g,
  decoration: Decoration.mark({ class: 'cm-nexus-wikilink' }),
});

const tagDecorator = new MatchDecorator({
  regexp: /(?:^|[\s(])#[a-zA-Z][a-zA-Z0-9_/-]*/g,
  decoration: Decoration.mark({ class: 'cm-nexus-tag' }),
});

const wikiLinkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = wikiLinkDecorator.createDeco(view);
    }

    update(update: ViewUpdate) {
      this.decorations = wikiLinkDecorator.updateDeco(update, this.decorations);
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

const tagPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = tagDecorator.createDeco(view);
    }

    update(update: ViewUpdate) {
      this.decorations = tagDecorator.updateDeco(update, this.decorations);
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

class ExcalidrawBlockWidget extends WidgetType {
  constructor(
    readonly rawJson: string,
    readonly from: number,
    readonly to: number,
    readonly isDark: boolean,
    readonly onEdit: (request: DiagramEditRequest) => void,
  ) {
    super();
  }

  override eq(other: ExcalidrawBlockWidget): boolean {
    return (
      other.rawJson === this.rawJson &&
      other.from === this.from &&
      other.to === this.to &&
      other.isDark === this.isDark
    );
  }

  override ignoreEvent(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const elementCount = getCanvasElementCount(this.rawJson);

    const card = document.createElement('div');
    card.setAttribute('data-testid', 'inline-diagram-block');
    card.className =
      'my-3 overflow-hidden rounded-lg border border-border bg-card/70 [.dark_&]:bg-[#141414] select-none';

    const header = document.createElement('div');
    header.className =
      'flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5';

    const left = document.createElement('div');
    left.className = 'flex items-center gap-2 text-xs text-muted-foreground';

    const badge = document.createElement('span');
    badge.className = 'font-medium text-foreground';
    badge.textContent = 'Diagram';

    const countSpan = document.createElement('span');
    countSpan.className = 'font-mono text-[10px] text-muted-foreground';
    countSpan.textContent = `${elementCount} ${
      elementCount === 1 ? 'element' : 'elements'
    }`;

    left.append(badge, countSpan);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit Diagram';
    editBtn.className =
      'inline-flex items-center rounded border border-border bg-background/80 px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-accent cursor-pointer';
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onEdit({
        from: this.from,
        to: this.to,
        rawJson: this.rawJson,
      });
    });

    header.append(left, editBtn);

    const body = document.createElement('div');
    body.className =
      'flex min-h-[120px] items-center justify-center p-3';

    if (elementCount === 0) {
      const emptyBtn = document.createElement('button');
      emptyBtn.type = 'button';
      emptyBtn.className =
        'flex w-full items-center justify-center rounded-md border border-dashed border-border/80 py-8 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground cursor-pointer';
      emptyBtn.textContent =
        'Empty diagram — click Edit Diagram to draw blocks, arrows, or sketches';
      emptyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onEdit({
          from: this.from,
          to: this.to,
          rawJson: this.rawJson,
        });
      });
      body.appendChild(emptyBtn);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'py-8 text-xs text-muted-foreground';
      placeholder.textContent = 'Rendering diagram preview…';
      body.appendChild(placeholder);

      void renderExcalidrawSvg(this.rawJson, this.isDark)
        .then((svgMarkup) => {
          if (!body.isConnected) return;
          body.innerHTML = '';
          if (svgMarkup) {
            const svgWrap = document.createElement('div');
            svgWrap.className =
              'flex max-h-[340px] w-full items-center justify-center overflow-hidden';
            svgWrap.innerHTML = svgMarkup;
            body.appendChild(svgWrap);
          }
        })
        .catch(() => {
          if (!body.isConnected) return;
          body.innerHTML = '';
          const fallback = document.createElement('span');
          fallback.className = 'py-8 text-xs text-muted-foreground';
          fallback.textContent =
            'Unable to render diagram preview. Click Edit Diagram to inspect.';
          body.appendChild(fallback);
        });
    }

    card.append(header, body);
    return card;
  }
}

function createExcalidrawField(
  isDark: boolean,
  onEdit: (request: DiagramEditRequest) => void,
) {
  const buildDecorations = (docText: string): DecorationSet => {
    const blocks = findExcalidrawBlocks(docText);
    const ranges = blocks.map((block) =>
      Decoration.replace({
        widget: new ExcalidrawBlockWidget(
          block.rawJson,
          block.from,
          block.to,
          isDark,
          onEdit,
        ),
        block: true,
      }).range(block.from, block.to),
    );
    return Decoration.set(ranges, true);
  };

  return StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state.doc.toString());
    },
    update(deco, tr) {
      if (!tr.docChanged) return deco;
      return buildDecorations(tr.newDoc.toString());
    },
    provide(field) {
      return EditorView.decorations.from(field);
    },
  });
}

function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  placeholderText: string,
): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const inner = selected || placeholderText;
  const insert = `${before}${inner}${after}`;

  view.dispatch({
    changes: { from, to, insert },
    selection: {
      anchor: from + before.length,
      head: from + before.length + inner.length,
    },
  });
  view.focus();
  return true;
}

function prefixSelectedLines(view: EditorView, prefix: string): boolean {
  const { from, to } = view.state.selection.main;
  const startLine = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);
  const changes: Array<{ from: number; to: number; insert: string }> = [];

  for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum += 1) {
    const line = view.state.doc.line(lineNum);
    changes.push({ from: line.from, to: line.from, insert: prefix });
  }

  view.dispatch({ changes });
  view.focus();
  return true;
}

/**
 * CodeMirror 6 Markdown editor configured for Obsidian-style `[[` wiki-link
 * autocomplete, fenced language highlighting, and Nexus light/dark themes.
 */
export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor(
  { noteId, value, notes, folders, onChange, onTogglePreview, onEditDiagram },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef(new Compartment());
  const highlightCompartmentRef = useRef(new Compartment());
  const diagramCompartmentRef = useRef(new Compartment());

  const { resolvedTheme } = useTheme();
  const onChangeRef = useRef(onChange);
  const onTogglePreviewRef = useRef(onTogglePreview);
  const onEditDiagramRef = useRef(onEditDiagram);
  const notesRef = useRef(notes);
  const foldersRef = useRef(folders);
  const lastEmittedRef = useRef(value);
  const activeNoteIdRef = useRef(noteId);

  onChangeRef.current = onChange;
  onTogglePreviewRef.current = onTogglePreview;
  onEditDiagramRef.current = onEditDiagram;
  notesRef.current = notes;
  foldersRef.current = folders;

  const invokeEditDiagram = useRef((request: DiagramEditRequest) => {
    onEditDiagramRef.current?.(request);
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const wikiLinkCompletionSource = (
      context: CompletionContext,
    ): CompletionResult | null => {
      const match = context.matchBefore(/\[\[[^[\]\n]*$/);
      if (!match) return null;

      const typed = match.text.slice(2).trim().toLowerCase();
      const allNotes = notesRef.current;
      const folderPathMap = buildFolderPathMap(foldersRef.current);

      // Count title frequencies for duplicate title disambiguation
      const titleCounts = new Map<string, number>();
      for (const n of allNotes) {
        const key = n.title.trim().toLowerCase();
        titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
      }

      const afterCursor = context.state.sliceDoc(
        context.pos,
        context.pos + 2,
      );
      const closingSuffix = afterCursor === ']]' ? '' : ']]';

      const options: Completion[] = allNotes
        .filter((candidate) => candidate.id !== activeNoteIdRef.current)
        .filter((candidate) => {
          if (!typed) return true;
          const folderPath = candidate.folderId
            ? folderPathMap.get(candidate.folderId) ?? ''
            : '';
          const qualified = folderPath
            ? `${folderPath}/${candidate.title}`.toLowerCase()
            : candidate.title.toLowerCase();
          return (
            candidate.title.toLowerCase().includes(typed) ||
            qualified.includes(typed)
          );
        })
        .map((candidate) => {
          const folderPath = candidate.folderId
            ? folderPathMap.get(candidate.folderId) ?? ''
            : '';
          const isDuplicate =
            (titleCounts.get(candidate.title.trim().toLowerCase()) ?? 0) > 1;
          const targetInsert =
            isDuplicate && folderPath
              ? `${folderPath}/${candidate.title}`
              : candidate.title;

          return {
            label: candidate.title,
            detail: folderPath || 'Root',
            type: 'text',
            apply: (view, _completion, from, to) => {
              const insert = `[[${targetInsert}${closingSuffix}`;
              view.dispatch({
                changes: { from, to, insert },
                selection: { anchor: from + insert.length },
              });
            },
          };
        });

      return {
        from: match.from,
        options,
        filter: false,
      };
    };

    const startState = EditorState.create({
      doc: value,
      extensions: [
        history(),
        EditorView.lineWrapping,
        cmPlaceholder('Start writing in Markdown… Type [[ to link a note or #tag to organize.'),
        markdown({
          base: markdownLanguage,
          codeLanguages: languages,
        }),
        wikiLinkPlugin,
        tagPlugin,
        diagramCompartmentRef.current.of(
          createExcalidrawField(
            resolvedTheme !== 'light',
            invokeEditDiagram.current,
          ),
        ),
        autocompletion({
          override: [wikiLinkCompletionSource],
          activateOnTyping: true,
        }),
        themeCompartmentRef.current.of(buildEditorTheme(resolvedTheme)),
        highlightCompartmentRef.current.of(
          syntaxHighlighting(buildHighlightStyle(resolvedTheme)),
        ),
        keymap.of([
          {
            key: 'Mod-b',
            run: (view) => wrapSelection(view, '**', '**', 'bold text'),
          },
          {
            key: 'Mod-i',
            run: (view) => wrapSelection(view, '*', '*', 'italic text'),
          },
          {
            key: 'Mod-e',
            run: () => {
              onTogglePreviewRef.current();
              return true;
            },
          },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (
            update.docChanged &&
            !update.transactions.some((tr) => tr.annotation(programmaticSync))
          ) {
            const nextDoc = update.state.doc.toString();
            lastEmittedRef.current = nextDoc;
            onChangeRef.current(nextDoc);
          }
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: host,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount once; updates are dispatched via dedicated effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconfigure CodeMirror theme dynamically on dark/light switch
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        themeCompartmentRef.current.reconfigure(buildEditorTheme(resolvedTheme)),
        highlightCompartmentRef.current.reconfigure(
          syntaxHighlighting(buildHighlightStyle(resolvedTheme)),
        ),
        diagramCompartmentRef.current.reconfigure(
          createExcalidrawField(
            resolvedTheme !== 'light',
            invokeEditDiagram.current,
          ),
        ),
      ],
    });
  }, [resolvedTheme]);

  // Synchronize external note switching or programmatic document updates
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const noteChanged = activeNoteIdRef.current !== noteId;
    activeNoteIdRef.current = noteId;

    const currentDoc = view.state.doc.toString();
    if (noteChanged || (value !== lastEmittedRef.current && value !== currentDoc)) {
      lastEmittedRef.current = value;
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
        annotations: programmaticSync.of(true),
        ...(noteChanged ? { selection: { anchor: 0 } } : {}),
      });
    }
  }, [noteId, value]);

  useImperativeHandle(
    ref,
    () => ({
      applyFormat: (action) => {
        const view = viewRef.current;
        if (!view) return;

        switch (action) {
          case 'heading':
            prefixSelectedLines(view, '## ');
            break;
          case 'bold':
            wrapSelection(view, '**', '**', 'bold text');
            break;
          case 'italic':
            wrapSelection(view, '*', '*', 'italic text');
            break;
          case 'ul':
            prefixSelectedLines(view, '- ');
            break;
          case 'ol':
            prefixSelectedLines(view, '1. ');
            break;
          case 'checklist':
            prefixSelectedLines(view, '- [ ] ');
            break;
          case 'quote':
            prefixSelectedLines(view, '> ');
            break;
          case 'code':
            wrapSelection(view, '`', '`', 'code');
            break;
          case 'codeblock':
            wrapSelection(view, '```ts\n', '\n```', '// code');
            break;
          case 'link':
            wrapSelection(view, '[', '](https://)', 'link text');
            break;
          case 'table': {
            const { from, to } = view.state.selection.main;
            const tableSnippet =
              '| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |\n';
            view.dispatch({
              changes: { from, to, insert: tableSnippet },
              selection: { anchor: from + tableSnippet.length },
            });
            view.focus();
            break;
          }
          case 'math':
            wrapSelection(view, '$$\n', '\n$$', 'E = mc^2');
            break;
          case 'diagram': {
            const { from, to } = view.state.selection.main;
            const prefix = from > 0 && view.state.sliceDoc(from - 1, from) !== '\n' ? '\n\n' : from > 0 ? '\n' : '';
            const snippet = `${prefix}${createInlineDiagramMarkdown()}\n`;
            view.dispatch({
              changes: { from, to, insert: snippet },
              selection: { anchor: from + snippet.length },
            });
            view.focus();
            break;
          }
        }
      },
      insertText: (text) => {
        const view = viewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
        view.focus();
      },
      replaceRange: (from, to, text) => {
        const view = viewRef.current;
        if (!view) return;
        const docLen = view.state.doc.length;
        const safeFrom = Math.max(0, Math.min(from, docLen));
        const safeTo = Math.max(safeFrom, Math.min(to, docLen));
        view.dispatch({
          changes: { from: safeFrom, to: safeTo, insert: text },
        });
      },
      focus: () => {
        viewRef.current?.focus();
      },
    }),
    [],
  );

  return (
    <div
      ref={hostRef}
      aria-label="Markdown editor"
      className="min-h-[420px] w-full flex-1"
    />
  );
});
