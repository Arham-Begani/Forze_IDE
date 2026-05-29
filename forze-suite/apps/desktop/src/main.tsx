import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import ErrorBoundary from './shell/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Forze IDE: missing #root element in index.html');
}

// Surface unhandled errors/rejections in the console rather than dying silently
// in the Tauri webview (helps diagnose the "keeps crashing" class of bugs).
window.addEventListener('error', (e) => {
  // eslint-disable-next-line no-console
  console.error('[forze] window error:', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  // eslint-disable-next-line no-console
  console.error('[forze] unhandled rejection:', e.reason);
});

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary scope="Forze IDE">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
