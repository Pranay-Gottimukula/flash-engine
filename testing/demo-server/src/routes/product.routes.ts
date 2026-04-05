import { Router, type IRouter } from "express";
import { productController } from "../controllers/product.controller";
import { authenticate, requireRole } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/upload.middleware";

const router: IRouter = Router();

// GET /api/products — public: active + upcoming products (customer browse)
router.get("/", productController.getPublicProducts);

// GET /api/products/my — seller: their own products dashboard
router.get("/my", authenticate, requireRole("SELLER"), productController.getSellerProducts);

// GET /api/products/:id — public: single product detail
router.get("/:id", productController.getProductById);

// POST /api/products — seller: create new product (with optional image)
router.post(
  "/",
  authenticate,
  requireRole("SELLER"),
  upload.single("image"),
  productController.createProduct
);

// PATCH /api/products/:id — seller: update product
router.patch(
  "/:id",
  authenticate,
  requireRole("SELLER"),
  upload.single("image"),
  productController.updateProduct
);

// PATCH /api/products/:id/terminate — seller: emergency terminate
router.patch(
  "/:id/terminate",
  authenticate,
  requireRole("SELLER"),
  productController.terminateProduct
);

export default router;
