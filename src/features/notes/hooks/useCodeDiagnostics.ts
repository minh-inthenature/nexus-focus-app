import { useEffect, useState } from 'react';
import type * as Monaco from 'monaco-editor';
import {
  analyzeCodeDiagnostics,
  type CodeDiagnostic,
} from '@/features/notes/utils/codeDiagnostics';
import type { CodeLanguage } from '@/services';

export type DiagnosticsStatus = 'idle' | 'checking' | 'ok' | 'issues';

export interface CodeDiagnosticsSummary {
  readonly diagnostics: readonly CodeDiagnostic[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly status: DiagnosticsStatus;
  readonly source: 'monaco' | 'local';
}

export interface UseCodeDiagnosticsOptions {
  readonly code: string;
  readonly language: CodeLanguage;
  readonly monaco: typeof Monaco | null;
  readonly model: Monaco.editor.ITextModel | null;
  readonly builtInDiagnostics: readonly CodeDiagnostic[];
  readonly debounceMs?: number;
}

const CUSTOM_MARKER_OWNER = 'nexus-code-diagnostics';

function toSummary(
  diagnostics: readonly CodeDiagnostic[],
  status: DiagnosticsStatus,
  source: 'monaco' | 'local',
): CodeDiagnosticsSummary {
  let errorCount = 0;
  let warningCount = 0;
  for (const diag of diagnostics) {
    if (diag.severity === 'error') errorCount += 1;
    else warningCount += 1;
  }

  return {
    diagnostics,
    errorCount,
    warningCount,
    status:
      status === 'checking'
        ? 'checking'
        : diagnostics.length > 0
          ? 'issues'
          : 'ok',
    source,
  };
}

/**
 * Non-blocking code diagnostics hook:
 * - Surfaces Monaco's native language worker diagnostics for TypeScript/JavaScript.
 * - Runs debounced client-side structural/syntax diagnostics for C++, C, and
 *   Python and pushes markers via `monaco.editor.setModelMarkers`.
 * - Optionally queries `VITE_CODE_DIAGNOSTICS_URL` if configured, degrading
 *   gracefully to offline local diagnostics with zero runtime errors.
 */
export function useCodeDiagnostics({
  code,
  language,
  monaco,
  model,
  builtInDiagnostics,
  debounceMs = 650,
}: UseCodeDiagnosticsOptions): CodeDiagnosticsSummary {
  const isBuiltInLanguage =
    language === 'typescript' || language === 'javascript';

  const [localDiagnostics, setLocalDiagnostics] = useState<CodeDiagnostic[]>(
    () => (isBuiltInLanguage ? [] : analyzeCodeDiagnostics(code, language)),
  );
  const [checking, setChecking] = useState(false);

  // Sync custom markers to Monaco whenever local diagnostics or language change
  useEffect(() => {
    if (!monaco || !model || model.isDisposed()) return;

    if (isBuiltInLanguage) {
      monaco.editor.setModelMarkers(model, CUSTOM_MARKER_OWNER, []);
      return;
    }

    const markers: Monaco.editor.IMarkerData[] = localDiagnostics.map((d) => ({
      severity:
        d.severity === 'error'
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
      message: d.message,
      startLineNumber: d.line,
      startColumn: d.column,
      endLineNumber: d.endLine,
      endColumn: d.endColumn,
      source: 'nexus-syntax',
    }));

    monaco.editor.setModelMarkers(model, CUSTOM_MARKER_OWNER, markers);
  }, [monaco, model, isBuiltInLanguage, localDiagnostics]);

  // Clean up custom markers when model swaps/unmounts
  useEffect(() => {
    return () => {
      if (monaco && model && !model.isDisposed()) {
        monaco.editor.setModelMarkers(model, CUSTOM_MARKER_OWNER, []);
      }
    };
  }, [monaco, model]);

  // Debounced analysis for C++ / C / Python (offline local + optional endpoint)
  useEffect(() => {
    if (isBuiltInLanguage) {
      setLocalDiagnostics([]);
      setChecking(false);
      return;
    }

    setChecking(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const localResults = analyzeCodeDiagnostics(code, language);
      const endpoint = import.meta.env.VITE_CODE_DIAGNOSTICS_URL as
        | string
        | undefined;

      if (!endpoint) {
        setLocalDiagnostics(localResults);
        setChecking(false);
        return;
      }

      void fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as {
            diagnostics?: CodeDiagnostic[];
          };
          if (!controller.signal.aborted) {
            setLocalDiagnostics(
              Array.isArray(data.diagnostics) ? data.diagnostics : localResults,
            );
            setChecking(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setLocalDiagnostics(localResults);
            setChecking(false);
          }
        });
    }, debounceMs);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [code, language, isBuiltInLanguage, debounceMs]);

  if (isBuiltInLanguage) {
    return toSummary(builtInDiagnostics, 'ok', 'monaco');
  }

  return toSummary(localDiagnostics, checking ? 'checking' : 'ok', 'local');
}
