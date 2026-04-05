import prisma from "../lib/prisma";
import { Prisma, ProductStatus } from "@prisma/client";

export const productRepository = {
  findAll: (statuses: ProductStatus[]) =>
    prisma.product.findMany({
      where: { status: { in: statuses } },
      include: {
        seller: { select: { id: true, full_name: true } },
        _count: { select: { order_items: true } },
      },
      orderBy: { sale_starts_at: "asc" },
    }),

  findByIdPublic: (id: string) =>
    prisma.product.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, full_name: true } },
        _count: { select: { order_items: true } },
      },
    }),

  findBySeller: (sellerId: string) =>
    prisma.product.findMany({
      where: { seller_id: sellerId },
      include: {
        _count: { select: { order_items: true } },
      },
      orderBy: { created_at: "desc" },
    }),

  create: (data: Prisma.ProductUncheckedCreateInput) =>
    prisma.product.create({ data }),

  update: (id: string, data: Prisma.ProductUncheckedUpdateInput) =>
    prisma.product.update({ where: { id }, data }),

  terminate: (id: string) =>
    prisma.product.update({
      where: { id },
      data: { status: "TERMINATED" },
    }),

  decrementStock: (id: string, quantity: number) =>
    prisma.product.update({
      where: { id, stock_qty: { gte: quantity } }, // Optimistic lock
      data: { stock_qty: { decrement: quantity } },
    }),
};
