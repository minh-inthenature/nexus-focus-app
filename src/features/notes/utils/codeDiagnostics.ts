import type { CodeLanguage } from '@/services/storage/db';

export interface CodeDiagnostic {
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

interface DelimiterToken {
  readonly char: '(' | '{' | '[';
  readonly line: number;
  readonly column: number;
}

const MATCHING_CLOSE: Record<'(' | '{' | '[', ')' | '}' | ']'> = {
  '(': ')',
  '{': '}',
  '[': ']',
};

const MATCHING_OPEN: Record<')' | '}' | ']', '(' | '{' | '['> = {
  ')': '(',
  '}': '{',
  ']': '[',
};

const DELIMITER_LABEL: Record<string, string> = {
  '(': "'('",
  ')': "')'",
  '{': "'{'",
  '}': "'}'",
  '[': "'['",
  ']': "']'",
};

const PYTHON_HEADER_RE =
  /^(?:async\s+def\s+|def\s+|class\s+|if\b|elif\b|else\s*$|for\s+|async\s+for\s+|while\b|try\s*$|except\b|finally\s*$|with\s+|async\s+with\s+|match\s+|case\s+)/;

function checkPythonColonOnLine(
  lineText: string,
  lineNumber: number,
  diagnostics: CodeDiagnostic[],
): void {
  // Strip inline comment outside string literals cleanly
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let effectiveEnd = lineText.length;

  for (let i = 0; i < lineText.length; i += 1) {
    const ch = lineText[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if ((inSingle || inDouble) && ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && ch === "'") {
      inSingle = !inSingle;
    } else if (!inSingle && ch === '"') {
      inDouble = !inDouble;
    } else if (!inSingle && !inDouble && ch === '#') {
      effectiveEnd = i;
      break;
    }
  }

  const trimmed = lineText.slice(0, effectiveEnd).trim();
  if (!trimmed || !PYTHON_HEADER_RE.test(trimmed)) return;
  // Ignore trailing line continuation backslash (multi-line header)
  if (trimmed.endsWith('\\')) return;
  if (!trimmed.endsWith(':')) {
    const col = Math.max(1, effectiveEnd);
    diagnostics.push({
      line: lineNumber,
      column: col,
      endLine: lineNumber,
      endColumn: col + 1,
      message: "Expected ':' at end of Python compound statement.",
      severity: 'error',
    });
  }
}

/**
 * Lightweight, offline client-side syntax checker for C++, C, and Python.
 * TypeScript and JavaScript are handled natively by Monaco's TS worker and
 * intentionally return an empty list here to avoid duplicate markers.
 */
export function analyzeCodeDiagnostics(
  code: string,
  language: CodeLanguage,
): CodeDiagnostic[] {
  if (language === 'typescript' || language === 'javascript') {
    return [];
  }

  const diagnostics: CodeDiagnostic[] = [];
  const delimiterStack: DelimiterToken[] = [];
  const preprocessorStack: Array<{ line: number; directive: string }> = [];

  const isCLike = language === 'cpp' || language === 'c';
  const isPython = language === 'python';

  let line = 1;
  let column = 1;
  let i = 0;

  let state:
    | 'normal'
    | 'line-comment'
    | 'block-comment'
    | 'single-string'
    | 'double-string'
    | 'python-triple-single'
    | 'python-triple-double' = 'normal';
  let stateStartLine = 1;
  let stateStartCol = 1;
  let escaped = false;
  let isLineStart = true;

  const length = code.length;

  while (i < length) {
    const ch = code[i]!;
    const next = i + 1 < length ? (code[i + 1] ?? '') : '';
    const next2 = i + 2 < length ? (code[i + 2] ?? '') : '';

    if (ch === '\r') {
      i += 1;
      continue;
    }

    if (ch === '\n') {
      if (state === 'line-comment') {
        state = 'normal';
      } else if (state === 'single-string' || state === 'double-string') {
        if (!escaped) {
          diagnostics.push({
            line: stateStartLine,
            column: stateStartCol,
            endLine: line,
            endColumn: Math.max(stateStartCol + 1, column),
            message: `Unclosed string literal (${state === 'single-string' ? "'" : '"'}).`,
            severity: 'error',
          });
          state = 'normal';
        }
      }
      escaped = false;
      line += 1;
      column = 1;
      isLineStart = true;
      i += 1;
      continue;
    }

    if (state === 'line-comment') {
      column += 1;
      i += 1;
      continue;
    }

    if (state === 'block-comment') {
      if (ch === '*' && next === '/') {
        state = 'normal';
        i += 2;
        column += 2;
        continue;
      }
      column += 1;
      i += 1;
      continue;
    }

    if (state === 'python-triple-single') {
      if (escaped) {
        escaped = false;
        i += 1;
        column += 1;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        i += 1;
        column += 1;
        continue;
      }
      if (ch === "'" && next === "'" && next2 === "'") {
        state = 'normal';
        i += 3;
        column += 3;
        continue;
      }
      i += 1;
      column += 1;
      continue;
    }

    if (state === 'python-triple-double') {
      if (escaped) {
        escaped = false;
        i += 1;
        column += 1;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        i += 1;
        column += 1;
        continue;
      }
      if (ch === '"' && next === '"' && next2 === '"') {
        state = 'normal';
        i += 3;
        column += 3;
        continue;
      }
      i += 1;
      column += 1;
      continue;
    }

    if (state === 'single-string' || state === 'double-string') {
      if (escaped) {
        escaped = false;
        i += 1;
        column += 1;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        i += 1;
        column += 1;
        continue;
      }
      const quote = state === 'single-string' ? "'" : '"';
      if (ch === quote) {
        state = 'normal';
      }
      i += 1;
      column += 1;
      continue;
    }

    // Normal state
    if (isCLike && isLineStart && ch === '#') {
      const lineEndIdx = code.indexOf('\n', i);
      const rawLine =
        lineEndIdx === -1 ? code.slice(i) : code.slice(i, lineEndIdx);
      const directiveMatch = /^#\s*(ifdef|ifndef|if|endif)\b/.exec(rawLine);
      if (directiveMatch && directiveMatch[1]) {
        const dir = directiveMatch[1];
        if (dir === 'endif') {
          if (preprocessorStack.length === 0) {
            diagnostics.push({
              line,
              column,
              endLine: line,
              endColumn: column + directiveMatch[0].length,
              message: 'Unmatched #endif preprocessor directive.',
              severity: 'error',
            });
          } else {
            preprocessorStack.pop();
          }
        } else {
          preprocessorStack.push({ line, directive: `#${dir}` });
        }
      }
      isLineStart = false;
    } else if (isLineStart && ch !== ' ' && ch !== '\t') {
      isLineStart = false;
    }

    if (isCLike && ch === '/' && next === '/') {
      state = 'line-comment';
      i += 2;
      column += 2;
      continue;
    }

    if (isCLike && ch === '/' && next === '*') {
      state = 'block-comment';
      stateStartLine = line;
      stateStartCol = column;
      i += 2;
      column += 2;
      continue;
    }

    if (isPython && ch === '#') {
      state = 'line-comment';
      i += 1;
      column += 1;
      continue;
    }

    if (isPython && ch === "'" && next === "'" && next2 === "'") {
      state = 'python-triple-single';
      stateStartLine = line;
      stateStartCol = column;
      escaped = false;
      i += 3;
      column += 3;
      continue;
    }

    if (isPython && ch === '"' && next === '"' && next2 === '"') {
      state = 'python-triple-double';
      stateStartLine = line;
      stateStartCol = column;
      escaped = false;
      i += 3;
      column += 3;
      continue;
    }

    if (ch === "'" || ch === '"') {
      // Allow C++14 digit separators like 1'000'000 in C++
      const prevChar = i > 0 ? code[i - 1]! : '';
      if (language === 'cpp' && ch === "'" && /[0-9a-fA-FxX]/.test(prevChar) && /[0-9a-fA-F]/.test(next)) {
        i += 1;
        column += 1;
        continue;
      }
      state = ch === "'" ? 'single-string' : 'double-string';
      stateStartLine = line;
      stateStartCol = column;
      escaped = false;
      i += 1;
      column += 1;
      continue;
    }

    if (ch === '(' || ch === '{' || ch === '[') {
      delimiterStack.push({ char: ch, line, column });
      i += 1;
      column += 1;
      continue;
    }

    if (ch === ')' || ch === '}' || ch === ']') {
      const expectedOpen = MATCHING_OPEN[ch];
      const top = delimiterStack[delimiterStack.length - 1];
      if (!top) {
        diagnostics.push({
          line,
          column,
          endLine: line,
          endColumn: column + 1,
          message: `Unexpected closing ${DELIMITER_LABEL[ch]} with no matching ${DELIMITER_LABEL[expectedOpen]}.`,
          severity: 'error',
        });
      } else if (top.char !== expectedOpen) {
        const expectedClose = MATCHING_CLOSE[top.char];
        diagnostics.push({
          line,
          column,
          endLine: line,
          endColumn: column + 1,
          message: `Mismatched delimiter: expected ${DELIMITER_LABEL[expectedClose]} (opened at line ${top.line}), found ${DELIMITER_LABEL[ch]}.`,
          severity: 'error',
        });
        delimiterStack.pop();
      } else {
        delimiterStack.pop();
      }
      i += 1;
      column += 1;
      continue;
    }

    i += 1;
    column += 1;
  }

  // Handle EOF unclosed constructs
  if (state === 'block-comment') {
    diagnostics.push({
      line: stateStartLine,
      column: stateStartCol,
      endLine: stateStartLine,
      endColumn: stateStartCol + 2,
      message: 'Unclosed block comment (/* ... */).',
      severity: 'error',
    });
  } else if (
    state === 'single-string' ||
    state === 'double-string' ||
    state === 'python-triple-single' ||
    state === 'python-triple-double'
  ) {
    diagnostics.push({
      line: stateStartLine,
      column: stateStartCol,
      endLine: stateStartLine,
      endColumn: stateStartCol + 1,
      message: 'Unclosed string literal before end of file.',
      severity: 'error',
    });
  }

  for (const unclosed of delimiterStack) {
    const expectedClose = MATCHING_CLOSE[unclosed.char];
    diagnostics.push({
      line: unclosed.line,
      column: unclosed.column,
      endLine: unclosed.line,
      endColumn: unclosed.column + 1,
      message: `Unclosed ${DELIMITER_LABEL[unclosed.char]}; missing ${DELIMITER_LABEL[expectedClose]}.`,
      severity: 'error',
    });
  }

  for (const unclosedDir of preprocessorStack) {
    diagnostics.push({
      line: unclosedDir.line,
      column: 1,
      endLine: unclosedDir.line,
      endColumn: unclosedDir.directive.length + 1,
      message: `Unclosed ${unclosedDir.directive} directive; missing #endif.`,
      severity: 'error',
    });
  }

  // Python line-by-line colon check (when no unclosed delimiters distort blocks)
  if (isPython && delimiterStack.length === 0) {
    const lines = code.split(/\r?\n/);
    let inMultiLineBlock = false;
    let parenDepth = 0;

    for (let idx = 0; idx < lines.length; idx += 1) {
      const lineText = lines[idx]!;
      const trimmed = lineText.trim();

      if (trimmed.includes('"""') || trimmed.includes("'''")) {
        const tripleCount =
          (trimmed.match(/"""/g)?.length ?? 0) +
          (trimmed.match(/'''/g)?.length ?? 0);
        if (tripleCount % 2 === 1) {
          inMultiLineBlock = !inMultiLineBlock;
        }
        continue;
      }
      if (inMultiLineBlock) continue;

      if (parenDepth === 0) {
        checkPythonColonOnLine(lineText, idx + 1, diagnostics);
      }

      // Rough paren balance tracking across multi-line calls/headers
      let sq = false;
      let dq = false;
      let esc = false;
      for (let j = 0; j < lineText.length; j += 1) {
        const c = lineText[j]!;
        if (esc) {
          esc = false;
          continue;
        }
        if ((sq || dq) && c === '\\') {
          esc = true;
          continue;
        }
        if (!dq && c === "'") sq = !sq;
        else if (!sq && c === '"') dq = !dq;
        else if (!sq && !dq) {
          if (c === '#') break;
          if (c === '(' || c === '[' || c === '{') parenDepth += 1;
          else if (c === ')' || c === ']' || c === '}') {
            parenDepth = Math.max(0, parenDepth - 1);
          }
        }
      }
    }
  }

  return diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
}
