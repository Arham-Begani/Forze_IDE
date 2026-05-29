import { ArrowUp, ChevronDown, Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useAgents } from '../workbench/agentStore';
import { useWorkbench } from '../workbench/store';
import { askForze } from '../workbench/ask';
import {
  DEFAULT_PROVIDER_ID,
  defaultModelFor,
  providerForId,
} from '../workbench/aiConfig';

/**
 * The persistent "Ask Forze anything" bar — always visible above the status
 * bar. This is the integrated AI surface: sending here creates (or reuses) a
 * thread, opens the Agent panel, and streams the response. All of the send
 * logic lives in `askForze` so this bar, the Welcome launchpad, and starter
 * chips behave identically.
 */
export default function CommandBar(): JSX.Element {
  const [input, setInput] = useState('');
  const threads = useAgents((s) => s.threads);
  const activeThreadId = useAgents((s) => s.activeThreadId);
  const createThread = useAgents((s) => s.createThread);
  const setBottomPanelTab = useWorkbench((s) => s.setBottomPanelTab);

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;
  const providerId = activeThread?.providerId ?? DEFAULT_PROVIDER_ID;
  const provider = providerForId(providerId);
  const modelLabel =
    provider.models.find((m) => m.id === activeThread?.model)?.label ??
    provider.models[0]!.label;

  const send = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput('');
    void askForze(trimmed);
  }, [input]);

  return (
    <div className="commandbar">
      <div className="commandbar__input-wrap">
        <Sparkles
          size={15}
          strokeWidth={1.6}
          className="commandbar__spark"
        />
        <input
          className="commandbar__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask Forze to build, fix, explain, or ship anything…"
          aria-label="Ask Forze"
        />
        <span className="commandbar__hint">
          <kbd>↩</kbd> send
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
              providerId: DEFAULT_PROVIDER_ID,
              model: defaultModelFor(DEFAULT_PROVIDER_ID),
              presetId: 'build',
            });
          }
        }}
      >
        {modelLabel}
        <ChevronDown size={12} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className="commandbar__send"
        onClick={send}
        disabled={!input.trim()}
        title="Send (Enter)"
        aria-label="Send"
      >
        <ArrowUp size={15} strokeWidth={2.2} />
      </button>
    </div>
  );
}
