import { describe, expect, it } from 'vitest';
import {
  computeCanvasChangeSignature,
  createEmptyCanvasScene,
  createInlineDiagramMarkdown,
  findExcalidrawBlocks,
  getCanvasElementCount,
  isCanvasFileName,
  parseCanvasScene,
  replaceExcalidrawBlockAt,
  serializeCanvasScene,
} from '@/features/notes/utils/canvasNote';

describe('canvasNote utilities', () => {
  it('detects .canvas, .draw, and .excalidraw filenames cleanly', () => {
    expect(isCanvasFileName('system_design.canvas')).toBe(true);
    expect(isCanvasFileName('flowchart.draw')).toBe(true);
    expect(isCanvasFileName('sketch.excalidraw')).toBe(true);
    expect(isCanvasFileName('notes.md')).toBe(false);
    expect(isCanvasFileName('main.cpp')).toBe(false);
  });

  it('parses scenes safely and strips non-serializable collaborators fields', () => {
    const raw = JSON.stringify({
      type: 'excalidraw',
      version: 2,
      elements: [
        { id: 'el-1', type: 'rectangle', version: 1, versionNonce: 11 },
        { id: 'el-2', type: 'arrow', isDeleted: true },
      ],
      appState: {
        viewBackgroundColor: '#141414',
        collaborators: {},
        selectedElementIds: { 'el-1': true },
      },
      files: {},
    });

    const parsed = parseCanvasScene(raw);
    expect(parsed.elements).toHaveLength(2);
    expect(parsed.appState.viewBackgroundColor).toBe('#141414');
    expect('collaborators' in parsed.appState).toBe(false);
    expect('selectedElementIds' in parsed.appState).toBe(false);
    expect(getCanvasElementCount(parsed)).toBe(1);
  });

  it('falls back to a dark #141414 empty scene on malformed JSON', () => {
    const empty = parseCanvasScene('{bad json');
    expect(empty.elements).toEqual([]);
    expect(empty.appState.viewBackgroundColor).toBe('#141414');
  });

  it('serializes only non-deleted elements and computes change signatures', () => {
    const scene = createEmptyCanvasScene('#141414');
    const serialized = serializeCanvasScene({
      elements: [
        { id: 'r1', version: 2, versionNonce: 99 },
        { id: 'r2', isDeleted: true, version: 3, versionNonce: 10 },
      ],
      appState: { ...scene.appState, collaborators: {} },
      files: {},
    });
    const reparsed = parseCanvasScene(serialized);
    expect(reparsed.elements).toHaveLength(1);
    expect(getCanvasElementCount(serialized)).toBe(1);

    const sig1 = computeCanvasChangeSignature(
      [{ id: 'r1', version: 2, versionNonce: 99 }],
      { viewBackgroundColor: '#141414' },
    );
    const sig2 = computeCanvasChangeSignature(
      [{ id: 'r1', version: 3, versionNonce: 100 }],
      { viewBackgroundColor: '#141414' },
    );
    expect(sig1).not.toBe(sig2);
  });

  it('finds and replaces inline excalidraw diagram blocks cleanly', () => {
    const blockA = createInlineDiagramMarkdown();
    const blockB = createInlineDiagramMarkdown({
      ...createEmptyCanvasScene(),
      elements: [{ id: 'circle-1', type: 'ellipse', version: 1, versionNonce: 5 }],
    });

    const doc = `# Architecture\n\n${blockA}\n\nNotes here.\n\n${blockB}\n`;
    const found = findExcalidrawBlocks(doc);
    expect(found).toHaveLength(2);
    expect(getCanvasElementCount(found[0]?.rawJson ?? '')).toBe(0);
    expect(getCanvasElementCount(found[1]?.rawJson ?? '')).toBe(1);

    const updatedJson = serializeCanvasScene({
      elements: [{ id: 'rect-1', type: 'rectangle', version: 1, versionNonce: 7 }],
      appState: { viewBackgroundColor: '#141414' },
      files: {},
    });
    const nextDoc = replaceExcalidrawBlockAt(doc, 0, updatedJson);
    const foundAfter = findExcalidrawBlocks(nextDoc);
    expect(foundAfter).toHaveLength(2);
    expect(getCanvasElementCount(foundAfter[0]?.rawJson ?? '')).toBe(1);
    expect(getCanvasElementCount(foundAfter[1]?.rawJson ?? '')).toBe(1);
  });
});
