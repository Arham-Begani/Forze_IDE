import { ArrowRight, ExternalLink, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { openExternal } from '../../lib/openLink';
import { DEFAULT_PREVIEW_URL, usePreview } from '../../workbench/previewStore';

/** Common dev-server ports, one click away. */
const QUICK_PORTS = ['3000', '5173', '8080', '4321'] as const;

/**
 * Coerce whatever the user typed into a loadable URL:
 *   "3000"               → http://localhost:3000   (bare port)
 *   "localhost:8080"     → http://localhost:8080   (bare host)
 *   "http://…"/"https://" → left as-is
 */
function normalizeUrl(input: string): string {
  const t = input.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (/^\d+$/.test(t)) return `http://localhost:${t}`;
  return `http://${t}`;
}

/**
 * Live Preview — an embedded browser pane pointed at the local dev server, so
 * the running app is visible inside the IDE instead of in a separate window.
 *
 * Rendered as a keep-alive workspace page (EditorArea hides it with display:none
 * rather than unmounting), so the iframe stays loaded across tab switches and
 * the dev server's HMR keeps pushing updates into it live. Framing localhost is
 * permitted by the `frame-src` allowance in the app CSP (tauri.conf.json).
 */
export default function PreviewPage(): JSX.Element {
  const url = usePreview((s) => s.url);
  const setUrl = usePreview((s) => s.setUrl);

  const [draft, setDraft] = useState(url);
  // Bumped on every reload/navigate. Used only as part of the iframe's React
  // key (never the src), so reloading the same URL forces a clean remount
  // without appending cache-busting junk to the address the dev server sees.
  const [nonce, setNonce] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Keep the address bar in sync when the URL is set from outside — e.g. a
  // localhost link clicked in the terminal routes here via openLink(). The
  // iframe itself already follows `url` through its key, so this just mirrors
  // the new address into the editable field.
  useEffect(() => {
    setDraft(url);
  }, [url]);

  const commit = useCallback(
    (raw: string) => {
      const next = normalizeUrl(raw);
      if (!next) return;
      setDraft(next);
      setUrl(next);
      setNonce((n) => n + 1);
    },
    [setUrl],
  );

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Hand the current address to the OS default browser (shared helper; uses the
  // shell plugin in the Tauri shell, window.open as a fallback).
  const openInBrowser = useCallback(() => {
    void openExternal(url);
  }, [url]);

  return (
    <div className="preview">
      <div className="preview__bar">
        <button
          type="button"
          className="preview__btn"
          onClick={reload}
          title="Reload"
          aria-label="Reload preview"
        >
          <RotateCw size={15} strokeWidth={1.7} />
        </button>

        <form
          className="preview__addr"
          onSubmit={(e) => {
            e.preventDefault();
            commit(draft);
            iframeRef.current?.focus();
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={DEFAULT_PREVIEW_URL}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Preview address"
          />
          <button type="submit" title="Go" aria-label="Go">
            <ArrowRight size={15} strokeWidth={1.8} />
          </button>
        </form>

        <div className="preview__ports" role="group" aria-label="Common ports">
          {QUICK_PORTS.map((p) => (
            <button
              key={p}
              type="button"
              className="preview__chip"
              onClick={() => commit(p)}
              title={`http://localhost:${p}`}
            >
              {p}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="preview__btn"
          onClick={openInBrowser}
          title="Open in browser"
          aria-label="Open in external browser"
        >
          <ExternalLink size={15} strokeWidth={1.7} />
        </button>
      </div>

      <div className="preview__frame">
        <iframe
          key={`${url}#${nonce}`}
          ref={iframeRef}
          src={url}
          title="Localhost preview"
          // Let the dev app run fully (scripts, storage, its own HMR socket).
          // No sandbox: it's the user's own trusted local server.
          allow="clipboard-read; clipboard-write; fullscreen"
        />
        <p className="preview__hint">
          Nothing here? Start your dev server and make sure the port matches.
        </p>
      </div>
    </div>
  );
}
