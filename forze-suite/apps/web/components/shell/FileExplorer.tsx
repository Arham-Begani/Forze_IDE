'use client';

import {
  ChevronDown,
  ChevronRight,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { FileNode, FolderNode, TreeNode } from '@/lib/mock-fs';

function iconFor(file: FileNode): LucideIcon {
  if (file.language === 'tsx' || file.language === 'ts' || file.language === 'js') return FileCode;
  if (file.language === 'json') return FileJson;
  return FileText;
}

function FileRow({ file, depth }: { file: FileNode; depth: number }) {
  const activePath = useStore((s) => s.activeTabPath);
  const openFile = useStore((s) => s.openFile);
  const Icon = iconFor(file);
  const isActive = activePath === file.path;

  return (
    <button
      onClick={() => openFile(file.path)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openFile(file.path);
        }
      }}
      className={cn(
        'w-full flex items-center gap-1.5 h-7 rounded-md text-left text-sm transition-colors px-1.5',
        isActive
          ? 'bg-bg-active text-ink'
          : 'text-ink-muted hover:bg-bg-hover hover:text-ink',
      )}
      style={{ paddingLeft: 6 + depth * 12 }}
      title={file.path}
    >
      <span className="w-3.5 flex-shrink-0" />
      <Icon
        className={cn(
          'w-3.5 h-3.5 flex-shrink-0',
          isActive ? 'text-accent' : 'text-ink-dim',
        )}
      />
      <span className="truncate">{file.name}</span>
    </button>
  );
}

function FolderRow({ folder, depth }: { folder: FolderNode; depth: number }) {
  const expanded = useStore((s) => s.expandedFolders[folder.path] ?? false);
  const toggle = useStore((s) => s.toggleFolder);

  return (
    <>
      <button
        onClick={() => toggle(folder.path)}
        className="w-full flex items-center gap-1.5 h-7 rounded-md text-left text-sm text-ink-muted hover:bg-bg-hover hover:text-ink transition-colors px-1.5"
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-ink-dim" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-ink-dim" />
        )}
        {expanded ? (
          <FolderOpen className="w-3.5 h-3.5 text-ink-dim flex-shrink-0" />
        ) : (
          <Folder className="w-3.5 h-3.5 text-ink-dim flex-shrink-0" />
        )}
        <span className="truncate">{folder.name}</span>
      </button>
      {expanded && (
        <div>
          {folder.children.map((child) => (
            <TreeRow key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  );
}

function TreeRow({ node, depth }: { node: TreeNode; depth: number }) {
  if (node.type === 'folder') return <FolderRow folder={node} depth={depth} />;
  return <FileRow file={node} depth={depth} />;
}

export function FileExplorer() {
  const tree = useStore((s) => s.tree);
  const expanded = useStore((s) => s.expandedFolders[tree.path] ?? true);
  const toggle = useStore((s) => s.toggleFolder);

  return (
    <aside className="w-[280px] flex-shrink-0 flex flex-col bg-bg-surface border-r border-line">
      <div className="h-10 px-3 flex items-center justify-between border-b border-line">
        <span className="text-sm font-medium text-ink">Explorer</span>
        <div className="flex items-center gap-0.5">
          <button
            className="w-6 h-6 rounded-md flex items-center justify-center text-ink-dim hover:bg-bg-hover hover:text-ink transition-colors"
            title="New file"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            className="w-6 h-6 rounded-md flex items-center justify-center text-ink-dim hover:bg-bg-hover hover:text-ink transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2 px-1">
        <button
          onClick={() => toggle(tree.path)}
          className="w-full flex items-center gap-1.5 h-7 rounded-md text-left text-2xs font-semibold tracking-wider text-ink-muted hover:text-ink transition-colors px-1.5 uppercase"
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          <span>{tree.name}</span>
        </button>
        {expanded && (
          <div className="mt-0.5">
            {tree.children.map((child) => (
              <TreeRow key={child.path} node={child} depth={1} />
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-line">
        <button className="w-full px-3 h-8 flex items-center gap-1.5 text-2xs text-ink-muted hover:bg-bg-hover hover:text-ink transition-colors">
          <ChevronRight className="w-3 h-3" />
          <span className="uppercase tracking-wider">Outline</span>
        </button>
        <button className="w-full px-3 h-8 flex items-center gap-1.5 text-2xs text-ink-muted hover:bg-bg-hover hover:text-ink transition-colors border-t border-line">
          <ChevronRight className="w-3 h-3" />
          <span className="uppercase tracking-wider">Timeline</span>
        </button>
      </div>
    </aside>
  );
}
