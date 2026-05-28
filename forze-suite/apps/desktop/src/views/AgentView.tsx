import {
  Bot,
  Plus,
  Send,
  Square,
  Trash2,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnthropicProvider,
  GeminiProvider,
  PRESETS,
  findPreset,
  type Message,
  type Provider,
} from '@forze/agents';
import { useAgents, type AgentThread } from '../workbench/agentStore';
import { useWorkbench } from '../workbench/store';

const PROVIDERS: Provider[] = [
  AnthropicProvider.provider,
  GeminiProvider.provider,
];

function providerForId(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]!;
}

export default function AgentView(): JSX.Element {
  const threads = useAgents((s) => s.threads);
  const activeThreadId = useAgents((s) => s.activeThreadId);
  const apiKeys = useAgents((s) => s.apiKeys);
  const setApiKey = useAgents((s) => s.setApiKey);
  const createThread = useAgents((s) => s.createThread);
  const setActiveThread = useAgents((s) => s.setActiveThread);
  const deleteThread = useAgents((s) => s.deleteThread);
  const appendMessage = useAgents((s) => s.appendMessage);
  const appendToAssistant = useAgents((s) => s.appendToAssistant);
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  const newThread = useCallback(
    (providerId: string) => {
      const provider = providerForId(providerId);
      createThread({
        providerId,
        model: provider.models[0]!.id,
        presetId: 'build',
      });
    },
    [createThread],
  );

  useEffect(() => {
    if (threads.length === 0) newThread(AnthropicProvider.id);
  }, [threads.length, newThread]);

  const send = useCallback(async () => {
    if (!activeThread || streaming) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    const provider = providerForId(activeThread.providerId);
    const key = apiKeys[provider.id] ?? '';
    if (!key) {
      setError(`Add a ${provider.label} API key below to chat.`);
      return;
    }
    setError(null);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
    };
    appendMessage(activeThread.id, userMessage);
    setInput('');

    const preset = findPreset(activeThread.presetId);
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    try {
      const stream = provider.generate({
        model: activeThread.model,
        apiKey: key,
        systemPrompt: preset?.systemPrompt,
        messages: [...activeThread.messages, userMessage],
        signal: controller.signal,
        maxTokens: 4096,
      });
      for await (const chunk of stream) {
        if (chunk.delta) appendToAssistant(activeThread.id, chunk.delta);
        if (chunk.done) break;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        appendToAssistant(activeThread.id, '\n\n_[stream cancelled]_');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [activeThread, apiKeys, appendMessage, appendToAssistant, input, streaming]);

  const stopStream = () => abortRef.current?.abort();

  return (
    <div className="chat" style={{ padding: '0 8px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Bot size={16} strokeWidth={1.7} />
        <strong style={{ fontSize: 13 }}>Forze Agent</strong>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => newThread(activeThread?.providerId ?? AnthropicProvider.id)}
          title="New chat"
          style={{ marginLeft: 'auto', padding: 4 }}
        >
          <Plus size={12} />
        </button>
      </div>

      <ThreadStrip
        threads={threads}
        activeId={activeThreadId}
        onSelect={setActiveThread}
        onDelete={deleteThread}
      />

      {activeThread && (
        <ThreadControls
          thread={activeThread}
          onSwap={(providerId, model, presetId) => {
            useAgents.setState((state) => ({
              threads: state.threads.map((t) =>
                t.id === activeThread.id ? { ...t, providerId, model, presetId } : t,
              ),
            }));
          }}
        />
      )}

      {!apiKeys[activeThread?.providerId ?? AnthropicProvider.id] && (
        <div
          className="card"
          style={{
            background: 'var(--color-warn-soft)',
            borderColor: 'var(--color-warn)',
            padding: 10,
          }}
        >
          <div style={{ fontSize: 12, marginBottom: 6 }}>
            <KeyRound size={11} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
            Add a key for{' '}
            {providerForId(activeThread?.providerId ?? AnthropicProvider.id).label}
          </div>
          <input
            type="password"
            placeholder="paste key"
            onChange={(e) =>
              setApiKey(
                activeThread?.providerId ?? AnthropicProvider.id,
                e.target.value.trim(),
              )
            }
            style={{ width: '100%' }}
          />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setActiveActivity('settings')}
            style={{ marginTop: 6, fontSize: 11 }}
          >
            Open Settings →
          </button>
        </div>
      )}

      <MessageList thread={activeThread} streaming={streaming} />

      {error && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'flex-start',
            color: 'var(--color-danger)',
            fontSize: 12,
            padding: '8px 10px',
            background: 'var(--color-danger-soft)',
            borderRadius: 6,
            border: '1px solid var(--color-danger)',
          }}
        >
          <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={
            activeThread
              ? `Ask ${findPreset(activeThread.presetId)?.label ?? 'the agent'}…`
              : 'Start a new chat to begin'
          }
          rows={3}
          style={{ width: '100%', fontSize: 12, resize: 'vertical' }}
          disabled={streaming}
        />
        {streaming ? (
          <button type="button" onClick={stopStream} title="Stop" className="btn-ghost">
            <Square size={13} />
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={send}
            disabled={!input.trim()}
            title="Send (Enter)"
          >
            <Send size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function ThreadStrip({
  threads,
  activeId,
  onSelect,
  onDelete,
}: {
  threads: AgentThread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}): JSX.Element {
  if (threads.length === 0) return <></>;
  return (
    <div className="chat__threads">
      {threads.map((thread) => (
        <div
          key={thread.id}
          className={`chat__thread-row ${thread.id === activeId ? 'is-active' : ''}`}
          onClick={() => onSelect(thread.id)}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {thread.title || 'New chat'}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(thread.id);
            }}
            title="Delete"
            style={{ padding: 2, border: 'none', background: 'transparent' }}
          >
            <Trash2 size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ThreadControls({
  thread,
  onSwap,
}: {
  thread: AgentThread;
  onSwap: (providerId: string, model: string, presetId: string) => void;
}): JSX.Element {
  const provider = providerForId(thread.providerId);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      <select
        value={thread.providerId}
        onChange={(e) => {
          const next = providerForId(e.target.value);
          onSwap(next.id, next.models[0]!.id, thread.presetId);
        }}
        style={{ fontSize: 11 }}
      >
        {PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <select
        value={thread.model}
        onChange={(e) => onSwap(thread.providerId, e.target.value, thread.presetId)}
        style={{ fontSize: 11 }}
      >
        {provider.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <select
        value={thread.presetId}
        onChange={(e) => onSwap(thread.providerId, thread.model, e.target.value)}
        style={{ fontSize: 11, gridColumn: '1 / -1' }}
      >
        {PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label} — {preset.description}
          </option>
        ))}
      </select>
    </div>
  );
}

function MessageList({
  thread,
  streaming,
}: {
  thread: AgentThread | null;
  streaming: boolean;
}): JSX.Element {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [
    thread?.messages.length,
    thread?.messages[thread.messages.length - 1]?.content,
  ]);

  if (!thread || thread.messages.length === 0) {
    return (
      <div
        className="chat__messages"
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-dim)',
          fontSize: 11,
        }}
      >
        <Bot size={20} strokeWidth={1.3} />
        <span style={{ marginTop: 6 }}>Start a conversation</span>
      </div>
    );
  }

  return (
    <div ref={scrollerRef} className="chat__messages">
      {thread.messages.map((message) => (
        <div
          key={message.id}
          className={`chat__bubble ${
            message.role === 'user' ? 'chat__bubble--user' : ''
          }`}
        >
          <div className="chat__bubble-meta">
            {message.role === 'user' ? 'you' : 'agent'}
          </div>
          {message.content || (
            <em style={{ color: 'var(--color-text-dim)' }}>…</em>
          )}
        </div>
      ))}
      {streaming && (
        <div
          style={{
            padding: '4px 6px',
            fontSize: 11,
            color: 'var(--color-text-dim)',
          }}
        >
          streaming…
        </div>
      )}
    </div>
  );
}
