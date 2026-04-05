import { cloudinary } from "../lib/cloudinary";
import { productRepository } from "../repositories/product.repository";
import { createError } from "../middlewares/error.middleware";
import { z } from "zod";
import { ProductStatus } from "@prisma/client";

export const createProductSchema = z.object({
  name: z.string().min(3, "Product name must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  original_mrp: z.coerce.number().positive("MRP must be a positive number"),
  discount_price: z.coerce.number().positive("Discount price must be positive"),
  stock_qty: z.coerce.number().int().min(1, "Stock must be at least 1"),
  estimated_demand: z.coerce.number().int().min(0).default(0),
  status: z.nativeEnum(ProductStatus).default("DRAFT"),
  sale_starts_at: z.string().datetime({ offset: true }).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const productService = {
  getPublicProducts: () =>
    productRepository.findAll(["ACTIVE", "UPCOMING"]),

  getSellerProducts: (sellerId: string) =>
    productRepository.findBySeller(sellerId),

  getProductById: async (id: string) => {
    const product = await productRepository.findByIdPublic(id);
    if (!product) throw createError(404, "Product not found");
    return product;
  },

  createProduct: async (
    sellerId: string,
    data: z.infer<typeof createProductSchema>,
    imageFile?: Express.Multer.File
  ) => {
    let image_url: string | undefined;

    if (imageFile) {
      // Stream buffer directly to Cloudinary
      const uploadResult = await new Promise<{ secure_url: string }>(
        (resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "flash-sale/products", resource_type: "image" },
            (err, result) => {
              if (err || !result) return reject(err || new Error("Upload failed"));
              resolve(result);
            }
          );
          stream.end(imageFile.buffer);
        }
      );
      image_url = uploadResult.secure_url;
    }

    return productRepository.create({
      seller_id: sellerId,
      ...data,
      image_url,
      sale_starts_at: data.sale_starts_at ? new Date(data.sale_starts_at) : null,
    });
  },

  updateProduct: async (
    id: string,
    sellerId: string,
    data: z.infer<typeof updateProductSchema>,
    imageFile?: Express.Multer.File
  ) => {
    const existing = await productRepository.findByIdPublic(id);
    if (!existing) throw createError(404, "Product not found");
    if (existing.seller_id !== sellerId) throw createError(403, "Forbidden");

    let image_url = existing.image_url ?? undefined;

    if (imageFile) {
      const uploadResult = await new Promise<{ secure_url: string }>(
        (resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "flash-sale/products", resource_type: "image" },
            (err, result) => {
              if (err || !result) return reject(err || new Error("Upload failed"));
              resolve(result);
            }
          );
          stream.end(imageFile.buffer);
        }
      );
      image_url = uploadResult.secure_url;
    }

    return productRepository.update(id, {
      ...data,
      image_url,
      sale_starts_at: data.sale_starts_at ? new Date(data.sale_starts_at) : undefined,
    });
  },

  terminateProduct: async (id: string, sellerId: string) => {
    const existing = await productRepository.findByIdPublic(id);
    if (!existing) throw createError(404, "Product not found");
    if (existing.seller_id !== sellerId) throw createError(403, "Forbidden");
    return productRepository.terminate(id);
  },
};
