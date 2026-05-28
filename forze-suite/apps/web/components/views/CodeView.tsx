'use client';

import { CodeEditor } from '../shell/CodeEditor';
import { FileExplorer } from '../shell/FileExplorer';
import { RightPanel } from '../shell/RightPanel';
import { BottomPanel } from '../shell/BottomPanel';
import { useStore } from '@/lib/store';

export function CodeView() {
  const rightVisible = useStore((s) => s.rightPanelVisible);
  const bottomVisible = useStore((s) => s.bottomPanelVisible);

  return (
    <div className="flex-1 min-w-0 flex">
      <FileExplorer />
      <div className="flex-1 min-w-0 flex">
        <div className="flex-1 min-w-0 flex flex-col">
          <CodeEditor />
          {bottomVisible && <BottomPanel />}
        </div>
        {rightVisible && (
          <div className="w-[42%] min-w-[420px] max-w-[680px] flex-shrink-0 flex">
            <RightPanel />
          </div>
        )}
      </div>
    </div>
  );
}
