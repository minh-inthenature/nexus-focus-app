import { describe, expect, it } from 'vitest';
import { analyzeCodeDiagnostics } from '@/features/notes/utils/codeDiagnostics';
import {
  countLinesAndChars,
  detectCodeLanguageFromTitle,
  extractCodeTags,
  swapCodeTitleExtension,
} from '@/features/notes/utils/codeNote';

describe('codeNote utilities', () => {
  it('detects supported code languages from note titles and extensions', () => {
    expect(detectCodeLanguageFromTitle('binary_search.cpp')).toBe('cpp');
    expect(detectCodeLanguageFromTitle('graph.hpp')).toBe('cpp');
    expect(detectCodeLanguageFromTitle('main.py')).toBe('python');
    expect(detectCodeLanguageFromTitle('kernel.c')).toBe('c');
    expect(detectCodeLanguageFromTitle('solver.ts')).toBe('typescript');
    expect(detectCodeLanguageFromTitle('helper.jsx')).toBe('javascript');
    expect(detectCodeLanguageFromTitle('architecture.md')).toBeNull();
    expect(detectCodeLanguageFromTitle('Plain Note Title')).toBeNull();
  });

  it('swaps filename extensions cleanly when switching code languages', () => {
    expect(swapCodeTitleExtension('binary_search.cpp', 'python')).toBe(
      'binary_search.py',
    );
    expect(swapCodeTitleExtension('Notes Without Ext', 'typescript')).toBe(
      'Notes Without Ext',
    );
  });

  it('computes line and character counts accurately', () => {
    expect(countLinesAndChars('')).toEqual({ lines: 0, chars: 0 });
    expect(countLinesAndChars('int x = 1;\nreturn x;')).toEqual({
      lines: 2,
      chars: 20,
    });
  });

  it('filters C/C++ preprocessor keywords out of code #tags while preserving real tags', () => {
    const cpp = `#include <iostream>\n#define MAX_N 100\n// #algorithms #dp-practice\nint main() { return 0; }`;
    expect(extractCodeTags(cpp)).toEqual(['algorithms', 'dp-practice']);
  });
});

describe('analyzeCodeDiagnostics', () => {
  it('returns no errors for valid C++ code', () => {
    const validCpp = `#include <iostream>
int main() {
  std::cout << "{ignore braces in string}" << std::endl;
  return 0;
}
`;
    expect(analyzeCodeDiagnostics(validCpp, 'cpp')).toEqual([]);
  });

  it('detects unmatched braces and mismatched brackets in C++', () => {
    const invalidCpp = `int main() {
  int a[3] = {1, 2, 3);
  return 0;
`;
    const diags = analyzeCodeDiagnostics(invalidCpp, 'cpp');
    expect(diags.length).toBeGreaterThanOrEqual(2);
    expect(diags.some((d) => d.message.includes('Mismatched delimiter'))).toBe(
      true,
    );
    expect(diags.some((d) => d.message.includes("Unclosed '{'"))).toBe(true);
  });

  it('detects unclosed string literals and missing #endif', () => {
    const brokenC = `#ifdef DEBUG
int main(void) {
  const char *s = "unclosed
  return 0;
}
`;
    const diags = analyzeCodeDiagnostics(brokenC, 'c');
    expect(
      diags.some((d) => d.message.includes('Unclosed string literal')),
    ).toBe(true);
    expect(diags.some((d) => d.message.includes('missing #endif'))).toBe(true);
  });

  it('detects missing colons on Python compound statements', () => {
    const brokenPy = `def solve(nums)
    if len(nums) > 0:
        return nums[0]
    return 0
`;
    const diags = analyzeCodeDiagnostics(brokenPy, 'python');
    expect(diags).toHaveLength(1);
    expect(diags[0]?.line).toBe(1);
    expect(diags[0]?.message).toContain("Expected ':'");
  });

  it('returns empty diagnostics for TS/JS so Monaco built-in worker owns validation', () => {
    expect(analyzeCodeDiagnostics('const x: number = "bad"; {', 'typescript')).toEqual(
      [],
    );
    expect(analyzeCodeDiagnostics('const x = (;', 'javascript')).toEqual([]);
  });
});
