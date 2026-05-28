import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { AnthropicProvider } from '@forze/agents';
import ActivityBar from './shell/ActivityBar';
import Sidebar from './shell/Sidebar';
import EditorArea from './shell/EditorArea';
import BottomPanel from './shell/BottomPanel';
import StatusBar from './shell/StatusBar';
import TopBar from './shell/TopBar';
import CommandBar from './shell/CommandBar';
import CommandPalette from './shell/CommandPalette';
import OnboardingWizard, { useOnboarding } from './shell/OnboardingWizard';
import type { EditorHandle } from './views/EditorCanvas';
import { useApplyTheme } from './theme/themeStore';
import { useAgents } from './workbench/agentStore';
import { useWorkbench, type ActivityId } from './workbench/store';
import { useProject } from './workbench/projectStore';
import {
  closeWorkspace,
  openWorkspace,
  saveActiveTab,
} from './workbench/actions';
import { commands } from './workbench/commands';
import { useDiagnostics } from './workbench/diagnosticsStore';
import { useSocial } from './workbench/socialStore';
import { startSocialScheduler } from './workbench/socialScheduler';
import { computeSurvivalScore } from './workbench/survivalScore';
import { useKeybindings, keybindingHint } from './workbench/keybindings';
import { pickFolder } from './lib/dialog';
import { subscribeToDevServerLogs } from './lib/tauri';
import { parseStackTraceLine } from '@forze/shared/diagnostics';

export default function App(): JSX.Element {
  const [logs, setLogs] = useState<string[]>([]);
  const activeEditorRef = useRef<EditorHandle | null>(null);

  const sidebarVisible = useWorkbench((s) => s.sidebarVisible);
  const bottomPanelVisible = useWorkbench((s) => s.bottomPanelVisible);
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);
  const setBottomPanelTab = useWorkbench((s) => s.setBottomPanelTab);
  const toggleSidebar = useWorkbench((s) => s.toggleSidebar);
  const toggleBottomPanel = useWorkbench((s) => s.toggleBottomPanel);
  const setCommandPaletteOpen = useWorkbench((s) => s.setCommandPaletteOpen);
  const activeTabId = useWorkbench((s) => s.activeTabId);
  const closeTab = useWorkbench((s) => s.closeTab);
  const editorTabs = useWorkbench((s) => s.editorTabs);

  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const branch = useProject((s) => s.branch);
  const isGitRepo = useProject((s) => s.isGitRepo);
  const pushDiagnostic = useDiagnostics((s) => s.push);
  const problemsCount = useDiagnostics((s) => s.entries.length);
  const scheduledPostsCount = useSocial((s) => s.posts.length);
  const hasAgentKey = useAgents(
    (s) => (s.apiKeys[AnthropicProvider.id] ?? '').length > 0,
  );
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

  useEffect(() => {
    if (workspaceRoot) void openWorkspace(workspaceRoot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const stop = startSocialScheduler();
    return () => stop();
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
    const unsubscribePromise = subscribeToDevServerLogs(onLog);
    return () => {
      void unsubscribePromise.then((unsubscribe) => unsubscribe());
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
        run: () => setCommandPaletteOpen(true),
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
          if (activeTabId) closeTab(activeTabId);
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
            // eslint-disable-next-line no-console
            console.error('[forze] save failed', err);
          }
        },
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
          const lines = survival.breakdown
            .map((b) => `${b.delta >= 0 ? '+' : ''}${b.delta}  ${b.label}`)
            .join('\n');
          // eslint-disable-next-line no-alert
          window.alert(
            `Venture Survival Score: ${survival.score} (${survival.band})\n\n${lines}`,
          );
        },
      }),
      commands.register({
        id: 'workbench.action.onboarding.show',
        title: 'Re-run Onboarding Wizard',
        category: 'Forze',
        run: () => resetOnboarding(),
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
            // eslint-disable-next-line no-console
            console.info('[forze] MCP config copied to clipboard');
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[forze] clipboard write failed', err, snippet);
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
      { id: 'agents', title: 'Show Agents', keybindingId: 'workbench.view.agents' },
      { id: 'social', title: 'Show Social', keybindingId: 'workbench.view.social' },
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
  }, [
    setCommandPaletteOpen,
    toggleSidebar,
    toggleBottomPanel,
    setBottomPanelTab,
    setActiveActivity,
    activeTabId,
    closeTab,
    survival,
    resetOnboarding,
  ]);

  const registerActiveEditor = useCallback((handle: EditorHandle | null) => {
    activeEditorRef.current = handle;
  }, []);

  const insertSnippetIntoActiveEditor = useCallback((snippet: string) => {
    activeEditorRef.current?.insertAtCursor(snippet);
  }, []);

  return (
    <>
      <div className="workbench">
        <div className="workbench__topbar">
          <TopBar
            onOpenSettings={() => setActiveActivity('settings')}
            onToggleSidebar={toggleSidebar}
          />
        </div>

        <div className="workbench__rail">
          <ActivityBar />
        </div>

        <div className="workbench__main">
          <PanelGroup direction="horizontal" autoSaveId="forze.workbench.horizontal">
            {sidebarVisible && (
              <>
                <Panel
                  defaultSize={20}
                  minSize={12}
                  maxSize={40}
                  order={1}
                  id="sidebar"
                >
                  <Sidebar onInsertCode={insertSnippetIntoActiveEditor} />
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
                      <BottomPanel
                        logs={logs}
                        onClearLogs={() => setLogs([])}
                      />
                    </Panel>
                  </>
                )}
              </PanelGroup>
            </Panel>
          </PanelGroup>
        </div>

        <div className="workbench__commandbar">
          <CommandBar />
        </div>

        <div className="workbench__status">
          <StatusBar
            workspaceRoot={workspaceRoot}
            branch={branch}
            survivalScore={survival.score}
            survivalBand={survival.band}
            problemsCount={problemsCount}
            scheduledPostsCount={scheduledPostsCount}
            onOpenFolder={async () => {
              const picked = await pickFolder();
              if (picked) await openWorkspace(picked);
            }}
            onShowProblems={() => setBottomPanelTab('problems')}
            onShowScore={() => void commands.run('workbench.action.boardroom.simulate')}
            onShowSocial={() => setActiveActivity('social')}
          />
        </div>
      </div>
      <CommandPalette />
      <OnboardingWizard />
    </>
  );
}
