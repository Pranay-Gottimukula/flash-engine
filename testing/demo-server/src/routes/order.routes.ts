import { Router, type IRouter } from "express";
import { orderController } from "../controllers/order.controller";
import { authenticate, requireRole } from "../middlewares/auth.middleware";

const router: IRouter = Router();

router.use(authenticate, requireRole("CUSTOMER"));

// GET /api/orders/my
router.get("/my", orderController.getMyOrders);

// GET /api/orders/:id
router.get("/:id", orderController.getOrderById);

// POST /api/orders — "Buy Now" — creates PENDING order + decrements stock
router.post("/", orderController.createOrder);

// PATCH /api/orders/:id/complete — after "Pay" button click
router.patch("/:id/complete", orderController.completeOrder);

// PATCH /api/orders/:id/fail — on timer expiry or cancellation
router.patch("/:id/fail", orderController.failOrder);

export default router;
