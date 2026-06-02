import {
  ChevronDown,
  ChevronRight,
  Copy,
  File as FileIcon,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { confirmDialog, pickFolder } from '../lib/dialog';
import {
  basename,
  dirname,
  joinPath,
  readDir,
  relativePath,
  subscribeToFsEvents,
  type DirEntry,
} from '../lib/fs';
import {
  createNewFile,
  createNewFolder,
  deleteEntry,
  openFile,
  openWorkspace,
  renameEntry,
} from '../workbench/actions';
import { useProject } from '../workbench/projectStore';
import { toast } from '../shell/toast';

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

type MenuState = { x: number; y: number; entry: DirEntry } | null;
type PendingOp =
  | { kind: 'new-file' | 'new-folder'; dir: string }
  | { kind: 'rename'; dir: string; original: string };

export default function ExplorerView(): JSX.Element {
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [menu, setMenu] = useState<MenuState>(null);
  const [pending, setPending] = useState<PendingOp | null>(null);
  const [pendingName, setPendingName] = useState('');
  const pendingInputRef = useRef<HTMLInputElement | null>(null);
  const committingRef = useRef(false);

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

  useEffect(() => {
    if (pending) pendingInputRef.current?.focus();
  }, [pending]);

  // Close the context menu on any outside click or Escape.
  useEffect(() => {
    if (!menu) return;
    const onDown = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const handleOpenFolder = async () => {
    const picked = await pickFolder();
    if (picked) await openWorkspace(picked);
  };

  /** Re-read a directory's children in place (preserves the rest of the tree). */
  const refreshDir = useCallback(
    async (dir: string) => {
      if (!workspaceRoot || dir === workspaceRoot) {
        setRefreshTick((t) => t + 1);
        return;
      }
      try {
        const entries = await readDir(dir);
        const children = filterAndSort(entries);
        setRootNodes((nodes) =>
          updateTree(nodes, dir, (node) => ({
            ...node,
            expanded: true,
            loading: false,
            children,
          })),
        );
      } catch {
        setRefreshTick((t) => t + 1);
      }
    },
    [workspaceRoot],
  );

  const toggleNode = async (path: string) => {
    setRootNodes((nodes) =>
      updateTree(nodes, path, (node) => {
        if (!node.entry.is_dir) return node;
        if (node.expanded) return { ...node, expanded: false };
        return { ...node, expanded: true, loading: node.children === null };
      }),
    );

    const flat = flatten(rootNodes);
    const target = flat.find((n) => n.entry.path === path);
    if (target && target.entry.is_dir && target.children === null) {
      try {
        const entries = await readDir(path);
        const children = filterAndSort(entries);
        setRootNodes((nodes) =>
          updateTree(nodes, path, (node) => ({ ...node, loading: false, children })),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const startCreate = (kind: 'new-file' | 'new-folder', dir: string) => {
    setMenu(null);
    setPendingName('');
    setPending({ kind, dir });
  };

  const startRename = (entry: DirEntry) => {
    setMenu(null);
    setPendingName(entry.name);
    setPending({ kind: 'rename', dir: dirname(entry.path), original: entry.path });
  };

  const cancelPending = () => {
    setPending(null);
    setPendingName('');
  };

  const confirmPending = async () => {
    if (!pending || committingRef.current) return;
    const name = pendingName.trim();
    if (!name) {
      cancelPending();
      return;
    }
    committingRef.current = true;
    try {
      if (pending.kind === 'rename') {
        const to = joinPath(pending.dir, name);
        if (to !== pending.original) await renameEntry(pending.original, to);
      } else {
        const target = joinPath(pending.dir, name);
        if (pending.kind === 'new-file') await createNewFile(target);
        else await createNewFolder(target);
      }
      const dir = pending.dir;
      cancelPending();
      await refreshDir(dir);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      cancelPending();
    } finally {
      committingRef.current = false;
    }
  };

  const doDelete = async (entry: DirEntry) => {
    setMenu(null);
    const ok = await confirmDialog(
      `Delete ${entry.is_dir ? 'folder' : 'file'} “${entry.name}”? This cannot be undone.`,
      'Delete',
    );
    if (!ok) return;
    try {
      await deleteEntry(entry.path);
      await refreshDir(dirname(entry.path));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const copyPath = async (path: string) => {
    setMenu(null);
    try {
      await navigator.clipboard.writeText(path);
      toast('Path copied', 'success');
    } catch {
      toast('Could not copy path', 'error');
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
          gap: 4,
          padding: '0 6px 6px',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-dim)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        <FolderOpen size={12} strokeWidth={1.6} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {basename(workspaceRoot) || workspaceRoot}
        </span>
        <ToolbarButton title="New file" onClick={() => startCreate('new-file', workspaceRoot)}>
          <FilePlus2 size={14} />
        </ToolbarButton>
        <ToolbarButton title="New folder" onClick={() => startCreate('new-folder', workspaceRoot)}>
          <FolderPlus size={14} />
        </ToolbarButton>
        <ToolbarButton title="Open another folder" onClick={handleOpenFolder}>
          <FolderOpen size={14} />
        </ToolbarButton>
      </div>

      {pending && (
        <div style={{ padding: '0 6px 4px' }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginBottom: 2 }}>
            {pending.kind === 'rename'
              ? 'Rename'
              : pending.kind === 'new-file'
                ? 'New file'
                : 'New folder'}
            {' · '}
            {relativePath(workspaceRoot, pending.dir) || basename(workspaceRoot)}
          </div>
          <input
            ref={pendingInputRef}
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void confirmPending();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelPending();
              }
            }}
            onBlur={() => void confirmPending()}
            placeholder={pending.kind === 'new-folder' ? 'folder name' : 'file name'}
            style={{ width: '100%', fontSize: 12 }}
          />
        </div>
      )}

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
            onContextMenu={(x, y, entry) => setMenu({ x, y, entry })}
          />
        ))}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          entry={menu.entry}
          onNewFile={(dir) => startCreate('new-file', dir)}
          onNewFolder={(dir) => startCreate('new-folder', dir)}
          onRename={startRename}
          onDelete={doDelete}
          onCopyPath={copyPath}
        />
      )}
    </div>
  );
}

function ToolbarButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        padding: 2,
        border: 'none',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

interface ContextMenuProps {
  x: number;
  y: number;
  entry: DirEntry;
  onNewFile: (dir: string) => void;
  onNewFolder: (dir: string) => void;
  onRename: (entry: DirEntry) => void;
  onDelete: (entry: DirEntry) => void;
  onCopyPath: (path: string) => void;
}

function ContextMenu({
  x,
  y,
  entry,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onCopyPath,
}: ContextMenuProps): JSX.Element {
  // New files/folders are created inside a directory; for a file, use its parent.
  const targetDir = entry.is_dir ? entry.path : dirname(entry.path);
  return (
    <div
      className="context-menu"
      style={{ top: y, left: x }}
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
    >
      <button type="button" className="context-menu__item" onClick={() => onNewFile(targetDir)}>
        <FilePlus2 size={13} /> New File
      </button>
      <button type="button" className="context-menu__item" onClick={() => onNewFolder(targetDir)}>
        <FolderPlus size={13} /> New Folder
      </button>
      <div className="context-menu__sep" />
      <button type="button" className="context-menu__item" onClick={() => onRename(entry)}>
        <Pencil size={13} /> Rename
      </button>
      <button
        type="button"
        className="context-menu__item context-menu__item--danger"
        onClick={() => onDelete(entry)}
      >
        <Trash2 size={13} /> Delete
      </button>
      <div className="context-menu__sep" />
      <button type="button" className="context-menu__item" onClick={() => onCopyPath(entry.path)}>
        <Copy size={13} /> Copy Path
      </button>
    </div>
  );
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => Promise<void>;
  onContextMenu: (x: number, y: number, entry: DirEntry) => void;
}

function TreeRow({ node, depth, onToggle, onOpenFile, onContextMenu }: TreeRowProps): JSX.Element {
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
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e.clientX, e.clientY, entry);
        }}
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
              onContextMenu={onContextMenu}
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
