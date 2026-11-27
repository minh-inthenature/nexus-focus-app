import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import '@/styles/index.css';
import 'katex/dist/katex.min.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root mount element #root was not found in index.html.');
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal: app functions cleanly without SW registration
    });
  });
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
