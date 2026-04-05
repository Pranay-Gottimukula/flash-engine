import prisma from "../lib/prisma";
import { Prisma } from "@prisma/client";

export const addressRepository = {
  findAllByUser: (userId: string) =>
    prisma.address.findMany({
      where: { user_id: userId },
      orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
    }),

  findById: (id: string, userId: string) =>
    prisma.address.findFirst({
      where: { id, user_id: userId },
    }),

  create: (userId: string, data: Omit<Prisma.AddressCreateInput, "user">) =>
    prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // If setting as default, unset other defaults first
      if (data.is_default) {
        await tx.address.updateMany({
          where: { user_id: userId },
          data: { is_default: false },
        });
      }
      return tx.address.create({
        data: { ...data, user: { connect: { id: userId } } },
      });
    }),

  update: (id: string, userId: string, data: Prisma.AddressUpdateInput) =>
    prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (data.is_default) {
        await tx.address.updateMany({
          where: { user_id: userId },
          data: { is_default: false },
        });
      }
      return tx.address.update({
        where: { id },
        data,
      });
    }),

  delete: (id: string) =>
    prisma.address.delete({ where: { id } }),
};
