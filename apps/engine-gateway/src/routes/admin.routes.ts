// apps/engine-gateway/src/routes/admin.routes.ts

import { Router }             from 'express';
import {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  activateEvent,
  pauseEvent,
  resumeEvent,
  endEvent,
  getEventStats,
  getEventTimeline,
  getClientOverview,
  rotateSigningSecret,
  duplicateEvent,
  updateCapacity,
} from '../controllers/admin.controller';
import { requireAdminAuth } from '../middleware/admin-auth.middleware';

const router = Router();

router.use(requireAdminAuth);

router.get   ('/overview',                  getClientOverview);
router.get   ('/events',                    listEvents);
router.post  ('/events',                    createEvent);
router.put   ('/events/:id/activate',       activateEvent);
router.put   ('/events/:id/pause',          pauseEvent);
router.put   ('/events/:id/resume',         resumeEvent);
router.put   ('/events/:id/end',            endEvent);
router.post  ('/events/:id/duplicate',      duplicateEvent);
router.get   ('/events/:id',                getEvent);
router.put   ('/events/:id',                updateEvent);
router.get   ('/events/:id/stats',          getEventStats);
router.get   ('/events/:id/timeline',       getEventTimeline);
router.put   ('/events/:id/rotate-secret',  rotateSigningSecret);
router.put   ('/events/:id/capacity',       updateCapacity);

export default router;