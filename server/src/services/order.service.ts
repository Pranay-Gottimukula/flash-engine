import { orderRepository } from "../repositories/order.repository";
import { addressRepository } from "../repositories/address.repository";
import { productRepository } from "../repositories/product.repository";
import { createError } from "../middlewares/error.middleware";
import { z } from "zod";

export const createOrderSchema = z.object({
  product_id: z.string().uuid("Invalid product ID"),
  shipping_address_id: z.string().uuid("Invalid address ID"),
  quantity: z.number().int().min(1).default(1),
});

export const orderService = {
  getMyOrders: (customerId: string) =>
    orderRepository.findByCustomer(customerId),

  getOrderById: async (id: string, customerId: string) => {
    const order = await orderRepository.findById(id, customerId);
    if (!order) throw createError(404, "Order not found");
    return order;
  },

  // Phase 1 "Buy Now" flow:
  // Stock is checked and decremented atomically in the repository transaction.
  // A PENDING order is created, holding the locked_price for the 3-minute payment window.
  createOrder: async (
    customerId: string,
    data: z.infer<typeof createOrderSchema>
  ) => {
    // Verify the address belongs to this customer
    const address = await addressRepository.findById(
      data.shipping_address_id,
      customerId
    );
    if (!address) throw createError(404, "Shipping address not found");

    // Fetch product to lock in the price at order creation time
    const product = await productRepository.findByIdPublic(data.product_id);
    if (!product) throw createError(404, "Product not found");

    if (product.status === "SOLD_OUT" || product.status === "TERMINATED") {
      throw createError(400, "SOLD_OUT");
    }

    if (product.stock_qty < data.quantity) {
      throw createError(400, "SOLD_OUT");
    }

    try {
      return await orderRepository.createWithDecrement({
        customerId,
        shippingAddressId: data.shipping_address_id,
        productId: data.product_id,
        quantity: data.quantity,
        lockedPrice: product.discount_price,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "SOLD_OUT") {
        throw createError(400, "SOLD_OUT");
      }
      throw err;
    }
  },

  completeOrder: async (id: string, customerId: string) => {
    const order = await orderRepository.findById(id, customerId);
    if (!order) throw createError(404, "Order not found");
    if (order.status !== "PENDING") {
      throw createError(400, "Order is not in a pending state");
    }
    return orderRepository.updateStatus(id, "COMPLETED");
  },

  failOrder: async (id: string, customerId: string) => {
    const order = await orderRepository.findById(id, customerId);
    if (!order) throw createError(404, "Order not found");
    return orderRepository.updateStatus(id, "FAILED");
  },
};
