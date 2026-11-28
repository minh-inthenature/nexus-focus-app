import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, IndentIncrease, List, SquareCheck } from 'lucide-react';
import {
  applyPlainTextTab,
  countTextMetrics,
  togglePlainTextLinePrefix,
  type TextEditResult,
} from '@/features/notes/utils/textNote';

interface TextNoteEditorProps {
  noteId: string;
  value: string;
  onChange: (nextValue: string) => void;
}

/**
 * Single-mode distraction-free plain text editor.
 * Preserves literal characters, multiple blank lines (`whitespace-pre-wrap`),
 * and Tab indentation without Markdown parsing or Edit/Preview switching.
 */
export function TextNoteEditor({
  noteId,
  value,
  onChange,
}: TextNoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const [copied, setCopied] = useState(false);

  const metrics = useMemo(() => countTextMetrics(value), [value]);

  useEffect(() => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    setCopied(false);
  }, [noteId]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 480)}px`;
  }, [value, noteId]);

  const applyEditResult = (result: TextEditResult) => {
    onChange(result.value);
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const result = applyPlainTextTab(
      value,
      el.selectionStart ?? 0,
      el.selectionEnd ?? 0,
      e.shiftKey,
    );
    applyEditResult(result);
  };

  const handlePrefixAction = (prefix: string) => {
    const el = textareaRef.current;
    const selStart = el?.selectionStart ?? value.length;
    const selEnd = el?.selectionEnd ?? value.length;
    const result = togglePlainTextLinePrefix(value, selStart, selEnd, prefix);
    applyEditResult(result);
  };

  const handleIndentAction = () => {
    const el = textareaRef.current;
    const selStart = el?.selectionStart ?? value.length;
    const selEnd = el?.selectionEnd ?? value.length;
    const result = applyPlainTextTab(value, selStart, selEnd, false);
    applyEditResult(result);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        copyTimerRef.current = null;
        setCopied(false);
      }, 1800);
    } catch {
      // Clipboard API may be unavailable in restricted contexts.
    }
  };

  return (
    <div className="flex flex-col" data-testid="text-note-editor-container">
      {/* Minimal non-Markdown helper bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handlePrefixAction('• ')}
            title="Toggle bullet (•)"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground"
          >
            <List className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Bullet</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handlePrefixAction('☐ ')}
            title="Toggle checklist box (☐)"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground"
          >
            <SquareCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Checklist</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleIndentAction}
            title="Indent (Tab)"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground"
          >
            <IndentIncrease className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Indent</span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">
            {metrics.lines} {metrics.lines === 1 ? 'line' : 'lines'} ·{' '}
            {metrics.words} {metrics.words === 1 ? 'word' : 'words'}
          </span>
          <button
            type="button"
            onClick={() => void handleCopy()}
            title="Copy all plain text"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Unified plain-text writing canvas */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            textareaRef.current?.focus();
          }
        }}
        className="cursor-text pb-8"
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck
          autoCapitalize="sentences"
          aria-label="Plain text note editor"
          data-testid="text-note-editor"
          placeholder="Write naturally — plain text, exact line breaks, no Markdown syntax..."
          className="min-h-[480px] w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent font-sans text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
        />
      </div>
    </div>
  );
}
