import { Router, type IRouter } from "express";
import { favoriteController } from "../controllers/favorite.controller";
import { authenticate, requireRole } from "../middlewares/auth.middleware";

const router: IRouter = Router();

router.use(authenticate, requireRole("CUSTOMER"));

// GET /api/favorites
router.get("/", favoriteController.getFavorites);

// POST /api/favorites/:productId — toggle (add or remove)
router.post("/:productId", favoriteController.toggleFavorite);

export default router;
