import React from 'react';
import ReactDOM from 'react-dom/client';
// Self-hosted fonts (bundled into dist) — no Google Fonts CDN. The packaged
// app's CSP (font-src 'self') blocks remote fonts, and bundling makes first
// paint independent of the network. Keep weights in sync with tokens.css.
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/400-italic.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import '@fontsource/instrument-sans/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/400-italic.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import App from './App';
import AuthGate from './AuthGate';
import './index.css';
import ErrorBoundary from './shell/ErrorBoundary';
import { initZoom } from './workbench/zoom';

// Restore the persisted window zoom before first paint (applies to the
// sign-in screen too, so the level never visibly jumps after boot).
initZoom();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Forze IDE: missing #root element in index.html');
}

// Surface unhandled errors/rejections in the console rather than dying silently
// in the Tauri webview (helps diagnose the "keeps crashing" class of bugs).
window.addEventListener('error', (e) => {
  console.error('[forze] window error:', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[forze] unhandled rejection:', e.reason);
});

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary scope="Forze IDE">
      <AuthGate>
        <App />
      </AuthGate>
    </ErrorBoundary>
  </React.StrictMode>,
);
