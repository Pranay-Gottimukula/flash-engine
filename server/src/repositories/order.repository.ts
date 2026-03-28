import prisma from "../lib/prisma";
import { Prisma } from "@prisma/client";

interface CreateOrderData {
  customerId: string;
  shippingAddressId: string;
  productId: string;
  quantity: number;
  lockedPrice: Prisma.Decimal | number;
}

export const orderRepository = {
  findByCustomer: (customerId: string) =>
    prisma.order.findMany({
      where: { customer_id: customerId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, image_url: true },
            },
          },
        },
        shipping_address: true,
      },
      orderBy: { created_at: "desc" },
    }),

  findById: (id: string, customerId: string) =>
    prisma.order.findFirst({
      where: { id, customer_id: customerId },
      include: {
        items: { include: { product: true } },
        shipping_address: true,
      },
    }),

  // Atomic "Buy Now" transaction:
  // 1. Re-check stock inside transaction
  // 2. Decrement stock
  // 3. Create Order + OrderItem with PENDING status
  createWithDecrement: async (data: CreateOrderData) => {
    return prisma.$transaction(async (tx) => {
      // Re-check stock atomically inside transaction
      const product = await tx.product.findUnique({
        where: { id: data.productId },
        select: { stock_qty: true, status: true, discount_price: true },
      });

      if (!product || product.stock_qty < data.quantity || product.status !== "ACTIVE") {
        throw new Error("SOLD_OUT");
      }

      // Decrement stock
      await tx.product.update({
        where: { id: data.productId },
        data: {
          stock_qty: { decrement: data.quantity },
          status: product.stock_qty - data.quantity <= 0 ? "SOLD_OUT" : undefined,
        },
      });

      // Create the order
      const totalAmount = Number(data.lockedPrice) * data.quantity;
      const order = await tx.order.create({
        data: {
          customer_id: data.customerId,
          shipping_address_id: data.shippingAddressId,
          total_amount: totalAmount,
          status: "PENDING",
          items: {
            create: {
              product_id: data.productId,
              quantity: data.quantity,
              locked_price: data.lockedPrice,
            },
          },
        },
        include: {
          items: { include: { product: true } },
          shipping_address: true,
        },
      });

      return order;
    });
  },

  updateStatus: (id: string, status: "COMPLETED" | "FAILED") =>
    prisma.order.update({
      where: { id },
      data: { status },
    }),
};
