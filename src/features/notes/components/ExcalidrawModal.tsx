import { useCallback, useMemo, useRef, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { Check, Shapes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getCanvasElementCount,
  normalizeCanvasBgForTheme,
  parseCanvasScene,
  serializeCanvasScene,
} from '@/features/notes/utils/canvasNote';
import { useTheme } from '@/hooks/useTheme';

export interface ExcalidrawModalProps {
  open: boolean;
  initialRawJson: string;
  onSave: (nextRawJson: string) => void;
  onClose: () => void;
}

/**
 * Expanded Excalidraw modal/drawer for editing inline Markdown diagram blocks.
 * Saves serialized scene data cleanly back into the Markdown document on Done/close.
 */
export function ExcalidrawModal({
  open,
  initialRawJson,
  onSave,
  onClose,
}: ExcalidrawModalProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  const latestJsonRef = useRef<string>(
    serializeCanvasScene(parseCanvasScene(initialRawJson)),
  );
  const [elementCount, setElementCount] = useState<number>(() =>
    getCanvasElementCount(initialRawJson),
  );

  const initialData = useMemo(() => {
    const parsed = parseCanvasScene(initialRawJson);
    latestJsonRef.current = serializeCanvasScene(parsed);
    return {
      elements: parsed.elements as never,
      appState: {
        ...parsed.appState,
        viewBackgroundColor: normalizeCanvasBgForTheme(
          parsed.appState.viewBackgroundColor,
          isDark,
        ),
        theme: isDark ? ('dark' as const) : ('light' as const),
      },
      files: parsed.files as never,
    };
  }, [initialRawJson, isDark]);

  const handleSceneChange = useCallback(
    (
      elements: readonly Record<string, unknown>[],
      appState: Record<string, unknown>,
      files: Record<string, unknown>,
    ) => {
      const normalizedBg =
        appState.viewBackgroundColor === 'transparent' ||
        !appState.viewBackgroundColor
          ? '#141414'
          : appState.viewBackgroundColor;

      latestJsonRef.current = serializeCanvasScene({
        elements,
        appState: {
          ...appState,
          viewBackgroundColor: normalizedBg,
        },
        files,
      });

      const nextCount = elements.filter((el) => !el.isDeleted).length;
      setElementCount(nextCount);
    },
    [],
  );

  const commitAndClose = () => {
    onSave(latestJsonRef.current);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          commitAndClose();
        }
      }}
    >
      <DialogContent
        aria-label="Edit diagram"
        className="flex h-[84vh] w-[92vw] max-w-[1160px] flex-col gap-0 overflow-hidden border-border bg-background p-0 [.dark_&]:bg-[#141414]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-card/80 px-4 py-2.5 pr-12">
          <div className="flex items-center gap-2">
            <Shapes className="h-4 w-4 text-primary" aria-hidden="true" />
            <DialogTitle className="font-serif text-sm font-medium tracking-[-0.01em] text-foreground">
              Edit Diagram
            </DialogTitle>
            <span className="rounded border border-border bg-background/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {elementCount} {elementCount === 1 ? 'element' : 'elements'}
            </span>
          </div>
          <DialogDescription className="sr-only">
            Draw blocks, arrows, circles, and sketches in Excalidraw and save
            inline inside your Markdown note.
          </DialogDescription>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={commitAndClose}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Done</span>
          </Button>
        </div>

        <div className="nexus-excalidraw min-h-0 flex-1 overflow-hidden">
          <Excalidraw
            theme={isDark ? 'dark' : 'light'}
            initialData={initialData as never}
            onChange={handleSceneChange as never}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                export: false,
                saveAsImage: true,
                clearCanvas: true,
                changeViewBackgroundColor: true,
                toggleTheme: false,
              },
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
