import { Request, Response, NextFunction } from "express";
import { favoriteService } from "../services/favorite.service";

export const favoriteController = {
  getFavorites: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const favorites = await favoriteService.getFavorites(req.user!.userId);
      res.json(favorites);
    } catch (err) {
      next(err);
    }
  },

  toggleFavorite: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await favoriteService.toggleFavorite(
        req.user!.userId,
        req.params.productId as string
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
};
