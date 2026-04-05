import { Request, Response, NextFunction } from "express";
import { authService, registerSchema, loginSchema, changePasswordSchema } from "../services/auth.service";
import { userRepository } from "../repositories/user.repository";

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
      if (!req.user) {
        res.status(401).json({ message: "Not authenticated" });
        return;
      }
      const user = await userRepository.findById(req.user.userId);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }
      res.json({ user });
    } catch (err) {
      next(err);
    }
  },

  changePassword: async (req: Request, res: Response, next: NextFunction) => {
    try{
      const data = changePasswordSchema.parse(req.body);
      await authService.changePassword(data);
      res.json({ message: "Password changed successfully" });
    }catch(err){
      next(err);
    }
  }
};
