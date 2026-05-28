import { useCallback, useEffect, useMemo, useRef } from 'react';
import EditorCanvas, { type EditorHandle } from '../views/EditorCanvas';
import WelcomeScreen from '../views/WelcomeScreen';
import { publishActiveBuffer } from '../workbench/mcpBridge';
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

  const isWelcome = !activeTab || activeTab.id === 'welcome';

  const initialValue = useMemo(() => {
    if (!activeTab) return '';
    if (activeTab.filePath) return buffers.get(activeTab.filePath) ?? '';
    return '';
  }, [activeTab, buffers]);

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
            />
          )
        )}
      </div>
    </div>
  );
}
