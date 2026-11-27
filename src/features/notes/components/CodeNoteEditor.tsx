import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';
import {
  useCodeDiagnostics,
  type CodeDiagnosticsSummary,
} from '@/features/notes/hooks/useCodeDiagnostics';
import type { CodeDiagnostic } from '@/features/notes/utils/codeDiagnostics';
import { getCodeLanguageMeta } from '@/features/notes/utils/codeNote';
import { useTheme } from '@/hooks/useTheme';
import type { CodeLanguage } from '@/services';

export interface CodeNoteEditorHandle {
  jumpToLocation: (line: number, column: number) => void;
}

export interface CodeNoteEditorProps {
  noteId: string;
  value: string;
  language: CodeLanguage;
  onChange: (value: string) => void;
  onDiagnosticsChange: (summary: CodeDiagnosticsSummary) => void;
}

let monacoInitialized = false;

function ensureMonacoSetup(): void {
  if (monacoInitialized) return;
  monacoInitialized = true;

  if (typeof self !== 'undefined') {
    const workerHost = self as unknown as {
      MonacoEnvironment?: {
        getWorker: (moduleId: string, label: string) => Worker;
      };
    };
    workerHost.MonacoEnvironment = {
      getWorker(_moduleId: string, label: string) {
        if (label === 'typescript' || label === 'javascript') {
          return new tsWorker();
        }
        return new editorWorker();
      },
    };
  }

  loader.config({ monaco });

  monaco.editor.defineTheme('vault-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b6860', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'd97757' },
      { token: 'keyword.control', foreground: 'd97757' },
      { token: 'string', foreground: 'a6e3a1' },
      { token: 'number', foreground: 'e5c07b' },
      { token: 'type', foreground: '89b4fa' },
      { token: 'type.identifier', foreground: '89b4fa' },
      { token: 'identifier.function', foreground: '7dd3fc' },
      { token: 'delimiter', foreground: '9b978e' },
    ],
    colors: {
      'editor.background': '#141414',
      'editorGutter.background': '#141414',
      'editor.foreground': '#eceae4',
      'editor.lineHighlightBackground': '#191919',
      'editor.lineHighlightBorder': '#191919',
      'editor.selectionBackground': '#2e2b27',
      'editor.inactiveSelectionBackground': '#24221f',
      'editorLineNumber.foreground': '#5a5650',
      'editorLineNumber.activeForeground': '#eceae4',
      'editorCursor.foreground': '#d97757',
      'editorIndentGuide.background1': '#22211e',
      'editorIndentGuide.activeBackground1': '#383632',
      'editorWidget.background': '#191919',
      'editorWidget.border': '#2a2926',
      'editorHoverWidget.background': '#191919',
      'editorHoverWidget.border': '#2a2926',
      'scrollbarSlider.background': '#2e2b2766',
      'scrollbarSlider.hoverBackground': '#4a464099',
      focusBorder: '#00000000',
    },
  });

  monaco.editor.defineTheme('vault-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#faf9f5',
      'editorGutter.background': '#faf9f5',
      'editor.lineHighlightBackground': '#efece4',
      'editor.lineHighlightBorder': '#efece4',
      'editor.selectionBackground': '#e7e3d9',
      focusBorder: '#00000000',
    },
  });

  monaco.editor.defineTheme('vault-forest', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '749283', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'd97757' },
      { token: 'string', foreground: 'a6e3a1' },
      { token: 'number', foreground: 'e5c07b' },
      { token: 'type', foreground: '89b4fa' },
    ],
    colors: {
      'editor.background': '#163226',
      'editorGutter.background': '#163226',
      'editor.foreground': '#f3f1ec',
      'editor.lineHighlightBackground': '#1c3d2f',
      'editor.lineHighlightBorder': '#1c3d2f',
      'editor.selectionBackground': '#244c3a',
      'editorLineNumber.foreground': '#749283',
      'editorLineNumber.activeForeground': '#f3f1ec',
      'editorCursor.foreground': '#d97757',
      focusBorder: '#00000000',
    },
  });

  monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  monaco.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    strict: true,
    noEmit: true,
    jsx: monaco.typescript.JsxEmit.ReactJSX,
  });
  monaco.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    allowNonTsExtensions: true,
    allowJs: true,
    checkJs: false,
    noEmit: true,
  });
}

ensureMonacoSetup();

const CUSTOM_MARKER_OWNER = 'nexus-code-diagnostics';

/**
 * Lazy-loaded Monaco code editor for Code Notes with bundled workers, custom
 * Vault themes (`vault-dark`), native TS/JS validation, and offline diagnostics.
 */
export const CodeNoteEditor = forwardRef<
  CodeNoteEditorHandle,
  CodeNoteEditorProps
