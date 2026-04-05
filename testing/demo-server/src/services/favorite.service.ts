import { favoriteRepository } from "../repositories/favorite.repository";

export const favoriteService = {
  getFavorites: (userId: string) => favoriteRepository.findAllByUser(userId),

  toggleFavorite: async (userId: string, productId: string) => {
    const existing = await favoriteRepository.findOne(userId, productId);
    if (existing) {
      await favoriteRepository.delete(userId, productId);
      return { favorited: false };
    }
    await favoriteRepository.upsert(userId, productId);
    return { favorited: true };
  },

  addFavorite: (userId: string, productId: string) =>
    favoriteRepository.upsert(userId, productId),

  removeFavorite: (userId: string, productId: string) =>
    favoriteRepository.delete(userId, productId),

  isFavorited: (userId: string, productId: string) =>
    favoriteRepository.findOne(userId, productId).then(Boolean),
};
