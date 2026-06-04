import { useWorkbench } from './store';
import { useAssistant } from './assistantStore';

/**
 * The single entry point for "Ask Forze anything". Every surface — the command
 * bar, the Welcome launchpad, starter chips — funnels through here so the flow
 * behaves identically everywhere: open the floating Forze Assistant and stream
 * the answer into it (the assistant can also navigate the IDE for you).
 *
 * Reads state via `getState()` so it can be called from event handlers, effects,
 * or anywhere outside React render.
 */
export async function askForze(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  useWorkbench.getState().setAssistantOpen(true);
  await useAssistant.getState().send(trimmed);
}
