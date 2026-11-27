import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bold,
  Check,
  CheckSquare,
  Code,
  Eye,
  Heading2,
  Italic,
  List,
  Pencil,
  Sigma,
  Star,
} from 'lucide-react';
import { MarkdownPreview } from '@/features/notes/components/MarkdownPreview';
import { useNotesStore } from '@/features/notes/stores/useNotesStore';
import { isCanvasNote } from '@/features/notes/utils/canvasNote';
import type { NoteRecord } from '@/services';
import { cn } from '@/utils/cn';

export interface MobileNoteEditorProps {
  note: NoteRecord;
  onBack: () => void;
  onSelectNote: (noteId: string) => void;
  onFilterByTag: (tagName: string) => void;
}

/**
 * Full-screen distraction-free mobile Markdown reader and editor with safe-area
 * top header and a compact formatting bar anchored cleanly above the soft keyboard.
 */
export function MobileNoteEditor({
  note,
  onBack,
  onSelectNote,
  onFilterByTag,
}: MobileNoteEditorProps) {
  const saveNoteContent = useNotesStore((s) => s.saveNoteContent);
  const renameNote = useNotesStore((s) => s.renameNote);
  const toggleFavorite = useNotesStore((s) => s.toggleFavorite);
  const saveStatus = useNotesStore((s) => s.saveStatus);
  const setSaveStatus = useNotesStore((s) => s.setSaveStatus);
  const resolveWikiLinkTargets = useNotesStore((s) => s.resolveWikiLinkTargets);

  const [titleDraft, setTitleDraft] = useState(note.title);
  const [contentDraft, setContentDraft] = useState(note.content);
  const [mode, setMode] = useState<'edit' | 'preview'>(
    isCanvasNote(note) ? 'preview' : 'edit',
  );
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedContentRef = useRef(note.content);
  const latestContentRef = useRef(note.content);
  const noteIdRef = useRef(note.id);

  // Keep local draft synced when opening a different note
  useEffect(() => {
    noteIdRef.current = note.id;
    setTitleDraft(note.title);
    setContentDraft(note.content);
    lastSavedContentRef.current = note.content;
    latestContentRef.current = note.content;
    setMode(isCanvasNote(note) ? 'preview' : 'edit');
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track visualViewport height so keyboard open/close never clips the toolbar
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return undefined;
    const vv = window.visualViewport;
    const syncHeight = () => {
      setViewportHeight(vv.height);
    };
    syncHeight();
    vv.addEventListener('resize', syncHeight);
    return () => {
      vv.removeEventListener('resize', syncHeight);
    };
  }, []);

  const flushContentSave = useCallback(async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const targetId = noteIdRef.current;
    const pending = latestContentRef.current;
    if (pending === lastSavedContentRef.current) return;
    lastSavedContentRef.current = pending;
    await saveNoteContent(targetId, pending);
  }, [saveNoteContent]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const handleContentChange = (next: string) => {
    setContentDraft(next);
    latestContentRef.current = next;
    setSaveStatus('unsaved');
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      void flushContentSave();
    }, 600);
  };

  const handleTitleBlur = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== note.title) {
      void renameNote(note.id, trimmed);
    } else if (!trimmed) {
      setTitleDraft(note.title);
    }
  };

  const handleBack = async () => {
    handleTitleBlur();
    await flushContentSave();
    onBack();
  };

  const insertSnippet = (before: string, after = '', placeholder = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? contentDraft.length;
    const end = el.selectionEnd ?? contentDraft.length;
    const selected = contentDraft.slice(start, end) || placeholder;
    const next =
      contentDraft.slice(0, start) +
      before +
      selected +
      after +
      contentDraft.slice(end);
    handleContentChange(next);
    window.requestAnimationFrame(() => {
      el.focus();
      const cursorPos = start + before.length + selected.length;
      el.setSelectionRange(
        start + before.length,
        selected === placeholder ? cursorPos : cursorPos + after.length,
      );
    });
  };

  const canvasOnly = isCanvasNote(note);

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-[#111614] text-[#E4E8E6]"
      style={viewportHeight ? { height: `${viewportHeight}px` } : undefined}
    >
      {/* Top Safe-Area Toolbar */}
      <header className="shrink-0 bg-[#0A0E0C] border-b border-[#1E2623] pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 px-2 h-12">
          <button
            type="button"
            onClick={() => void handleBack()}
            aria-label="Back to notes"
            className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium text-[#8AB8A3] active:bg-[#18221E]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>

          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleTitleBlur}
            aria-label="Note title"
            placeholder="Untitled note"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#E4E8E6] outline-none placeholder:text-[#6E7D76]"
          />

          <span className="text-[11px] text-[#7E8B85] px-1 shrink-0">
            {saveStatus === 'saving' ? (
              'Saving…'
            ) : saveStatus === 'unsaved' ? (
              'Edited'
            ) : (
              <span className="inline-flex items-center gap-0.5 text-[#8AB8A3]">
                <Check className="h-3 w-3" />
              </span>
            )}
          </span>

          <button
            type="button"
            onClick={() => void toggleFavorite(note.id)}
            aria-label={note.isFavorite ? 'Unstar note' : 'Star note'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#7E8B85] active:bg-[#18221E]"
          >
            <Star
              className={cn(
                'h-4 w-4',
                note.isFavorite && 'fill-[#e5a93c] text-[#e5a93c]',
              )}
            />
          </button>

          {!canvasOnly && (
            <button
              type="button"
              onClick={() => {
                if (mode === 'edit') {
                  void flushContentSave();
                  setMode('preview');
                } else {
                  setMode('edit');
                }
              }}
              aria-label={mode === 'edit' ? 'Preview note' : 'Edit note'}
              className="flex items-center gap-1 rounded-lg border border-[#1E2623] bg-[#161D1A] px-2.5 py-1.5 text-xs font-medium text-[#E4E8E6] active:bg-[#1E2823]"
            >
              {mode === 'edit' ? (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  <span>Preview</span>
                </>
              ) : (
                <>
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {canvasOnly ? (
          <div className="rounded-xl border border-[#1E2623] bg-[#0D1210] p-4 text-xs text-[#7E8B85]">
            Canvas drawings can be viewed and edited on tablet/desktop screens.
          </div>
        ) : mode === 'preview' ? (
          <div className="prose-sm max-w-none text-[#E4E8E6]">
            <MarkdownPreview
              content={contentDraft}
              resolveWikiLink={resolveWikiLinkTargets}
              onOpenWikiLink={(target) => {
                const res = resolveWikiLinkTargets(target);
                const next = res.exactMatch ?? res.ambiguousMatches[0];
                if (next) {
                  void flushContentSave().then(() => onSelectNote(next.id));
                }
              }}
              onClickTag={(tagName) => {
                void flushContentSave().then(() => {
                  onFilterByTag(tagName);
                  onBack();
                });
              }}
            />
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={contentDraft}
            onChange={(e) => handleContentChange(e.target.value)}
            onBlur={() => void flushContentSave()}
            placeholder="Start writing…"
            aria-label="Note content"
            className="h-full min-h-[240px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-[#E4E8E6] placeholder:text-[#6E7D76] outline-none"
          />
        )}
      </div>

      {/* Compact Keyboard-Friendly Formatting Bar */}
      {!canvasOnly && mode === 'edit' && (
        <div className="shrink-0 border-t border-[#1E2623] bg-[#0A0E0C] px-2 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSnippet('\n## ', '', 'Heading')}
              aria-label="Insert heading"
              className="flex h-9 min-w-[40px] items-center justify-center rounded-lg px-2 text-xs font-medium text-[#A3B0AA] active:bg-[#18221E]"
            >
              <Heading2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSnippet('**', '**', 'bold')}
              aria-label="Insert bold"
              className="flex h-9 min-w-[40px] items-center justify-center rounded-lg px-2 text-xs font-medium text-[#A3B0AA] active:bg-[#18221E]"
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSnippet('*', '*', 'italic')}
              aria-label="Insert italic"
              className="flex h-9 min-w-[40px] items-center justify-center rounded-lg px-2 text-xs font-medium text-[#A3B0AA] active:bg-[#18221E]"
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSnippet('\n- ', '', 'item')}
              aria-label="Insert list"
              className="flex h-9 min-w-[40px] items-center justify-center rounded-lg px-2 text-xs font-medium text-[#A3B0AA] active:bg-[#18221E]"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSnippet('\n- [ ] ', '', 'task')}
              aria-label="Insert checklist"
              className="flex h-9 min-w-[40px] items-center justify-center rounded-lg px-2 text-xs font-medium text-[#A3B0AA] active:bg-[#18221E]"
            >
              <CheckSquare className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSnippet('`', '`', 'code')}
              aria-label="Insert code"
              className="flex h-9 min-w-[40px] items-center justify-center rounded-lg px-2 text-xs font-medium text-[#A3B0AA] active:bg-[#18221E]"
            >
              <Code className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSnippet('$', '$', 'x^2')}
              aria-label="Insert math"
              className="flex h-9 min-w-[40px] items-center justify-center rounded-lg px-2 text-xs font-medium text-[#A3B0AA] active:bg-[#18221E]"
            >
              <Sigma className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
