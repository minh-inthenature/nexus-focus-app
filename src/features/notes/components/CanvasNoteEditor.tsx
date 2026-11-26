import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import {
  computeCanvasChangeSignature,
  normalizeCanvasBgForTheme,
  parseCanvasScene,
  serializeCanvasScene,
} from '@/features/notes/utils/canvasNote';
import { useTheme } from '@/hooks/useTheme';

export interface CanvasNoteEditorProps {
  noteId: string;
  value: string;
  onChange: (serializedJson: string) => void;
}

/**
 * Full-area Excalidraw editor for dedicated `canvas` notes.
 * Matches Nexus's dark surface (`#141414`), hides noisy chrome, and avoids
 * spurious autosaves on mount or viewport pan/zoom.
 */
export function CanvasNoteEditor({
  noteId,
  value,
  onChange,
}: CanvasNoteEditorProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const initialScene = useMemo(() => parseCanvasScene(value), [value]);
  const lastSigRef = useRef<string>(
    computeCanvasChangeSignature(
      initialScene.elements,
      { viewBackgroundColor: '#141414' },
      initialScene.files,
    ),
  );

  // Reset signature tracker when switching notes
  useEffect(() => {
    const scene = parseCanvasScene(value);
    lastSigRef.current = computeCanvasChangeSignature(
      scene.elements,
      { viewBackgroundColor: scene.appState.viewBackgroundColor ?? '#141414' },
      scene.files,
    );
    // Only reset on note switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const initialData = useMemo(() => {
    const parsed = parseCanvasScene(value);
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
    // Initial scene data should only seed when noteId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

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

      const sig = computeCanvasChangeSignature(
        elements,
        { viewBackgroundColor: normalizedBg },
        files,
      );
      if (sig === lastSigRef.current) return;
      lastSigRef.current = sig;

      const serialized = serializeCanvasScene({
        elements,
        appState: {
          ...appState,
          viewBackgroundColor: normalizedBg,
        },
        files,
      });
      onChangeRef.current(serialized);
    },
    [],
  );

  return (
    <div
      data-testid="canvas-note-editor"
      className="nexus-excalidraw relative h-full min-h-[540px] w-full flex-1 overflow-hidden bg-background [.dark_&]:bg-[#141414]"
    >
      <Excalidraw
        key={noteId}
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
  );
}
