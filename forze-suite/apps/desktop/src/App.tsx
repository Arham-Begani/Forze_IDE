import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import ActivityBar from './shell/ActivityBar';
import Sidebar from './shell/Sidebar';
import EditorArea from './shell/EditorArea';
import BottomPanel from './shell/BottomPanel';
import StatusBar from './shell/StatusBar';
import TopBar from './shell/TopBar';
import TitleBar from './shell/TitleBar';
import WindowResizers from './shell/WindowResizers';
import CommandPalette from './shell/CommandPalette';
import QuickOpen from './shell/QuickOpen';
import FloatingAssistant from './shell/FloatingAssistant';
import OnboardingWizard, { useOnboarding } from './shell/OnboardingWizard';
import ErrorBoundary from './shell/ErrorBoundary';
import { ToastHost, toast } from './shell/toast';
import { ModalHost, showModal } from './shell/modal';
import type { EditorHandle } from './views/EditorCanvas';
import { useApplyTheme } from './theme/themeStore';
import { useAgents } from './workbench/agentStore';
import { useWorkbench, type ActivityId } from './workbench/store';
import { PANELS } from './workbench/panels';
import { useProject } from './workbench/projectStore';
import { useCommitGuard } from './workbench/commitGuardStore';
import { partitionFindings } from './lib/diffScan';
import { anyProviderReady } from './workbench/aiConfig';
import {
  closeWorkspace,
  openWorkspace,
  saveActiveTab,
} from './workbench/actions';
import { commands } from './workbench/commands';
import { useDiagnostics } from './workbench/diagnosticsStore';
import { useBipSchedule } from './workbench/bipScheduleStore';
import { startBipScheduler } from './workbench/bipScheduler';
import { startPromptScheduler } from './workbench/promptScheduler';
import { startTeamSync } from './workbench/teamSync';
import { computeSurvivalScore } from './workbench/survivalScore';
import { useKeybindings, keybindingHint } from './workbench/keybindings';
import { zoomIn, zoomOut, zoomReset } from './workbench/zoom';
import { pickFolder } from './lib/dialog';
import { checkForUpdates } from './lib/updater';
import { subscribeToDevServerLogs } from './lib/tauri';
import { parseStackTraceLine } from '@forze/shared/diagnostics';

