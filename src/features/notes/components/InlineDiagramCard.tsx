import { useEffect, useRef, useState } from 'react';
import { Pencil, Shapes } from 'lucide-react';
import { getCanvasElementCount } from '@/features/notes/utils/canvasNote';
import { renderExcalidrawSvg } from '@/features/notes/utils/excalidrawSvg';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/utils/cn';

export interface InlineDiagramCardProps {
  rawJson: string;
  onEdit: () => void;
  className?: string;
}

/**
 * Dark-themed inline SVG preview card rendered for ```excalidraw blocks inside
 * Markdown notes, with a direct "Edit Diagram" button opening the modal canvas.
 */
export function InlineDiagramCard({
  rawJson,
  onEdit,
  className,
}: InlineDiagramCardProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const svgContainerRef = useRef<HTMLDivElement | null>(null);
  const elementCount = getCanvasElementCount(rawJson);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void renderExcalidrawSvg(rawJson, isDark)
      .then((markup) => {
        if (active) {
          setSvgMarkup(markup);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setSvgMarkup(null);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [rawJson, isDark]);

  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;
    if (svgMarkup) {
      container.innerHTML = svgMarkup;
    } else {
      container.innerHTML = '';
    }
  }, [svgMarkup]);

  return (
    <div
      data-testid="inline-diagram-block"
      className={cn(
        'my-3 overflow-hidden rounded-lg border border-border bg-card/70 [.dark_&]:bg-[#141414]',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Shapes className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span className="font-medium text-foreground">Diagram</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {elementCount} {elementCount === 1 ? 'element' : 'elements'}
          </span>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded border border-border bg-background/80 px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-accent cursor-pointer"
        >
          <Pencil className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          <span>Edit Diagram</span>
        </button>
      </div>

      <div className="flex min-h-[120px] items-center justify-center p-3">
        {elementCount === 0 ? (
          <button
            type="button"
            onClick={onEdit}
            className="flex w-full items-center justify-center rounded-md border border-dashed border-border/80 py-8 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground cursor-pointer"
          >
            Empty diagram — click Edit Diagram to draw blocks, arrows, or sketches
          </button>
        ) : loading ? (
          <span className="py-8 text-xs text-muted-foreground">
            Rendering diagram preview…
          </span>
        ) : svgMarkup ? (
          <div
            ref={svgContainerRef}
            className="flex max-h-[340px] w-full items-center justify-center overflow-hidden"
          />
        ) : (
          <span className="py-8 text-xs text-muted-foreground">
            Unable to render diagram preview. Click Edit Diagram to inspect.
          </span>
        )}
      </div>
    </div>
  );
}
