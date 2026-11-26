import { useEffect, useRef, useState } from 'react';
import { Code2, FilePlus2, FileText, Shapes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  createEmptyCanvasScene,
  serializeCanvasScene,
} from '@/features/notes/utils/canvasNote';
import {
  CODE_LANGUAGES,
  getCodeLanguageMeta,
} from '@/features/notes/utils/codeNote';
import type { CodeLanguage, CreateNoteInput } from '@/services';
import { cn } from '@/utils/cn';

export interface NewNoteMenuProps {
  folderId?: string | null;
  onCreateNote: (input: CreateNoteInput) => void | Promise<unknown>;
  variant?: 'icon' | 'button';
  align?: 'left' | 'right';
  label?: string;
  buttonClassName?: string;
}

/**
 * Compact popover chooser for creating either a standard Markdown note or a
 * dedicated Code File in the chosen language (C++, Python, C, TypeScript, JS).
 */
export function NewNoteMenu({
  folderId = null,
  onCreateNote,
  variant = 'icon',
  align = 'left',
  label = 'New note',
  buttonClassName,
}: NewNoteMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleCreateMarkdown = () => {
    setOpen(false);
    void onCreateNote({ folderId, type: 'markdown' });
  };

  const handleCreateCanvas = () => {
    setOpen(false);
    void onCreateNote({
      folderId,
      type: 'canvas',
      title: 'untitled.canvas',
      content: serializeCanvasScene(createEmptyCanvasScene()),
    });
  };

  const handleCreateCode = (language: CodeLanguage) => {
    setOpen(false);
    const meta = getCodeLanguageMeta(language);
    void onCreateNote({
      folderId,
      type: 'code',
      language,
      title: meta.defaultTitle,
      content: meta.starterCode,
    });
  };

  return (
    <div ref={containerRef} className="relative inline-flex">
      {variant === 'button' ? (
        <Button
          variant="default"
          size="sm"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-haspopup="menu"
          className={buttonClassName}
        >
          <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{label}</span>
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          title={label}
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="menu"
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer',
            open && 'bg-accent text-accent-foreground',
            buttonClassName,
          )}
        >
          <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}

      {open ? (
        <div
          role="menu"
          aria-label="Create note type"
          className={cn(
            'absolute top-full z-50 mt-1.5 w-56 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleCreateMarkdown}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent cursor-pointer"
          >
            <FileText
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div>Markdown Note</div>
              <div className="text-[10px] font-normal text-muted-foreground">
                Rich text, #tags, wiki-links
              </div>
            </div>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={handleCreateCanvas}
            className="mt-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent cursor-pointer"
          >
            <Shapes
              className="h-3.5 w-3.5 shrink-0 text-primary/85"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div>New Canvas</div>
              <div className="text-[10px] font-normal text-muted-foreground">
                Diagrams, flowcharts &amp; sketches
              </div>
            </div>
          </button>

          <div className="my-1.5 border-t border-border" />

          <div className="flex items-center gap-1.5 px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Code2 className="h-3 w-3" aria-hidden="true" />
            <span>Code File</span>
          </div>

          <div className="space-y-0.5">
            {CODE_LANGUAGES.map((lang) => (
              <button
                key={lang.id}
                type="button"
                role="menuitem"
                onClick={() => handleCreateCode(lang.id)}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent cursor-pointer"
              >
                <span className="font-medium">{lang.label}</span>
                <span className="rounded border border-border bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {lang.ext}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
