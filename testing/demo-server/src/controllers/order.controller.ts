import { Request, Response, NextFunction } from "express";
import { orderService, createOrderSchema } from "../services/order.service";

export const orderController = {
  getMyOrders: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orders = await orderService.getMyOrders(req.user!.userId);
      res.json(orders);
    } catch (err) {
      next(err);
    }
  },

  getOrderById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await orderService.getOrderById(req.params.id as string, req.user!.userId);
      res.json(order);
    } catch (err) {
      next(err);
    }
  },

  createOrder: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createOrderSchema.parse(req.body);
      const order = await orderService.createOrder(req.user!.userId, data);
      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  },

  completeOrder: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await orderService.completeOrder(req.params.id as string, req.user!.userId);
      res.json(order);
    } catch (err) {
      next(err);
    }
  },

  failOrder: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await orderService.failOrder(req.params.id as string, req.user!.userId);
      res.json(order);
    } catch (err) {
      next(err);
    }
  },
};
