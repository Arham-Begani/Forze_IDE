/**
 * Central command registry. Any view can register a command and any UI
 * surface (command palette, menus, keybindings) consumes from the same list.
 */

export interface Command {
  id: string;
  title: string;
  category?: string;
  /** Display-only keybinding hint (e.g., "Ctrl+Shift+P"). */
  keybinding?: string;
  /** Set false to hide from palette. Still callable by id. */
  visibleInPalette?: boolean;
  run: () => void | Promise<void>;
}

type Listener = (commands: Command[]) => void;

class CommandRegistry {
  private commands = new Map<string, Command>();
  private listeners = new Set<Listener>();

  register(command: Command): () => void {
    this.commands.set(command.id, command);
    this.emit();
    return () => {
      this.commands.delete(command.id);
      this.emit();
    };
  }

  unregister(id: string): void {
    if (this.commands.delete(id)) this.emit();
  }

  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  async run(id: string): Promise<void> {
    const command = this.commands.get(id);
    if (!command) {
      // eslint-disable-next-line no-console
      console.warn(`[forze] unknown command: ${id}`);
      return;
    }
    await command.run();
  }

  list(): Command[] {
    return Array.from(this.commands.values()).sort((a, b) => {
      const ca = a.category ?? '';
      const cb = b.category ?? '';
      if (ca !== cb) return ca.localeCompare(cb);
      return a.title.localeCompare(b.title);
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.list());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.list();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const commands = new CommandRegistry();
