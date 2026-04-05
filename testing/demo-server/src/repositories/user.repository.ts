import prisma from "../lib/prisma";
import { Prisma } from "@prisma/client";

export const userRepository = {
  findByEmail: (email: string) =>
    prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        full_name: true,
        password_hash: true,
        role: true,
      },
    }),

  findById: (id: string) =>
    prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, full_name: true, role: true },
    }),

  create: (data: Prisma.UserCreateInput) =>
    prisma.user.create({
      data,
      select: { id: true, email: true, full_name: true, role: true },
    }),

  updatePasswordByEmail: (email: string, password_hash: string) =>
    prisma.user.update({
      where: { email },
      data: { password_hash },
      select: { id: true, email: true, full_name: true, role: true },
    }),
};
