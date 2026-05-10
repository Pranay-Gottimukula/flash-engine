import { Router } from 'express';
import { requireAdminAuth, requireRole } from '../middleware/admin-auth.middleware';
import {
  listClients,
  suspendClient,
  unsuspendClient,
  getSystemHealth,
  getPlatformOverview,
  getLiveEvents,
} from '../controllers/superadmin.controller';

const router = Router();

router.use(requireAdminAuth);
router.use(requireRole('SUPER_ADMIN'));

router.get('/clients',               listClients);
router.put('/clients/:id/suspend',   suspendClient);
router.put('/clients/:id/unsuspend', unsuspendClient);
router.get('/system/health',         getSystemHealth);
router.get('/overview',              getPlatformOverview);
router.get('/live',                  getLiveEvents);

export default router;
