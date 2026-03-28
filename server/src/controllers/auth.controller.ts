import { Request, Response, NextFunction } from "express";
import { authService, registerSchema, loginSchema } from "../services/auth.service";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

export const authController = {
  register: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = registerSchema.parse(req.body);
      const user = await authService.register(data);
      res.status(201).json({ message: "Account created successfully", user });
    } catch (err) {
      next(err);
    }
  },

  login: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = loginSchema.parse(req.body);
      const { token, user } = await authService.login(data);

      res.cookie("auth_token", token, COOKIE_OPTIONS);
      res.json({ message: "Login successful", user });
    } catch (err) {
      next(err);
    }
  },

  logout: (_req: Request, res: Response) => {
    res.clearCookie("auth_token", { path: "/" });
    res.json({ message: "Logged out successfully" });
  },

  me: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ user: req.user });
    } catch (err) {
      next(err);
    }
  },
};
