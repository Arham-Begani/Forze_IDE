import { useEffect } from 'react';
import { commands } from './commands';

/**
 * VS Code-compatible keybinding scheme. We deliberately match Ctrl+P,
 * Ctrl+Shift+P, Ctrl+`, Ctrl+B, Ctrl+J etc. so muscle memory transfers.
 *
 * Format: "ctrl+shift+p", "ctrl+`", "ctrl+s". Modifiers are lowercased.
 * Key matching is case-insensitive on event.key.
 */

interface Binding {
  combo: string;
  commandId: string;
}

const DEFAULT_BINDINGS: Binding[] = [
  { combo: 'ctrl+shift+p', commandId: 'workbench.action.showCommands' },
  { combo: 'ctrl+p', commandId: 'workbench.action.quickOpen' },
  { combo: 'ctrl+b', commandId: 'workbench.action.toggleSidebar' },
  { combo: 'ctrl+j', commandId: 'workbench.action.toggleBottomPanel' },
  { combo: 'ctrl+`', commandId: 'workbench.action.terminal.toggle' },
  { combo: 'ctrl+shift+`', commandId: 'workbench.action.terminal.toggle' },
  { combo: 'ctrl+shift+m', commandId: 'workbench.action.problems.focus' },
  { combo: 'ctrl+shift+u', commandId: 'workbench.action.output.focus' },
  { combo: 'ctrl+shift+e', commandId: 'workbench.view.explorer' },
  { combo: 'ctrl+shift+g', commandId: 'workbench.view.scm' },
  { combo: 'ctrl+shift+a', commandId: 'workbench.view.agents' },
  { combo: 'ctrl+s', commandId: 'workbench.action.files.save' },
  { combo: 'ctrl+w', commandId: 'workbench.action.closeActiveEditor' },
  { combo: 'shift+alt+f', commandId: 'editor.action.formatDocument' },
];

function comboFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('ctrl');
  if (event.shiftKey) parts.push('shift');
  if (event.altKey) parts.push('alt');
  const key = event.key.toLowerCase();
  if (key !== 'control' && key !== 'shift' && key !== 'alt' && key !== 'meta') {
    parts.push(key);
  }
  return parts.join('+');
}

export function useKeybindings(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const combo = comboFromEvent(event);
      const binding = DEFAULT_BINDINGS.find((b) => b.combo === combo);
      if (!binding) return;
      const target = event.target as HTMLElement | null;
      const isInEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      // Allow Ctrl+S inside Monaco/inputs (we want save to fire there), but
      // not Ctrl+P quick-open if the user is typing in a search box. Coarse
      // rule: only swallow Ctrl+P / Ctrl+Shift+P / Ctrl+B / Ctrl+J / Ctrl+`
      // unconditionally; the rest defer when typing.
      const swallowAlways = new Set([
        'ctrl+shift+p',
        'ctrl+p',
        'ctrl+b',
        'ctrl+j',
        'ctrl+`',
        'ctrl+shift+`',
        'shift+alt+f', // Format Document must fire from inside the editor.
      ]);
      if (!swallowAlways.has(combo) && isInEditable && combo !== 'ctrl+s') return;
      event.preventDefault();
      void commands.run(binding.commandId);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

export function keybindingHint(commandId: string): string | undefined {
  const binding = DEFAULT_BINDINGS.find((b) => b.commandId === commandId);
  if (!binding) return undefined;
  return binding.combo
    .split('+')
    .map((part) => (part === 'ctrl' ? 'Ctrl' : part === 'shift' ? 'Shift' : part === 'alt' ? 'Alt' : part === '`' ? '`' : part.length === 1 ? part.toUpperCase() : part))
    .join('+');
}
