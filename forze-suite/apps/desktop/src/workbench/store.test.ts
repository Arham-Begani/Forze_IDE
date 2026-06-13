import { describe, it, expect } from 'vitest';
import { sanitizePersisted } from './store';

/**
 * sanitizePersisted is the self-healing path that runs on every rehydrate: a
 * snapshot saved by an older build (referencing a since-removed panel) must
 * never reach a PANELS[id] lookup and blank the window. These tests pin that
 * contract.
 */
describe('sanitizePersisted', () => {
  it('resets an unknown activeActivity to explorer', () => {
    expect(sanitizePersisted({ activeActivity: 'marketplace' as never }).activeActivity).toBe(
      'explorer',
    );
  });

  it('keeps a valid activeActivity', () => {
    expect(sanitizePersisted({ activeActivity: 'kanban' }).activeActivity).toBe('kanban');
  });

  it('clears a right panel that points at a removed page', () => {
    const out = sanitizePersisted({
      rightPanel: 'ad-studio' as never,
      rightSidebarVisible: true,
    });
    expect(out.rightPanel).toBeNull();
    expect(out.rightSidebarVisible).toBe(false);
  });

  it('falls back to the terminal tab for an unknown bottom-panel tab', () => {
    expect(sanitizePersisted({ bottomPanelTab: 'debugger' as never }).bottomPanelTab).toBe(
      'terminal',
    );
  });

  it('drops editor tabs that reference a removed page and self-heals to Welcome', () => {
    const out = sanitizePersisted({
      editorTabs: [{ id: 'page:ad-studio', title: 'Ad Studio', filePath: null, language: 'page', isDirty: false, pageId: 'ad-studio' as never }],
      activeTabId: 'page:ad-studio',
    });
    expect(out.editorTabs).toHaveLength(1);
    expect(out.editorTabs?.[0]?.id).toBe('welcome');
    expect(out.activeTabId).toBe('welcome');
  });

  it('repoints activeTabId when it no longer matches any tab', () => {
    const out = sanitizePersisted({
      editorTabs: [
        { id: 'a', title: 'A', filePath: null, language: 'typescript', isDirty: false },
      ],
      activeTabId: 'ghost',
    });
    expect(out.activeTabId).toBe('a');
  });

  it('preserves a healthy snapshot untouched', () => {
    const snap = {
      activeActivity: 'explorer' as const,
      rightPanel: null,
      bottomPanelTab: 'output' as const,
      editorTabs: [
        { id: 'welcome', title: 'Welcome', filePath: null, language: 'markdown', isDirty: false },
      ],
      activeTabId: 'welcome',
    };
    const out = sanitizePersisted(snap);
    expect(out.activeActivity).toBe('explorer');
    expect(out.bottomPanelTab).toBe('output');
    expect(out.activeTabId).toBe('welcome');
  });
});
