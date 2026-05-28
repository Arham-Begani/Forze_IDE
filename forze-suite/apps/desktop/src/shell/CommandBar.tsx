import { ArrowUp, ChevronDown, Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';
import { AnthropicProvider, GeminiProvider, findPreset, type Message } from '@forze/agents';
import { useAgents } from '../workbench/agentStore';
import { useWorkbench } from '../workbench/store';

/**
 * The persistent "Ask Forze anything" bar — always visible above the status
 * bar. Sending here creates (or reuses) a default thread on the active
 * provider, switches the bottom panel to Agent, and streams the response.
 */
export default function CommandBar(): JSX.Element {
  const [input, setInput] = useState('');
  const threads = useAgents((s) => s.threads);
  const activeThreadId = useAgents((s) => s.activeThreadId);
  const createThread = useAgents((s) => s.createThread);
  const setActiveThread = useAgents((s) => s.setActiveThread);
  const appendMessage = useAgents((s) => s.appendMessage);
  const appendToAssistant = useAgents((s) => s.appendToAssistant);
  const apiKeys = useAgents((s) => s.apiKeys);
  const setBottomPanelTab = useWorkbench((s) => s.setBottomPanelTab);

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;
  const providerId = activeThread?.providerId ?? 'anthropic';
  const provider = providerId === 'gemini' ? GeminiProvider : AnthropicProvider;
  const modelLabel =
    provider.models.find((m) => m.id === activeThread?.model)?.label ??
    provider.models[0]!.label;

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    let thread = activeThread;
    if (!thread) {
      const id = createThread({
        providerId: AnthropicProvider.id,
        model: AnthropicProvider.models[0]!.id,
        presetId: 'build',
      });
      thread = useAgents.getState().threads.find((t) => t.id === id) ?? null;
    }
    if (!thread) return;

    const providerForCall =
      thread.providerId === 'gemini' ? GeminiProvider : AnthropicProvider;
    const key = apiKeys[providerForCall.id] ?? '';
    setBottomPanelTab('agent');

    if (!key) {
      appendMessage(thread.id, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Add a ${providerForCall.label} API key in Settings → Agent providers, then send again.`,
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
    appendMessage(thread.id, userMessage);
    setInput('');

    const preset = findPreset(thread.presetId);
    try {
      const stream = providerForCall.generate({
        model: thread.model,
        apiKey: key,
        systemPrompt: preset?.systemPrompt,
        messages: [...thread.messages, userMessage],
        maxTokens: 4096,
      });
      for await (const chunk of stream) {
        if (chunk.delta) appendToAssistant(thread.id, chunk.delta);
        if (chunk.done) break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendToAssistant(thread.id, `\n\n_[stream failed: ${message}]_`);
    }
  }, [
    activeThread,
    appendMessage,
    appendToAssistant,
    apiKeys,
    createThread,
    input,
    setBottomPanelTab,
  ]);

  return (
    <div className="commandbar">
      <div className="commandbar__input-wrap">
        <Sparkles
          size={13}
          strokeWidth={1.6}
          style={{ color: 'var(--color-accent-bright)' }}
        />
        <input
          className="commandbar__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Ask Forze anything"
          aria-label="Ask Forze"
        />
        <span className="commandbar__hint">
          <kbd>↩</kbd> to send
        </span>
      </div>
      <button
        type="button"
        className="commandbar__model-pill"
        title="Change model and preset in the Agents panel"
        onClick={() => {
          setBottomPanelTab('agent');
          if (!activeThread) {
            createThread({
              providerId: AnthropicProvider.id,
              model: AnthropicProvider.models[0]!.id,
              presetId: 'build',
            });
          }
        }}
      >
        {modelLabel}
        <ChevronDown size={11} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className="commandbar__send"
        onClick={send}
        disabled={!input.trim()}
        title="Send (Enter)"
        aria-label="Send"
      >
        <ArrowUp size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
