import { Request, Response, NextFunction } from "express";
import {
  productService,
  createProductSchema,
  updateProductSchema,
} from "../services/product.service";

export const productController = {
  getPublicProducts: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const products = await productService.getPublicProducts();
      res.json(products);
    } catch (err) {
      next(err);
    }
  },

  getSellerProducts: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const products = await productService.getSellerProducts(req.user!.userId);
      res.json(products);
    } catch (err) {
      next(err);
    }
  },

  getProductById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await productService.getProductById(req.params.id as string);
      res.json(product);
    } catch (err) {
      next(err);
    }
  },

  createProduct: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createProductSchema.parse(req.body);
      const product = await productService.createProduct(
        req.user!.userId,
        data,
        req.file
      );
      res.status(201).json(product);
    } catch (err) {
      next(err);
    }
  },

  updateProduct: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateProductSchema.parse(req.body);
      const product = await productService.updateProduct(
        req.params.id as string,
        req.user!.userId,
        data,
        req.file
      );
      res.json(product);
    } catch (err) {
      next(err);
    }
  },

  terminateProduct: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await productService.terminateProduct(
        req.params.id as string,
        req.user!.userId
      );
      res.json(product);
    } catch (err) {
      next(err);
    }
  },
};
