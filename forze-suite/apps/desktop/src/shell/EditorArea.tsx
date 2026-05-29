import { useCallback, useEffect, useMemo } from 'react';
import EditorCanvas, { type EditorHandle } from '../views/EditorCanvas';
import WelcomeScreen from '../views/WelcomeScreen';
import ErrorBoundary from './ErrorBoundary';
import { ensureFileLoaded } from '../workbench/actions';
import { publishActiveBuffer } from '../workbench/mcpBridge';
import { PANELS } from '../workbench/panels';
import { useProject } from '../workbench/projectStore';
import { useWorkbench } from '../workbench/store';

interface EditorAreaProps {
  registerActiveEditor?: (handle: EditorHandle | null) => void;
}

export default function EditorArea({ registerActiveEditor }: EditorAreaProps): JSX.Element {
  const editorTabs = useWorkbench((s) => s.editorTabs);
  const activeTabId = useWorkbench((s) => s.activeTabId);
  const markTabDirty = useWorkbench((s) => s.markTabDirty);
  const buffers = useProject((s) => s.buffers);

  const activeTab = useMemo(
    () => editorTabs.find((t) => t.id === activeTabId) ?? null,
    [editorTabs, activeTabId],
  );

  const pagePanel = activeTab?.pageId ? PANELS[activeTab.pageId] : null;
  const isWelcome = !pagePanel && (!activeTab || activeTab.id === 'welcome');

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

  const refSetter = useCallback(
    (node: EditorHandle | null) => {
      registerActiveEditor?.(node);
    },
    [registerActiveEditor],
  );

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
        <ErrorBoundary scope="Editor" key={activeTab?.id ?? 'empty'}>
          {pagePanel ? (
            pagePanel.render({ onInsertCode: () => undefined })
          ) : isWelcome ? (
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
              />
            )
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
