import { Router, type IRouter } from "express";
import { authController } from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router: IRouter = Router();

// POST /api/auth/register
router.post("/register", authController.register);

// POST /api/auth/login
router.post("/login", authController.login);

// POST /api/auth/logout
router.post("/logout", authController.logout);

// GET /api/auth/me — used by the client to re-hydrate auth state on page load
router.get("/me", authenticate, authController.me);

// PATCH /api/auth/change-password
router.patch("/change-password", authController.changePassword);

export default router;
