// apps/engine-gateway/src/routes/admin.routes.ts

import { Router }         from 'express';
import {
  createEvent,
  activateEvent,
  endEvent,
} from '../controllers/admin.controller';

const router = Router();

// TODO: add admin auth middleware before these routes go to production
// router.use(requireAdminSecret);

router.post  ('/events',             createEvent);
router.put   ('/events/:id/activate', activateEvent);
router.put   ('/events/:id/end',      endEvent);

export default router;