import { ArrowUp, ChevronDown, Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useWorkbench } from '../workbench/store';
import { askForze } from '../workbench/ask';
import { activeProvider } from '../lib/ai';
import { defaultModelFor } from '../workbench/aiConfig';

/**
 * The persistent "Ask Forze anything" bar — always visible above the status
 * bar. Sending here opens the floating Forze Assistant and streams the answer
 * into it. All of the send logic lives in `askForze` so this bar, the Welcome
 * launchpad, and starter chips behave identically.
 */
export default function CommandBar(): JSX.Element {
  const [input, setInput] = useState('');
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);

  const provider = activeProvider();
  const modelLabel = provider
    ? provider.models.find((m) => m.id === defaultModelFor(provider.id))?.label ??
      provider.label
    : 'Connect a model';

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
        title="Change model and keys in Settings"
        onClick={() => setActiveActivity('settings')}
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
