import { Bot, KeyRound, Send, Sparkles, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useWorkbench } from '../workbench/store';
import { useAssistant } from '../workbench/assistantStore';
import { activeProvider } from '../lib/ai';
import { pendoTrack } from '../lib/pendoTrack';
import { QUICK_DESTINATIONS, findDestination } from '../lib/assistantNav';

/**
 * The Forze Assistant: a dark, floating chat bubble (bottom-right) that helps
 * the user decide what to do next and can actually *drive* the IDE — it opens
 * the Agent Manager, Social, Settings, the terminal, etc. on request. All the
 * conversation/engine state lives in `assistantStore`; this is just the surface.
 */
export default function FloatingAssistant(): JSX.Element {
  const open = useWorkbench((s) => s.assistantOpen);
  const setAssistantOpen = useWorkbench((s) => s.setAssistantOpen);
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);

  const messages = useAssistant((s) => s.messages);
  const streaming = useAssistant((s) => s.streaming);
  const send = useAssistant((s) => s.send);
  const stop = useAssistant((s) => s.stop);
  const pushNote = useAssistant((s) => s.pushNote);
  const pendingActions = useAssistant((s) => s.pendingActions);
  const confirmAction = useAssistant((s) => s.confirmAction);
  const dismissAction = useAssistant((s) => s.dismissAction);

  const [input, setInput] = useState('');
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const provider = activeProvider();

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, streaming]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    pendoTrack('assistant_message_sent', {
      message_length: text.length,
      conversation_length: messages.length,
      has_ai_provider: !!provider,
    });
    void send(text);
  };

  // A quick chip opens a destination instantly (no model round-trip).
  const quickOpen = (id: string) => {
    const dest = findDestination(id);
    if (!dest) return;
    void dest.run();
    pushNote(`Opened ${dest.label}.`);
  };

  if (!open) {
    return (
      <button
        type="button"
        className="fassist__bubble"
        onClick={() => setAssistantOpen(true)}
        aria-label="Open Forze Assistant"
        title="Forze Assistant"
      >
        <Sparkles size={20} strokeWidth={1.8} />
      </button>
    );
  }

  const quickChips = QUICK_DESTINATIONS.map((id) => findDestination(id)).filter(
    (d): d is NonNullable<typeof d> => !!d,
  );

  return (
    <div className="fassist" role="dialog" aria-label="Forze Assistant">
      <div className="fassist__head">
        <span className="fassist__avatar">
          <Bot size={16} strokeWidth={1.8} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="fassist__title">Forze Assistant</div>
          <div className="fassist__subtitle">I can navigate and run things for you</div>
        </div>
        <button
          type="button"
          className="fassist__icon-btn"
          onClick={() => setAssistantOpen(false)}
          aria-label="Close"
          title="Close"
        >
          <X size={15} />
        </button>
      </div>

      <div ref={scrollerRef} className="fassist__messages">
        {messages.map((m, i) => (
          <div key={i} className={`fassist__msg fassist__msg--${m.role}`}>
            {m.content || <span className="fassist__typing">…</span>}
          </div>
        ))}
        {streaming && <div className="fassist__streaming">working…</div>}
      </div>

      {!provider && (
        <button
          type="button"
          className="fassist__keyhint"
          onClick={() => {
            setActiveActivity('settings');
            setAssistantOpen(false);
          }}
        >
          <KeyRound size={12} /> Add an AI key in Settings to chat
        </button>
      )}

      {pendingActions.length > 0 && (
        <div className="fassist__confirms">
          {pendingActions.map((a) => (
            <div key={a.id} className="fassist__confirm">
              <span className="fassist__confirm-label">{a.label}</span>
              <div className="fassist__confirm-btns">
                <button
                  type="button"
                  className="fassist__confirm-yes"
                  onClick={() => void confirmAction(a.id)}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="fassist__confirm-no"
                  onClick={() => dismissAction(a.id)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="fassist__chips">
        {quickChips.map((d) => (
          <button
            key={d.id}
            type="button"
            className="fassist__chip"
            onClick={() => quickOpen(d.id)}
            title={d.blurb}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="fassist__composer">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask Forze, or tell me where to go…"
          rows={1}
          className="fassist__input"
          disabled={streaming}
        />
        {streaming ? (
          <button type="button" className="fassist__send" onClick={stop} title="Stop">
            <Square size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="fassist__send"
            onClick={submit}
            disabled={!input.trim()}
            title="Send"
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
