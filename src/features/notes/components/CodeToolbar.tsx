import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Loader2,
} from 'lucide-react';
import type { CodeDiagnosticsSummary } from '@/features/notes/hooks/useCodeDiagnostics';
import { CODE_LANGUAGES } from '@/features/notes/utils/codeNote';
import type { CodeLanguage } from '@/services';
import { cn } from '@/utils/cn';

export interface CodeToolbarProps {
  language: CodeLanguage;
  code: string;
  diagnostics: CodeDiagnosticsSummary;
  onChangeLanguage: (language: CodeLanguage) => void;
  onJumpToLocation: (line: number, column: number) => void;
}

/**
 * Minimal utility bar shown when editing a Code Note:
 * language selector, one-click Copy Code action, and live Syntax Check status
 * with an expandable diagnostics list to jump directly to flagged lines.
 */
export function CodeToolbar({
  language,
  code,
  diagnostics,
  onChangeLanguage,
  onJumpToLocation,
}: CodeToolbarProps) {
  const [copied, setCopied] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!issuesOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIssuesOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [issuesOpen]);

  useEffect(() => {
    if (diagnostics.diagnostics.length === 0) {
      setIssuesOpen(false);
    }
  }, [diagnostics.diagnostics.length]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable in restricted context
    }
  };

  const totalIssues = diagnostics.diagnostics.length;
  const hasErrors = diagnostics.errorCount > 0;
  const hasWarnings = !hasErrors && diagnostics.warningCount > 0;

  let statusLabel = 'No issues';
  if (diagnostics.status === 'checking') {
    statusLabel = 'Checking…';
  } else if (diagnostics.errorCount > 0) {
    statusLabel = `${diagnostics.errorCount} ${
      diagnostics.errorCount === 1 ? 'error' : 'errors'
    }`;
  } else if (diagnostics.warningCount > 0) {
    statusLabel = `${diagnostics.warningCount} ${
      diagnostics.warningCount === 1 ? 'warning' : 'warnings'
    }`;
  }

  return (
    <div
      role="toolbar"
      aria-label="Code file utilities"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-4 py-1.5"
    >
      {/* Left: Language Switcher */}
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Language</span>
          <select
            aria-label="Code language"
            value={language}
            onChange={(e) => onChangeLanguage(e.target.value as CodeLanguage)}
            className="h-7 rounded border border-border bg-card px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            {CODE_LANGUAGES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} ({item.ext})
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Right: Syntax Check Indicator + Copy Code */}
      <div className="flex items-center gap-2">
        <div ref={popoverRef} className="relative">
          <button
            type="button"
            onClick={() => {
              if (totalIssues > 0) setIssuesOpen((prev) => !prev);
            }}
            aria-label={`Syntax check: ${statusLabel}`}
            aria-expanded={issuesOpen}
            disabled={totalIssues === 0}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors',
              hasErrors
                ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15 cursor-pointer'
                : hasWarnings
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/15 cursor-pointer'
                  : 'border-border bg-card/60 text-muted-foreground cursor-default',
            )}
          >
            {diagnostics.status === 'checking' ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : hasErrors ? (
              <AlertCircle className="h-3 w-3" aria-hidden="true" />
            ) : hasWarnings ? (
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            ) : (
              <CheckCircle2
                className="h-3 w-3 text-emerald-500"
                aria-hidden="true"
              />
            )}
            <span>{statusLabel}</span>
          </button>

          {issuesOpen && totalIssues > 0 ? (
            <div
              role="region"
              aria-label="Syntax diagnostics"
              className="absolute right-0 top-8 z-40 w-72 rounded-md border border-border bg-popover p-1.5 shadow-lg"
            >
              <div className="border-b border-border px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Syntax Diagnostics ({totalIssues})
              </div>
              <div className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
                {diagnostics.diagnostics.map((diag, idx) => (
                  <button
                    key={`${diag.line}:${diag.column}:${idx}`}
                    type="button"
                    onClick={() => {
                      onJumpToLocation(diag.line, diag.column);
                      setIssuesOpen(false);
                    }}
                    className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent cursor-pointer"
                  >
                    {diag.severity === 'error' ? (
                      <AlertCircle
                        className="mt-0.5 h-3 w-3 shrink-0 text-destructive"
                        aria-hidden="true"
                      />
                    ) : (
                      <AlertTriangle
                        className="mt-0.5 h-3 w-3 shrink-0 text-amber-500"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[10px] text-muted-foreground">
                        Ln {diag.line}, Col {diag.column}
                      </div>
                      <div className="text-xs leading-snug text-foreground">
                        {diag.message}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label={copied ? 'Copied code' : 'Copy code'}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              <span>Copy Code</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
