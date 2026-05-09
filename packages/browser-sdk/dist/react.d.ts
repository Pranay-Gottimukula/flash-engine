import { a as FlashQueueOptions, Q as QueueState, b as ErrorPayload } from './types-nfqu9WN5.js';

interface UseFlashQueueOptions extends FlashQueueOptions {
    autoJoin?: boolean;
}
interface UseFlashQueueReturn {
    status: QueueState;
    position: number | null;
    estimatedWaitMs: number | null;
    token: string | null;
    error: ErrorPayload | null;
    ticketExpiring: boolean;
    join: () => void;
    destroy: () => void;
}
declare function useFlashQueue(options: UseFlashQueueOptions): UseFlashQueueReturn;

export { type UseFlashQueueOptions, type UseFlashQueueReturn, useFlashQueue };