export default function App(): JSX.Element {
  const [logs, setLogs] = useState<string[]>([]);
  const [dropOver, setDropOver] = useState(false);
  const activeEditorRef = useRef<EditorHandle | null>(null);

  const sidebarVisible = useWorkbench((s) => s.sidebarVisible);
  const activeActivity = useWorkbench((s) => s.activeActivity);
  const rightPanel = useWorkbench((s) => s.rightPanel);
  const rightSidebarVisible = useWorkbench((s) => s.rightSidebarVisible);
  const draggingPanel = useWorkbench((s) => s.draggingPanel);
  const dockRight = useWorkbench((s) => s.dockRight);
  const setDraggingPanel = useWorkbench((s) => s.setDraggingPanel);
  const bottomPanelVisible = useWorkbench((s) => s.bottomPanelVisible);
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);
  const setBottomPanelTab = useWorkbench((s) => s.setBottomPanelTab);
  const toggleSidebar = useWorkbench((s) => s.toggleSidebar);
  const toggleBottomPanel = useWorkbench((s) => s.toggleBottomPanel);
  const setCommandPaletteOpen = useWorkbench((s) => s.setCommandPaletteOpen);
  const setQuickOpen = useWorkbench((s) => s.setQuickOpen);
  const closeTab = useWorkbench((s) => s.closeTab);
  const editorTabs = useWorkbench((s) => s.editorTabs);

  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const branch = useProject((s) => s.branch);
  const isGitRepo = useProject((s) => s.isGitRepo);
  const pushDiagnostic = useDiagnostics((s) => s.push);
  const problemsCount = useDiagnostics((s) => s.entries.length);
  const scheduledPostsCount = useBipSchedule((s) => s.posts.length);
  const lastReview = useCommitGuard((s) => s.lastReview);
  const openPage = useWorkbench((s) => s.openPage);
  const hasAgentKey = useAgents((s) => anyProviderReady(s.apiKeys));
  const resetOnboarding = useOnboarding((s) => s.reset);

  useApplyTheme();
  useKeybindings();

  const survival = useMemo(
    () =>
      computeSurvivalScore({
        workspaceOpen: !!workspaceRoot,
        isGitRepo,
        problemsCount,
        dirtyTabsCount: editorTabs.filter((t) => t.isDirty).length,
        hasAgentApiKey: hasAgentKey,
        scheduledPosts: scheduledPostsCount,
      }),
    [
      workspaceRoot,
      isGitRepo,
      problemsCount,
      editorTabs,
      hasAgentKey,
      scheduledPostsCount,
    ],
  );

  // Mirror survival into a ref so the command registration effect below can read
  // the latest score at run time WITHOUT listing `survival` as a dependency —
  // otherwise every score change (problems count, a dirtied tab, opening a repo)
  // tears down and re-registers all ~22 commands for nothing.
  const survivalRef = useRef(survival);
  survivalRef.current = survival;

  useEffect(() => {
    try {
      if (workspaceRoot) void openWorkspace(workspaceRoot).catch(() => undefined);
    } catch (err) {
      console.warn('[forze] openWorkspace on boot failed', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Fire-and-forget on startup; no-op outside the Tauri shell.
    void checkForUpdates();
  }, []);

  useEffect(() => {
    let stop = () => undefined as void;
    try {
      stop = startBipScheduler();
    } catch (err) {
      console.warn('[forze] build-in-public scheduler failed to start', err);
    }
    return () => {
      try {
        stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    let stop = () => undefined as void;
    try {
      stop = startPromptScheduler();
    } catch (err) {
      console.warn('[forze] prompt scheduler failed to start', err);
    }
    return () => {
      try {
        stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    let stop = () => undefined as void;
    try {
      stop = startTeamSync();
    } catch (err) {
      console.warn('[forze] team sync failed to start', err);
    }
    return () => {
      try {
        stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const onLog = useCallback(
    (line: string) => {
      setLogs((prev) => [...prev.slice(-499), line]);
      const trace = parseStackTraceLine(line);
      if (trace) {
        activeEditorRef.current?.markDiagnostic(trace);
        pushDiagnostic(trace);
      }
    },
    [pushDiagnostic],
  );

  useEffect(() => {
    const unsubscribePromise = Promise.resolve(subscribeToDevServerLogs(onLog)).catch(
      () => () => undefined,
    );
    return () => {
      void unsubscribePromise.then((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
          /* ignore */
        }
      });
    };
  }, [onLog]);

  // === Command registration ===
  useEffect(() => {
    const unregs = [
      commands.register({
        id: 'workbench.action.showCommands',
        title: 'Show All Commands',
        category: 'View',
        keybinding: keybindingHint('workbench.action.showCommands'),
        run: () => setCommandPaletteOpen(true),
      }),
      commands.register({
        id: 'workbench.action.quickOpen',
        title: 'Go to File…',
        category: 'File',
        keybinding: keybindingHint('workbench.action.quickOpen'),
        run: () => setQuickOpen(true),
      }),
      commands.register({
        id: 'workbench.action.toggleSidebar',
        title: 'Toggle Sidebar',
        category: 'View',
        keybinding: keybindingHint('workbench.action.toggleSidebar'),
        run: () => toggleSidebar(),
      }),
      commands.register({
        id: 'workbench.action.toggleBottomPanel',
        title: 'Toggle Panel',
        category: 'View',
        keybinding: keybindingHint('workbench.action.toggleBottomPanel'),
        run: () => toggleBottomPanel(),
      }),
      commands.register({
        id: 'workbench.action.terminal.toggle',
        title: 'Toggle Terminal',
        category: 'Terminal',
        keybinding: keybindingHint('workbench.action.terminal.toggle'),
        run: () => setBottomPanelTab('terminal'),
      }),
      commands.register({
        id: 'workbench.action.problems.focus',
        title: 'Focus Problems',
        category: 'View',
        keybinding: keybindingHint('workbench.action.problems.focus'),
        run: () => setBottomPanelTab('problems'),
      }),
      commands.register({
        id: 'workbench.action.output.focus',
        title: 'Focus Output',
        category: 'View',
        keybinding: keybindingHint('workbench.action.output.focus'),
        run: () => setBottomPanelTab('output'),
      }),
      commands.register({
        id: 'workbench.action.closeActiveEditor',
        title: 'Close Active Editor',
        category: 'File',
        keybinding: keybindingHint('workbench.action.closeActiveEditor'),
        run: () => {
          const id = useWorkbench.getState().activeTabId;
          if (id) closeTab(id);
        },
      }),
      commands.register({
        id: 'workbench.action.files.save',
        title: 'Save',
        category: 'File',
        keybinding: keybindingHint('workbench.action.files.save'),
        run: async () => {
          const value = activeEditorRef.current?.getValue() ?? null;
          try {
            await saveActiveTab(value);
          } catch (err) {
            console.error('[forze] save failed', err);
          }
        },
      }),
      commands.register({
        id: 'editor.action.formatDocument',
        title: 'Format Document',
        category: 'Editor',
        keybinding: keybindingHint('editor.action.formatDocument'),
        run: async () => {
          const editor = activeEditorRef.current;
          if (!editor) return;
          await editor.format();
        },
      }),
      commands.register({
        id: 'workbench.action.zoomIn',
        title: 'Zoom In',
        category: 'View',
        keybinding: keybindingHint('workbench.action.zoomIn'),
        run: () => zoomIn(),
      }),
      commands.register({
        id: 'workbench.action.zoomOut',
        title: 'Zoom Out',
        category: 'View',
        keybinding: keybindingHint('workbench.action.zoomOut'),
        run: () => zoomOut(),
      }),
      commands.register({
        id: 'workbench.action.zoomReset',
        title: 'Reset Zoom',
        category: 'View',
        keybinding: keybindingHint('workbench.action.zoomReset'),
        run: () => zoomReset(),
      }),
      commands.register({
        id: 'workbench.action.files.openFolder',
        title: 'Open Folder…',
        category: 'File',
        run: async () => {
          const picked = await pickFolder();
          if (picked) await openWorkspace(picked);
        },
      }),
      commands.register({
        id: 'workbench.action.files.closeFolder',
        title: 'Close Folder',
        category: 'File',
        run: () => {
          void closeWorkspace();
        },
      }),
      commands.register({
        id: 'workbench.action.boardroom.simulate',
        title: 'Show Survival Score Breakdown',
        category: 'Forze',
        run: () => {
          const s = survivalRef.current;
          showModal({
            title: 'Venture Survival Score',
            body: (
              <div className="score-modal">
                <div className={`score-modal__hero score-modal__hero--${s.band}`}>
                  <span className="score-modal__value">{s.score}</span>
                  <span className="score-modal__band">{s.band}</span>
                </div>
                <ul className="score-modal__list">
                  {s.breakdown.map((b) => (
                    <li key={b.label} className="score-modal__row">
                      <span className="score-modal__label">{b.label}</span>
                      <span
                        className={`score-modal__delta${b.delta < 0 ? ' is-negative' : ''}`}
                      >
                        {b.delta >= 0 ? '+' : ''}
                        {b.delta}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          });
        },
      }),
      commands.register({
        id: 'workbench.action.onboarding.show',
        title: 'Re-run Onboarding Wizard',
        category: 'Forze',
        run: () => resetOnboarding(),
      }),
      commands.register({
        id: 'workbench.action.openAgentManager',
        title: 'Open Agent Manager',
        category: 'Forze',
        run: () => useWorkbench.getState().openPage('agent-manager'),
      }),
      commands.register({
        id: 'workbench.assistant.toggle',
        title: 'Toggle Forze Assistant',
        category: 'Forze',
        keybinding: keybindingHint('workbench.view.agents'),
        run: () => useWorkbench.getState().toggleAssistant(),
      }),
      commands.register({
        id: 'workbench.action.mcp.copyConfig',
        title: 'Copy MCP Config for External Agents',
        category: 'Forze',
        run: async () => {
          const root = useProject.getState().workspaceRoot ?? '<your-workspace>';
          const snippet = JSON.stringify(
            {
              mcpServers: {
                forze: {
                  command: 'node',
                  args: ['<absolute-path-to>/packages/mcp-server/dist/index.js'],
                  env: { FORZE_WORKSPACE: root },
                },
              },
            },
            null,
            2,
          );
          try {
            await navigator.clipboard.writeText(snippet);
            toast('MCP config copied — paste it into your external agent', 'success');
          } catch {
            // Clipboard can be blocked; show the snippet so the user can copy it
            // by hand instead of silently swallowing the failure.
            showModal({
              title: 'MCP Config for External Agents',
              body: (
                <>
                  <p className="modal__message">
                    Copy this into your agent&apos;s MCP settings:
                  </p>
                  <pre className="modal__code">{snippet}</pre>
                </>
              ),
            });
          }
        },
      }),
    ];

    const activityCommands: { id: ActivityId; title: string; keybindingId: string }[] = [
      { id: 'explorer', title: 'Show Explorer', keybindingId: 'workbench.view.explorer' },
      {
        id: 'source-control',
        title: 'Show Source Control',
        keybindingId: 'workbench.view.scm',
      },
      { id: 'vibe', title: 'Show Vibe Canvas', keybindingId: 'workbench.view.vibe' },
      {
        id: 'security',
        title: 'Show Security',
        keybindingId: 'workbench.view.security',
      },
      {
        id: 'settings',
        title: 'Open Settings',
        keybindingId: 'workbench.action.openSettings',
      },
    ];

    for (const ac of activityCommands) {
      unregs.push(
        commands.register({
          id: ac.keybindingId,
          title: ac.title,
          category: 'View',
          keybinding: keybindingHint(ac.keybindingId),
          run: () => setActiveActivity(ac.id),
        }),
      );
    }

    return () => unregs.forEach((u) => u());
    // All deps are stable zustand actions (and survival/activeTabId are now read
    // via ref/getState at run time), so commands register exactly once on mount.
  }, [
    setCommandPaletteOpen,
    setQuickOpen,
    toggleSidebar,
    toggleBottomPanel,
    setBottomPanelTab,
    setActiveActivity,
    closeTab,
    resetOnboarding,
  ]);

  const registerActiveEditor = useCallback((handle: EditorHandle | null) => {
    activeEditorRef.current = handle;
  }, []);

  const insertSnippetIntoActiveEditor = useCallback((snippet: string) => {
    const handle = activeEditorRef.current;
    if (handle) {
      handle.insertAtCursor(snippet);
      return;
    }
    // No code editor is mounted (e.g. a skill page is the active tab) — don't
    // drop the generated snippet on the floor. Copy it so it can be pasted.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(snippet).then(
        () => toast('No file open — generated code copied to clipboard.', 'info'),
        () => toast('Generated code is ready, but no editor is open to receive it.', 'warn'),
      );
    } else {
      toast('Open a file in the editor to receive the generated code.', 'warn');
    }
  }, []);

  return (
    <>
      <div className="workbench">
        <div className="workbench__titlebar">
          <ErrorBoundary scope="Title bar">
            <TitleBar onSelectAll={() => activeEditorRef.current?.selectAll()} />
          </ErrorBoundary>
        </div>

        <div className="workbench__topbar">
          <ErrorBoundary scope="Top bar">
            <TopBar
              onOpenSettings={() => setActiveActivity('settings')}
              onToggleSidebar={toggleSidebar}
            />
          </ErrorBoundary>
        </div>

        <div className="workbench__rail" role="navigation" aria-label="Activity bar">
          <ErrorBoundary scope="Activity bar">
            <ActivityBar />
          </ErrorBoundary>
        </div>

        <div className="workbench__main" role="main" style={{ position: 'relative' }}>
          <PanelGroup
            direction="horizontal"
            autoSaveId="forze.workbench.horizontal"
            style={{ flex: 1, minWidth: 0 }}
          >
            {sidebarVisible && (
              <>
                <Panel
                  defaultSize={22}
                  minSize={12}
                  maxSize={45}
                  order={1}
                  id="sidebar"
                >
                  <ErrorBoundary scope="Sidebar">
                    <Sidebar
                      side="left"
                      panelId={activeActivity}
                      onInsertCode={insertSnippetIntoActiveEditor}
                    />
                  </ErrorBoundary>
                </Panel>
                <PanelResizeHandle className="resize-handle resize-handle--vertical" />
              </>
            )}

            <Panel order={2} id="main" minSize={30}>
              <PanelGroup direction="vertical" autoSaveId="forze.workbench.vertical">
                <Panel defaultSize={70} minSize={20} order={1} id="editor">
                  <EditorArea registerActiveEditor={registerActiveEditor} />
                </Panel>
                {bottomPanelVisible && (
                  <>
                    <PanelResizeHandle className="resize-handle resize-handle--horizontal" />
                    <Panel
                      defaultSize={30}
                      minSize={10}
                      maxSize={70}
                      order={2}
                      id="bottom"
                    >
                      <ErrorBoundary scope="Bottom panel">
                        <BottomPanel logs={logs} onClearLogs={() => setLogs([])} />
                      </ErrorBoundary>
                    </Panel>
                  </>
                )}
              </PanelGroup>
            </Panel>
          </PanelGroup>

          {/* Right sidebar lives outside the PanelGroup as a plain flex sibling
              so toggling it can never invalidate the resizable layout. */}
          {rightSidebarVisible && rightPanel && (
            <aside className="rightdock">
              <ErrorBoundary scope="Right sidebar">
                <Sidebar
                  side="right"
                  panelId={rightPanel}
                  onInsertCode={insertSnippetIntoActiveEditor}
                />
              </ErrorBoundary>
            </aside>
          )}

          {draggingPanel && (
            <div
              className={`dropzone-right${dropOver ? ' is-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (!dropOver) setDropOver(true);
              }}
              onDragLeave={() => setDropOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/forze-panel') as ActivityId;
                if (id) dockRight(id);
                setDropOver(false);
                setDraggingPanel(null);
              }}
            >
              Dock “{PANELS[draggingPanel].title}” to the right →
            </div>
          )}
        </div>

        <div className="workbench__status">
          <ErrorBoundary scope="Status bar">
            <StatusBar
              workspaceRoot={workspaceRoot}
              branch={branch}
              survivalScore={survival.score}
              survivalBand={survival.band}
              problemsCount={problemsCount}
              scheduledPostsCount={scheduledPostsCount}
              securityFindings={lastReview?.findings.length ?? 0}
              securityBlocking={
                partitionFindings(lastReview?.findings ?? []).blockers.length > 0
              }
              onOpenFolder={async () => {
                const picked = await pickFolder();
                if (picked) await openWorkspace(picked);
              }}
              onShowProblems={() => setBottomPanelTab('problems')}
              onShowScore={() => void commands.run('workbench.action.boardroom.simulate')}
              onShowSchedule={() => openPage('build-in-public')}
              onShowSecurity={() => setActiveActivity('security')}
            />
          </ErrorBoundary>
        </div>
      </div>
      <CommandPalette />
      <QuickOpen />
      <FloatingAssistant />
      <OnboardingWizard />
      <ToastHost />
      <ModalHost />
      <WindowResizers />
    </>
  );
}
