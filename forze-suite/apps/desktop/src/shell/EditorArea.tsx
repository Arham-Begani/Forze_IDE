import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EditorCanvas, { type EditorHandle } from '../views/EditorCanvas';
import WelcomeScreen from '../views/WelcomeScreen';
import ErrorBoundary from './ErrorBoundary';
import PanelFallback from './PanelFallback';
import { ensureFileLoaded } from '../workbench/actions';
import { fileHead } from '../lib/git';
import { publishActiveBuffer } from '../workbench/mcpBridge';
import { PANELS } from '../workbench/panels';
import { useProject } from '../workbench/projectStore';
import { useReveal } from '../workbench/reveal';
import { useWorkbench } from '../workbench/store';

interface EditorAreaProps {
  registerActiveEditor?: (handle: EditorHandle | null) => void;
}

/**
 * Path of `abs` relative to the workspace root, with forward slashes, or null
 * when it lives outside the workspace. Case-insensitive prefix match so Windows
 * drive-letter casing (C:\ vs c:\) doesn't defeat it.
 */
function toRepoRelative(abs: string, root: string): string | null {
  const p = abs.replace(/\\/g, '/');
  const r = root.replace(/\\/g, '/').replace(/\/+$/, '');
  if (p.toLowerCase() === r.toLowerCase()) return '';
  if (p.toLowerCase().startsWith(r.toLowerCase() + '/')) return p.slice(r.length + 1);
  return null;
}

