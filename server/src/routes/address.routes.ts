import { Router, type IRouter } from "express";
import { addressController } from "../controllers/address.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router: IRouter = Router();

// All address routes require authentication
router.use(authenticate);

// GET /api/addresses
router.get("/", addressController.getAddresses);

// POST /api/addresses
router.post("/", addressController.createAddress);

// PATCH /api/addresses/:id
router.patch("/:id", addressController.updateAddress);

// DELETE /api/addresses/:id
router.delete("/:id", addressController.deleteAddress);

export default router;
