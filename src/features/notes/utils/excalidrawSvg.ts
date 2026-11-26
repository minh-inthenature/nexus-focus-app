import {
  normalizeCanvasBgForTheme,
  parseCanvasScene,
} from '@/features/notes/utils/canvasNote';

const MAX_SVG_CACHE = 80;
const svgCache = new Map<string, string>();

/**
 * Lazily renders an Excalidraw scene JSON string into responsive inline SVG
 * markup matched to Nexus's active light/dark theme, caching rendered output
 * so repeated Markdown edits do not re-render unchanged diagram blocks.
 */
export async function renderExcalidrawSvg(
  rawJson: string,
  isDark: boolean,
): Promise<string | null> {
  const scene = parseCanvasScene(rawJson);
  const activeElements = scene.elements.filter((el) => !el.isDeleted);
  if (activeElements.length === 0) {
    return null;
  }

  const cacheKey = `${isDark ? 'dark' : 'light'}::${rawJson.trim()}`;
  const cached = svgCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const { exportToSvg } = await import('@excalidraw/excalidraw');
  const viewBackgroundColor = normalizeCanvasBgForTheme(
    scene.appState.viewBackgroundColor,
    isDark,
  );

  const svgElement = await exportToSvg({
    elements: activeElements as never,
    appState: {
      exportBackground: viewBackgroundColor !== 'transparent',
      exportWithDarkMode: isDark,
      exportPadding: 16,
      viewBackgroundColor:
        viewBackgroundColor === 'transparent' ? '#ffffff' : viewBackgroundColor,
    },
    files: (scene.files ?? {}) as never,
    exportPadding: 16,
    skipInliningFonts: true,
  });

  svgElement.removeAttribute('width');
  svgElement.removeAttribute('height');
  svgElement.style.maxWidth = '100%';
  svgElement.style.maxHeight = '340px';
  svgElement.style.width = '100%';
  svgElement.style.height = 'auto';
  svgElement.style.display = 'block';
  if (viewBackgroundColor === 'transparent') {
    svgElement.style.backgroundColor = 'transparent';
  }

  const markup = svgElement.outerHTML;
  if (svgCache.size >= MAX_SVG_CACHE) {
    const firstKey = svgCache.keys().next().value;
    if (firstKey !== undefined) {
      svgCache.delete(firstKey);
    }
  }
  svgCache.set(cacheKey, markup);
  return markup;
}