>(function CodeNoteEditor(
  { noteId, value, language, onChange, onDiagnosticsChange },
  ref,
) {
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [model, setModel] = useState<monaco.editor.ITextModel | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  const [editorHeight, setEditorHeight] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 300 : 460,
  );
  const [builtInDiagnostics, setBuiltInDiagnostics] = useState<
    CodeDiagnostic[]
  >([]);

  useEffect(() => {
    const updateViewport = () => {
      const narrow = window.innerWidth < 768;
      setIsMobileViewport(narrow);
      const editor = editorRef.current;
      if (editor) {
        const minH = narrow ? 260 : 460;
        const maxH = narrow
          ? Math.max(260, Math.round(window.innerHeight * 0.65))
          : 820;
        const contentH = editor.getContentHeight();
        setEditorHeight(Math.max(minH, Math.min(maxH, contentH + 28)));
      }
    };
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const langMeta = useMemo(() => getCodeLanguageMeta(language), [language]);
  const modelPath = `nexus://notes/${noteId}${langMeta.ext}`;

  const themeName =
    resolvedTheme === 'light'
      ? 'vault-light'
      : resolvedTheme === 'forest'
        ? 'vault-forest'
        : 'vault-dark';

  const summary = useCodeDiagnostics({
    code: value,
    language,
    monaco,
    model,
    builtInDiagnostics,
  });

  useEffect(() => {
    onDiagnosticsChange(summary);
  }, [summary, onDiagnosticsChange]);

  useEffect(() => {
    // Clear stale native markers when switching language
    setBuiltInDiagnostics([]);
  }, [language, noteId]);

  useImperativeHandle(
    ref,
    () => ({
      jumpToLocation: (line: number, column: number) => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column });
        editor.focus();
      },
    }),
    [],
  );

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    setModel(editor.getModel());

    const updateHeight = () => {
      const narrow = typeof window !== 'undefined' && window.innerWidth < 768;
      const minH = narrow ? 260 : 460;
      const maxH = narrow
        ? Math.max(260, Math.round(window.innerHeight * 0.65))
        : 820;
      const contentH = editor.getContentHeight();
      setEditorHeight(Math.max(minH, Math.min(maxH, contentH + 28)));
    };
    updateHeight();

    const sizeDisp = editor.onDidContentSizeChange(() => updateHeight());
    const modelDisp = editor.onDidChangeModel(() => {
      setModel(editor.getModel());
    });

    editor.onDidDispose(() => {
      sizeDisp.dispose();
      modelDisp.dispose();
      editorRef.current = null;
    });
  }, []);

  const handleValidate = useCallback(
    (markers: monaco.editor.IMarker[]) => {
      if (language !== 'typescript' && language !== 'javascript') {
        return;
      }

      const relevant = markers
        .filter(
          (m) =>
            m.owner !== CUSTOM_MARKER_OWNER &&
            (m.severity === monaco.MarkerSeverity.Error ||
              m.severity === monaco.MarkerSeverity.Warning),
        )
        .map<CodeDiagnostic>((m) => ({
          line: m.startLineNumber,
          column: m.startColumn,
          endLine: m.endLineNumber,
          endColumn: m.endColumn,
          message: m.message,
          severity:
            m.severity === monaco.MarkerSeverity.Error ? 'error' : 'warning',
        }));

      setBuiltInDiagnostics(relevant);
    },
    [language],
  );

  return (
    <div
      data-testid="code-note-editor"
      className="w-full min-w-0 max-w-full overflow-hidden"
    >
      <Editor
        height={`${editorHeight}px`}
        path={modelPath}
        language={langMeta.monacoId}
        theme={themeName}
        value={value}
        onChange={(next) => onChange(next ?? '')}
        onMount={handleMount}
        onValidate={handleValidate}
        loading={
          <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground md:h-[460px]">
            Loading code editor…
          </div>
        }
        options={{
          fontSize: isMobileViewport ? 13 : 13.5,
          lineHeight: isMobileViewport ? 20 : 22,
          fontFamily:
            '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontLigatures: true,
          wordWrap: isMobileViewport ? 'on' : 'off',
          glyphMargin: !isMobileViewport,
          folding: !isMobileViewport,
          lineNumbersMinChars: isMobileViewport ? 3 : 5,
          minimap: { enabled: false },
          scrollBeyondLastLine: isMobileViewport,
          padding: { top: 16, bottom: isMobileViewport ? 36 : 16 },
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          renderLineHighlight: 'line',
          tabSize: language === 'python' ? 4 : 2,
          insertSpaces: true,
          automaticLayout: true,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
            alwaysConsumeMouseWheel: false,
          },
        }}
      />
    </div>
  );
});
