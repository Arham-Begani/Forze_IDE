import { create } from 'zustand';
import { useEffect } from 'react';

export interface Toast {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'warn' | 'error';
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: Toast['tone']) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, tone = 'info') =>
    set((s) => ({
      toasts: [...s.toasts.slice(-3), { id: `${Date.now()}-${Math.random()}`, message, tone }],
    })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire a toast from anywhere (event handlers, non-component code). */
export function toast(message: string, tone: Toast['tone'] = 'info'): void {
  useToasts.getState().push(message, tone);
}

function ToastItem({ t }: { t: Toast }): JSX.Element {
  const dismiss = useToasts((s) => s.dismiss);
  useEffect(() => {
    const id = window.setTimeout(() => dismiss(t.id), 3200);
    return () => window.clearTimeout(id);
  }, [t.id, dismiss]);
  return (
    <div className={`toast toast--${t.tone}`} role="status" onClick={() => dismiss(t.id)}>
      <span className="toast__dot" />
      <span>{t.message}</span>
    </div>
  );
}

export function ToastHost(): JSX.Element {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}
