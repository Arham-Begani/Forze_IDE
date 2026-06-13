import { create } from 'zustand';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * In-app modal system replacing native `window.alert/confirm/prompt`, which
 * render as bare OS chrome inside the borderless Tauri webview and block the
 * main thread. Like the toast store, the API is imperative so it can be called
 * from non-React code (e.g. lib/dialog.ts) as well as event handlers.
 *
 *   showModal({ title, body })                  → informational, resolves void
 *   await confirmModal({ message, danger })     → Promise<boolean>
 *   await promptModal({ message, initial })     → Promise<string | null>
 *
 * A single modal is active at a time (sufficient for this app); a new request
 * replaces any open one. Confirm/prompt requests resolve their promise on close
 * so a pending caller never hangs.
 */

type ModalKind = 'info' | 'confirm' | 'prompt';

interface ModalConfig {
  kind: ModalKind;
  title: string;
  body: ReactNode;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  placeholder: string;
  inputValue: string;
  resolve: ((value: unknown) => void) | null;
}

interface ModalState extends ModalConfig {
  open: boolean;
  show: (config: ModalConfig) => void;
  setInput: (value: string) => void;
  /** Close, resolving any pending confirm/prompt promise with `result`. */
  close: (result: unknown) => void;
}

const CLOSED: ModalConfig = {
  kind: 'info',
  title: '',
  body: null,
  message: '',
  confirmLabel: 'Close',
  cancelLabel: 'Cancel',
  danger: false,
  placeholder: '',
  inputValue: '',
  resolve: null,
};

export const useModalStore = create<ModalState>((set, get) => ({
  ...CLOSED,
  open: false,
  show: (config) => {
    // Resolve a previous pending modal (cancelled) before replacing it.
    const prev = get().resolve;
    if (prev) prev(get().kind === 'confirm' ? false : null);
    set({ open: true, ...config });
  },
  setInput: (inputValue) => set({ inputValue }),
  close: (result) => {
    const { resolve } = get();
    set({ open: false, resolve: null, body: null });
    if (resolve) resolve(result);
  },
}));

export function showModal(opts: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
}): void {
  useModalStore.getState().show({
    ...CLOSED,
    kind: 'info',
    title: opts.title,
    body: opts.body,
    confirmLabel: opts.confirmLabel ?? 'Close',
  });
}

export function confirmModal(opts: {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    useModalStore.getState().show({
      ...CLOSED,
      kind: 'confirm',
      title: opts.title ?? 'Confirm',
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      danger: opts.danger ?? false,
      resolve: (value) => resolve(value === true),
    });
  });
}

export function promptModal(opts: {
  title?: string;
  message?: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    useModalStore.getState().show({
      ...CLOSED,
      kind: 'prompt',
      title: opts.title ?? 'Input',
      message: opts.message ?? '',
      placeholder: opts.placeholder ?? '',
      inputValue: opts.initial ?? '',
      confirmLabel: opts.confirmLabel ?? 'OK',
      resolve: (value) => resolve(typeof value === 'string' ? value : null),
    });
  });
}

export function ModalHost(): JSX.Element | null {
  const open = useModalStore((s) => s.open);
  const kind = useModalStore((s) => s.kind);
  const title = useModalStore((s) => s.title);
  const body = useModalStore((s) => s.body);
  const message = useModalStore((s) => s.message);
  const confirmLabel = useModalStore((s) => s.confirmLabel);
  const cancelLabel = useModalStore((s) => s.cancelLabel);
  const danger = useModalStore((s) => s.danger);
  const placeholder = useModalStore((s) => s.placeholder);
  const inputValue = useModalStore((s) => s.inputValue);
  const setInput = useModalStore((s) => s.setInput);
  const close = useModalStore((s) => s.close);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  // Cancel value differs by kind: false for confirm, null for prompt, void info.
  const cancelValue = kind === 'confirm' ? false : null;
  const accept = (): void => close(kind === 'prompt' ? inputValue : true);

  useEffect(() => {
    if (!open) return;
    // Focus the field (prompt) or the primary action so Enter/Esc just work.
    const id = window.requestAnimationFrame(() => {
      if (kind === 'prompt') inputRef.current?.focus();
      else confirmRef.current?.focus();
    });
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(cancelValue);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close(cancelValue);
      }}
    >
      <div
        className={`modal${danger ? ' modal--danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal__title">{title}</div>
        <div className="modal__body">
          {kind === 'info' ? (
            body
          ) : kind === 'prompt' ? (
            <>
              {message && <p className="modal__message">{message}</p>}
              <input
                ref={inputRef}
                className="modal__input"
                value={inputValue}
                placeholder={placeholder}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    accept();
                  }
                }}
              />
            </>
          ) : (
            <p className="modal__message">{message}</p>
          )}
        </div>
        <div className="modal__actions">
          {kind !== 'info' && (
            <button className="btn-ghost" type="button" onClick={() => close(cancelValue)}>
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            className={danger ? 'btn-danger' : 'btn-primary'}
            type="button"
            onClick={() => (kind === 'info' ? close(undefined) : accept())}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
