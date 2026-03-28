import prisma from "../lib/prisma";

export const favoriteRepository = {
  findAllByUser: (userId: string) =>
    prisma.favorite.findMany({
      where: { user_id: userId },
      include: {
        product: {
          include: {
            seller: { select: { id: true, full_name: true } },
          },
        },
      },
      // Phase 2: This sort order becomes the Redis queue priority
      orderBy: { added_at: "asc" },
    }),

  upsert: (userId: string, productId: string) =>
    prisma.favorite.upsert({
      where: { user_id_product_id: { user_id: userId, product_id: productId } },
      create: { user_id: userId, product_id: productId },
      update: {}, // No-op if already exists
    }),

  delete: (userId: string, productId: string) =>
    prisma.favorite.delete({
      where: { user_id_product_id: { user_id: userId, product_id: productId } },
    }),

  findOne: (userId: string, productId: string) =>
    prisma.favorite.findUnique({
      where: { user_id_product_id: { user_id: userId, product_id: productId } },
    }),
};
