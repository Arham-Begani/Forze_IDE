import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderOpen,
  FolderPlus,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { pickFolder } from '../lib/dialog';
import { basename, readDir, subscribeToFsEvents, type DirEntry } from '../lib/fs';
import { openFile, openWorkspace } from '../workbench/actions';
import { useProject } from '../workbench/projectStore';

interface TreeNode {
  entry: DirEntry;
  expanded: boolean;
  loading: boolean;
  children: TreeNode[] | null;
}

const IGNORED = new Set(['.git', 'node_modules', '.next', 'dist', 'target', '.turbo']);

function toNode(entry: DirEntry): TreeNode {
  return { entry, expanded: false, loading: false, children: null };
}

export default function ExplorerView(): JSX.Element {
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const loadRoot = useCallback(async () => {
    if (!workspaceRoot) {
      setRootNodes([]);
      return;
    }
    try {
      const entries = await readDir(workspaceRoot);
      setRootNodes(filterAndSort(entries));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [workspaceRoot]);

  useEffect(() => {
    void loadRoot();
  }, [loadRoot, refreshTick]);

  // Refresh root listing on fs events. Lazy — only the visible root level is
  // re-fetched; expanded subdirectories refresh themselves on next open.
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    void subscribeToFsEvents(() => {
      setRefreshTick((tick) => tick + 1);
    }).then((u) => {
      unsubscribe = u;
    });
    return () => unsubscribe?.();
  }, []);

  const handleOpenFolder = async () => {
    const picked = await pickFolder();
    if (picked) await openWorkspace(picked);
  };

  const toggleNode = async (path: string) => {
    setRootNodes((nodes) => updateTree(nodes, path, (node) => {
      if (!node.entry.is_dir) return node;
      if (node.expanded) return { ...node, expanded: false };
      // First expand — kick off async load below.
      return { ...node, expanded: true, loading: node.children === null };
    }));

    const flat = flatten(rootNodes);
    const target = flat.find((n) => n.entry.path === path);
    if (target && target.entry.is_dir && target.children === null) {
      try {
        const entries = await readDir(path);
        const children = filterAndSort(entries);
        setRootNodes((nodes) =>
          updateTree(nodes, path, (node) => ({
            ...node,
            loading: false,
            children,
          })),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  if (!workspaceRoot) {
    return (
      <div className="placeholder-view">
        <FolderOpen size={28} strokeWidth={1.4} />
        <h3>No folder opened</h3>
        <p>Open a folder to start working.</p>
        <button type="button" onClick={handleOpenFolder}>
          Open Folder
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 6px 6px',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-dim)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        <FolderOpen size={12} strokeWidth={1.6} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {basename(workspaceRoot) || workspaceRoot}
        </span>
        <button
          type="button"
          style={{
            marginLeft: 'auto',
            padding: 2,
            border: 'none',
            background: 'transparent',
            color: 'inherit',
          }}
          title="Open another folder"
          onClick={handleOpenFolder}
        >
          <FolderPlus size={14} />
        </button>
      </div>

      {error && (
        <p style={{ color: 'var(--color-danger)', padding: '0 6px', fontSize: 11 }}>
          {error}
        </p>
      )}

      <div role="tree" style={{ fontSize: 'var(--font-size-sm)' }}>
        {rootNodes.map((node) => (
          <TreeRow
            key={node.entry.path}
            node={node}
            depth={0}
            onToggle={toggleNode}
            onOpenFile={openFile}
          />
        ))}
      </div>
    </div>
  );
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => Promise<void>;
}

function TreeRow({ node, depth, onToggle, onOpenFile }: TreeRowProps): JSX.Element {
  const { entry, expanded, children, loading } = node;
  const indent = depth * 12;
  const handleClick = () => {
    if (entry.is_dir) onToggle(entry.path);
    else void onOpenFile(entry.path);
  };
  return (
    <>
      <div
        role="treeitem"
        aria-expanded={entry.is_dir ? expanded : undefined}
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: `2px 6px 2px ${4 + indent}px`,
          cursor: 'pointer',
          userSelect: 'none',
          borderRadius: 4,
        }}
        className="tree-row"
      >
        {entry.is_dir ? (
          expanded ? (
            <ChevronDown size={12} strokeWidth={2} />
          ) : (
            <ChevronRight size={12} strokeWidth={2} />
          )
        ) : (
          <span style={{ width: 12 }} />
        )}
        {(() => {
          const getIconClass = () => {
            if (entry.is_dir) return 'icon-folder';
            const parts = entry.name.split('.');
            const ext = parts.length > 1 ? parts.pop()?.toLowerCase() : '';
            if (['ts', 'tsx', 'js', 'jsx'].includes(ext || '')) return 'icon-code';
            if (['json', 'yaml', 'yml', 'lock', 'toml'].includes(ext || '')) return 'icon-config';
            if (entry.name.includes('.env')) return 'icon-env';
            if (['md', 'txt', 'pdf'].includes(ext || '')) return 'icon-doc';
            return 'icon-file';
          };
          const cls = getIconClass();
          return entry.is_dir ? (
            <Folder size={14} strokeWidth={1.6} className={cls} />
          ) : (
            <FileIcon size={14} strokeWidth={1.6} className={cls} />
          );
        })()}
        <span className={`tree-name ${entry.is_dir ? 'is-directory' : 'is-file'}`}>
          {entry.name}
        </span>
      </div>

      {entry.is_dir && expanded && (
        <>
          {loading && (
            <div
              style={{
                paddingLeft: 16 + indent,
                color: 'var(--color-text-dim)',
                fontSize: 11,
              }}
            >
              loading…
            </div>
          )}
          {children?.map((child) => (
            <TreeRow
              key={child.entry.path}
              node={child}
              depth={depth + 1}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
            />
          ))}
        </>
      )}
    </>
  );
}

function filterAndSort(entries: DirEntry[]): TreeNode[] {
  return entries
    .filter((entry) => !IGNORED.has(entry.name))
    .map(toNode);
}

function flatten(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      out.push(node);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

function updateTree(
  nodes: TreeNode[],
  path: string,
  updater: (node: TreeNode) => TreeNode,
): TreeNode[] {
  return nodes.map((node) => {
    if (node.entry.path === path) return updater(node);
    if (node.children) {
      return { ...node, children: updateTree(node.children, path, updater) };
    }
    return node;
  });
}
