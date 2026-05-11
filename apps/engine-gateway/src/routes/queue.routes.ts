// apps/engine-gateway/src/routes/queue.routes.ts

import { Router }          from 'express';
import { joinQueue, verifyToken, getQueueStatus, getQueueInfo } from '../controllers/queue.controller';
import { releaseTicket }                 from '../controllers/release.controller';
import { requireEventOwnership }         from '../middleware/event-ownership.middleware';
import { queueJoinLimiter, queueStatusLimiter, queueInfoLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// POST /api/queue/join
// Body: { publicKey: string }
router.post('/join',    queueJoinLimiter, joinQueue);
router.get('/status',   queueStatusLimiter, getQueueStatus);
router.get('/info',     queueInfoLimiter, getQueueInfo);
router.post('/verify',  verifyToken);
// requireEventOwnership runs first: validates x-public-key maps to an ACTIVE
// event and attaches eventData to res.locals so releaseTicket doesn't re-fetch.
router.post('/release', requireEventOwnership, releaseTicket);

export default router;
