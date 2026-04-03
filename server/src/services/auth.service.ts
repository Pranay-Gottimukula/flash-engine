import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { userRepository } from "../repositories/user.repository";
import { createError } from "../middlewares/error.middleware";
import { z } from "zod";

export const registerSchema = z.object({
  full_name: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["SELLER", "CUSTOMER"]).default("CUSTOMER"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export const changePasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const authService = {
  register: async (input: z.infer<typeof registerSchema>) => {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) throw createError(409, "An account with that email already exists");

    const password_hash = await bcrypt.hash(input.password, 12);
    const user = await userRepository.create({
      full_name: input.full_name,
      email: input.email,
      password_hash,
      role: input.role,
    });

    return user;
  },

  login: async (input: z.infer<typeof loginSchema>) => {
    const user = await userRepository.findByEmail(input.email);
    if (!user) throw createError(401, "Invalid email or password");

    const isMatch = await bcrypt.compare(input.password, user.password_hash);
    if (!isMatch) throw createError(401, "Invalid email or password");

    const expiresIn = (process.env.JWT_EXPIRES_IN || "7d") as `${number}${"s" | "m" | "h" | "d"}`;
    const token = jwt.sign(
      { userId: user.id, role: user.role, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn }
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    };
  },

  changePassword: async (input: z.infer<typeof changePasswordSchema>) => {
    const user = await userRepository.findByEmail(input.email);
    if (!user) throw createError(404, "No account found with that email address");

    const password_hash = await bcrypt.hash(input.newPassword, 12);
    await userRepository.updatePasswordByEmail(input.email, password_hash);

    return { message: "Password updated successfully" };
  },
};
