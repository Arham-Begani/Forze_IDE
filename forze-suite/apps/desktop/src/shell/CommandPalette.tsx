import { Command as CmdK } from 'cmdk';
import { useEffect, useState } from 'react';
import { commands, type Command } from '../workbench/commands';
import { useWorkbench } from '../workbench/store';

export default function CommandPalette(): JSX.Element | null {
  const open = useWorkbench((s) => s.commandPaletteOpen);
  const setOpen = useWorkbench((s) => s.setCommandPaletteOpen);
  const [items, setItems] = useState<Command[]>([]);

  useEffect(() => commands.subscribe(setItems), []);

  useEffect(() => {
    if (!open) return;
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      className="cmd-palette__overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <CmdK
        className="cmd-palette"
        label="Command palette"
        loop
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        <CmdK.Input autoFocus placeholder="Type a command…" />
        <CmdK.List className="cmd-palette__list">
          <CmdK.Empty className="cmd-palette__empty">
            No matching commands.
          </CmdK.Empty>
          {items
            .filter((item) => item.visibleInPalette !== false)
            .map((item) => (
              <CmdK.Item
                key={item.id}
                value={`${item.category ?? ''} ${item.title}`}
                className="cmd-palette__item"
                onSelect={() => {
                  setOpen(false);
                  void commands.run(item.id);
                }}
              >
                {item.category && (
                  <span style={{ color: 'var(--color-text-dim)' }}>
                    {item.category}:
                  </span>
                )}
                <span>{item.title}</span>
                {item.keybinding && (
                  <span className="cmd-palette__item-kbd">{item.keybinding}</span>
                )}
              </CmdK.Item>
            ))}
        </CmdK.List>
      </CmdK>
    </div>
  );
}
