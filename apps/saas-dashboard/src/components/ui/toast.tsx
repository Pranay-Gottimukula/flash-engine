'use client';

import {
  createContext, useCallback, useContext, useEffect,
  useState, type ReactNode,
} from 'react';
import { Check, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id:      string;
  message: string;
  variant: ToastVariant;
}

export interface ToastAPI {
  success: (message: string) => void;
  error:   (message: string) => void;
  info:    (message: string) => void;
}

const ToastContext = createContext<ToastAPI>({
  success: () => {},
  error:   () => {},
  info:    () => {},
});

export function useToast(): ToastAPI {
  return useContext(ToastContext);
}

// ── Variant styles ────────────────────────────────────────────────────────────

const variantStyles: Record<ToastVariant, { outer: string; icon: ReactNode }> = {
  success: {
    outer: 'border-green-500/20 bg-green-500/10 text-green-400',
    icon:  <Check   size={15} className="shrink-0" />,
  },
  error: {
    outer: 'border-red-500/20 bg-red-500/10 text-red-400',
    icon:  <XCircle size={15} className="shrink-0" />,
  },
  info: {
    outer: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
    icon:  <Info    size={15} className="shrink-0" />,
  },
};

// ── Single toast item ─────────────────────────────────────────────────────────

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), 3000);
    return () => clearTimeout(t);
  }, [item.id, onDismiss]);

  const { outer, icon } = variantStyles[item.variant];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-w-[240px] max-w-sm items-center gap-3',
        'rounded-lg border px-4 py-3 text-sm',
        'toast-slide-in',
        outer,
      )}
    >
      {icon}
      <span className="flex-1">{item.message}</span>
      <button
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 opacity-50 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current focus-visible:opacity-100"
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((message: string, variant: ToastVariant) => {
    setToasts(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, message, variant },
    ]);
  }, []);

  const api: ToastAPI = {
    success: (msg) => push(msg, 'success'),
    error:   (msg) => push(msg, 'error'),
    info:    (msg) => push(msg, 'info'),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(item => (
          <ToastItem key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