export default function EditorArea({ registerActiveEditor }: EditorAreaProps): JSX.Element {
  const editorTabs = useWorkbench((s) => s.editorTabs);
  const activeTabId = useWorkbench((s) => s.activeTabId);
  const markTabDirty = useWorkbench((s) => s.markTabDirty);
  const buffers = useProject((s) => s.buffers);
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const isGitRepo = useProject((s) => s.isGitRepo);

  const activeTab = useMemo(
    () => editorTabs.find((t) => t.id === activeTabId) ?? null,
    [editorTabs, activeTabId],
  );

  const pagePanel = activeTab?.pageId ? PANELS[activeTab.pageId] : null;
  const isWelcome = !pagePanel && (!activeTab || activeTab.id === 'welcome');

  // Skill pages are kept alive once opened: switching to another tab hides the
  // page (display:none) instead of unmounting it, so a running Agent Manager
  // mission, half-typed input, scroll position, and live Vibe terminals all
  // survive a detour into the code editor and back. A page is only mounted
  // after it's first been the active tab (so an inactive restored tab never,
  // say, tries to spawn a PTY into a 0×0 hidden box), and it's dropped when its
  // tab is closed.
  const [activatedPages, setActivatedPages] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (activeTab?.pageId && PANELS[activeTab.pageId]) {
      setActivatedPages((prev) =>
        prev.has(activeTab.id) ? prev : new Set(prev).add(activeTab.id),
      );
    }
  }, [activeTab?.id, activeTab?.pageId]);

  // Prune pages whose tabs have been closed so their components unmount (and
  // release resources — terminals, abort controllers, listeners).
  useEffect(() => {
    setActivatedPages((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (editorTabs.some((t) => t.id === id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [editorTabs]);

  // Always include the active page so it paints on the very first frame it's
  // opened (the effect above only records it for keep-alive afterwards).
  const livePageTabs = useMemo(
    () =>
      editorTabs.filter(
        (t) =>
          t.pageId &&
          PANELS[t.pageId] &&
          (activatedPages.has(t.id) || t.id === activeTabId),
      ),
    [editorTabs, activatedPages, activeTabId],
  );

  const initialValue = useMemo(() => {
    if (!activeTab) return '';
    if (activeTab.filePath) return buffers.get(activeTab.filePath) ?? '';
    return '';
  }, [activeTab, buffers]);

  // Ensure the active tab's content is loaded. Editor tabs persist across
  // reloads but buffers don't, so a restored tab arrives with an empty buffer
  // and would render blank until re-read. ensureFileLoaded is a no-op when the
  // buffer is already present, so this is cheap on every activation.
  useEffect(() => {
    if (activeTab?.filePath) void ensureFileLoaded(activeTab.filePath);
  }, [activeTab?.filePath]);

  // Git baseline (committed HEAD contents) for the change gutter. Re-fetched per
  // file and whenever the saved buffer changes (i.e. after a save), so the bars
  // track edits live and reset once changes are committed. `null` disables the
  // gutter for non-repo files or anything outside the workspace.
  const [baseline, setBaseline] = useState<string | null>(null);
  const filePath = activeTab?.filePath ?? null;
  useEffect(() => {
    if (!filePath || !workspaceRoot || !isGitRepo) {
      setBaseline(null);
      return;
    }
    const rel = toRepoRelative(filePath, workspaceRoot);
    if (!rel) {
      setBaseline(null);
      return;
    }
    let cancelled = false;
    void fileHead(workspaceRoot, rel)
      .then((head) => {
        if (!cancelled) setBaseline(head);
      })
      .catch(() => {
        if (!cancelled) setBaseline(null);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, workspaceRoot, isGitRepo, initialValue]);

  const editorApiRef = useRef<EditorHandle | null>(null);
  const refSetter = useCallback(
    (node: EditorHandle | null) => {
      editorApiRef.current = node;
      registerActiveEditor?.(node);
    },
    [registerActiveEditor],
  );

  // Honour "jump to line" requests (from Search). Wait until the requested
  // file is the active tab and its content is loaded, then reveal the line.
  const revealTarget = useReveal((s) => s.filePath);
  const revealLine = useReveal((s) => s.line);
  const revealNonce = useReveal((s) => s.nonce);
  const clearReveal = useReveal((s) => s.clear);
  useEffect(() => {
    if (!revealTarget) return;
    if (!activeTab || activeTab.filePath !== revealTarget) return;
    if (!buffers.has(revealTarget)) return; // content not loaded yet
    // Defer a tick so EditorCanvas has re-seeded its value for this file.
    const id = window.setTimeout(() => {
      editorApiRef.current?.revealLine(revealLine);
      clearReveal();
    }, 0);
    return () => window.clearTimeout(id);
  }, [revealTarget, revealLine, revealNonce, activeTab, buffers, clearReveal]);

  const handleChange = useCallback(
    (next: string) => {
      if (!activeTab || !activeTab.filePath) return;
      const saved = buffers.get(activeTab.filePath) ?? '';
      const isDirty = next !== saved;
      if (isDirty !== activeTab.isDirty) markTabDirty(activeTab.id, isDirty);
      publishActiveBuffer({
        filePath: activeTab.filePath,
        contents: next,
        isDirty,
        updatedAt: Date.now(),
      });
    },
    [activeTab, buffers, markTabDirty],
  );

  useEffect(() => {
    if (!activeTab || !activeTab.filePath) return;
    publishActiveBuffer({
      filePath: activeTab.filePath,
      contents: initialValue,
      isDirty: activeTab.isDirty,
      updatedAt: Date.now(),
    });
  }, [activeTab, initialValue]);

  return (
    <div className="editor-area">
      <div className="editor-area__body">
        {/* Kept-alive skill pages. Each stays mounted once opened; only the
            active one is visible, the rest are display:none but still live. */}
        {livePageTabs.map((tab) => {
          const panel = tab.pageId ? PANELS[tab.pageId] : undefined;
          if (!panel) return null;
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className="editor-area__page"
              style={{ display: isActive ? 'block' : 'none' }}
              aria-hidden={isActive ? undefined : true}
            >
              <ErrorBoundary scope={panel.title}>
                <Suspense fallback={<PanelFallback />}>
                  {panel.render({ onInsertCode: () => undefined })}
                </Suspense>
              </ErrorBoundary>
            </div>
          );
        })}

        {/* Code editor / welcome — only when the active tab isn't a skill page,
            so a page and the editor are never both visible at once. */}
        {!pagePanel && (
          <ErrorBoundary scope="Editor" key={activeTab?.id ?? 'empty'}>
            {isWelcome ? (
              <div className="editor-area__empty">
                <WelcomeScreen />
              </div>
            ) : (
              activeTab && (
                <EditorCanvas
                  key={activeTab.id}
                  ref={refSetter}
                  initialValue={initialValue}
                  language={activeTab.language}
                  onChange={handleChange}
                  diffBaseline={baseline}
                />
              )
            )}
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
