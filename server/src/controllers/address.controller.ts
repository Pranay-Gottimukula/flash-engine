import { Request, Response, NextFunction } from "express";
import { addressService, addressSchema } from "../services/address.service";

export const addressController = {
  getAddresses: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const addresses = await addressService.getAddresses(req.user!.userId);
      res.json(addresses);
    } catch (err) {
      next(err);
    }
  },

  createAddress: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = addressSchema.parse(req.body);
      const address = await addressService.createAddress(req.user!.userId, data);
      res.status(201).json(address);
    } catch (err) {
      next(err);
    }
  },

  updateAddress: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = addressSchema.partial().parse(req.body);
      const address = await addressService.updateAddress(
        req.params.id as string,
        req.user!.userId,
        data
      );
      res.json(address);
    } catch (err) {
      next(err);
    }
  },

  deleteAddress: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await addressService.deleteAddress(req.params.id as string, req.user!.userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
