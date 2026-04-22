// apps/engine-gateway/src/routes/queue.routes.ts

import { Router }          from 'express';
import { joinQueue, verifyToken }        from '../controllers/queue.controller';
import { releaseTicket }                 from '../controllers/release.controller';
import { requireEventOwnership }         from '../middleware/event-ownership.middleware';

const router = Router();

// POST /api/queue/join
// Body: { publicKey: string }
router.post('/join',    joinQueue);
router.post('/verify',  verifyToken);
// requireEventOwnership runs first: validates x-public-key maps to an ACTIVE
// event and attaches eventData to res.locals so releaseTicket doesn't re-fetch.
router.post('/release', requireEventOwnership, releaseTicket);

export default router;
