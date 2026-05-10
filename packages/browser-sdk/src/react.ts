import { useState, useEffect, useCallback, useRef } from 'react';
import { FlashQueue } from './flash-queue';
import type {
  FlashQueueOptions,
  QueueState,
  ErrorPayload,
} from './types';

export interface UseFlashQueueOptions extends FlashQueueOptions {
  autoJoin?: boolean;
}

export interface UseFlashQueueReturn {
  status: QueueState;
  position: number | null;
  estimatedWaitMs: number | null;
  token: string | null;
  error: ErrorPayload | null;
  ticketExpiring: boolean;
  join: () => void;
  destroy: () => void;
}

const INITIAL_STATE = {
  status: 'idle' as QueueState,
  position: null as number | null,
  estimatedWaitMs: null as number | null,
  token: null as string | null,
  error: null as ErrorPayload | null,
  ticketExpiring: false,
};

export function useFlashQueue(options: UseFlashQueueOptions): UseFlashQueueReturn {
  const queueRef = useRef<FlashQueue | null>(null);
  // Track publicKey+userId to detect identity changes
  const identityRef = useRef({ publicKey: options.publicKey, userId: options.userId });

  const [status, setStatus] = useState<QueueState>(INITIAL_STATE.status);
  const [position, setPosition] = useState<number | null>(INITIAL_STATE.position);
  const [estimatedWaitMs, setEstimatedWaitMs] = useState<number | null>(INITIAL_STATE.estimatedWaitMs);
  const [token, setToken] = useState<string | null>(INITIAL_STATE.token);
  const [error, setError] = useState<ErrorPayload | null>(INITIAL_STATE.error);
  const [ticketExpiring, setTicketExpiring] = useState(INITIAL_STATE.ticketExpiring);

  // Keep a stable ref to options so the join callback doesn't need options in its dep array
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const resetState = useCallback(() => {
    setStatus(INITIAL_STATE.status);
    setPosition(INITIAL_STATE.position);
    setEstimatedWaitMs(INITIAL_STATE.estimatedWaitMs);
    setToken(INITIAL_STATE.token);
    setError(INITIAL_STATE.error);
    setTicketExpiring(INITIAL_STATE.ticketExpiring);
  }, []);

  const createQueue = useCallback(() => {
    const q = new FlashQueue(optionsRef.current);

    q.on('queued', ({ position: pos, estimatedWaitMs: wait }) => {
      setStatus('queued');
      setPosition(pos);
      setEstimatedWaitMs(wait);
    });

    q.on('position', ({ position: pos, estimatedWaitMs: wait }) => {
      setPosition(pos);
      setEstimatedWaitMs(wait);
    });

    q.on('won', ({ token: t }) => {
      setStatus('won');
      setToken(t);
    });

    q.on('sold_out', () => {
      setStatus('sold_out');
    });

    q.on('paused', () => {
      setStatus('paused');
    });

    q.on('ticket_expiring', () => {
      setTicketExpiring(true);
    });

    q.on('error', (payload) => {
      setStatus('error');
      setError(payload);
    });

    return q;
  }, []); // no deps — uses optionsRef.current at call time

  useEffect(() => {
    queueRef.current = createQueue();

    if (optionsRef.current.autoJoin) {
      queueRef.current.join();
    }

    return () => {
      queueRef.current?.destroy();
      queueRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally mount-only

  // Recreate on identity change
  useEffect(() => {
    const prev = identityRef.current;
    if (prev.publicKey === options.publicKey && prev.userId === options.userId) return;

    identityRef.current = { publicKey: options.publicKey, userId: options.userId };

    queueRef.current?.destroy();
    resetState();
    queueRef.current = createQueue();

    if (optionsRef.current.autoJoin) {
      queueRef.current.join();
    }
  }, [options.publicKey, options.userId, createQueue, resetState]);

  const join = useCallback(() => {
    queueRef.current?.join();
  }, []);

  const destroy = useCallback(() => {
    queueRef.current?.destroy();
    queueRef.current = null;
    resetState();
  }, [resetState]);

  return { status, position, estimatedWaitMs, token, error, ticketExpiring, join, destroy };
}
