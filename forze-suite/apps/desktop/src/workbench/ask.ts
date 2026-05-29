import { findPreset, type Message } from '@forze/agents';
import { useAgents } from './agentStore';
import { useWorkbench } from './store';
import {
  DEFAULT_PROVIDER_ID,
  defaultModelFor,
  isProviderReady,
  providerForId,
  resolveApiKey,
} from './aiConfig';

/**
 * The single entry point for "Ask Forze anything". Every surface — the command
 * bar, the Welcome launchpad, starter chips, inline actions — funnels through
 * here so the vibe-coding flow behaves identically everywhere:
 *
 *   1. reuse the active thread (or spin up a fresh `build` thread)
 *   2. focus the Agent panel so the response is visible
 *   3. if no API key is set, drop a friendly hint instead of failing silently
 *   4. stream the assistant reply token-by-token into the thread
 *
 * It reads state via `getState()` (not hooks) so it can be called from event
 * handlers, effects, or anywhere outside React render.
 */
export async function askForze(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const agents = useAgents.getState();
  const workbench = useWorkbench.getState();

  let thread = agents.threads.find((t) => t.id === agents.activeThreadId) ?? null;
  if (!thread) {
    const id = agents.createThread({
      providerId: DEFAULT_PROVIDER_ID,
      model: defaultModelFor(DEFAULT_PROVIDER_ID),
      presetId: 'build',
    });
    thread = useAgents.getState().threads.find((t) => t.id === id) ?? null;
  }
  if (!thread) return;

  const provider = providerForId(thread.providerId);
  const key = resolveApiKey(provider.id, agents.apiKeys);

  // Surface the conversation immediately so the user sees something happen.
  workbench.setBottomPanelTab('agent');

  if (!isProviderReady(provider.id, agents.apiKeys)) {
    agents.appendMessage(thread.id, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Add a ${provider.label} API key in Settings → Agent providers, then send again.`,
      createdAt: Date.now(),
    });
    return;
  }

  const userMessage: Message = {
    id: crypto.randomUUID(),
    role: 'user',
    content: trimmed,
    createdAt: Date.now(),
  };
  agents.appendMessage(thread.id, userMessage);

  const preset = findPreset(thread.presetId);
  try {
    const stream = provider.generate({
      model: thread.model,
      apiKey: key,
      systemPrompt: preset?.systemPrompt,
      messages: [...thread.messages, userMessage],
      maxTokens: 4096,
    });
    for await (const chunk of stream) {
      if (chunk.delta) agents.appendToAssistant(thread.id, chunk.delta);
      if (chunk.done) break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    agents.appendToAssistant(thread.id, `\n\n_[stream failed: ${message}]_`);
  } finally {
    agents.finaliseAssistant(thread.id);
  }
}
