import { addressRepository } from "../repositories/address.repository";
import { createError } from "../middlewares/error.middleware";
import { z } from "zod";

export const addressSchema = z.object({
  street_address: z.string().min(5, "Street address is required"),
  city: z.string().min(2, "City is required"),
  state: z.string().min(2, "State is required"),
  zip_code: z.string().regex(/^\d{5,10}$/, "Invalid zip code"),
  is_default: z.boolean().default(false),
});

export const addressService = {
  getAddresses: (userId: string) => addressRepository.findAllByUser(userId),

  createAddress: (userId: string, data: z.infer<typeof addressSchema>) =>
    addressRepository.create(userId, data),

  updateAddress: async (
    id: string,
    userId: string,
    data: Partial<z.infer<typeof addressSchema>>
  ) => {
    const existing = await addressRepository.findById(id, userId);
    if (!existing) throw createError(404, "Address not found");
    return addressRepository.update(id, userId, data);
  },

  deleteAddress: async (id: string, userId: string) => {
    const existing = await addressRepository.findById(id, userId);
    if (!existing) throw createError(404, "Address not found");
    return addressRepository.delete(id);
  },
};
