import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export interface AppError extends Error {
  statusCode?: number;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      message: "Validation error",
      errors: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  // Prisma errors — check via error code duck-typing to avoid @prisma/client import issues
  const prismaErr = err as unknown as { code?: string; meta?: { target?: string[] }; constructor?: { name?: string } };
  if (
    typeof prismaErr.code === "string" &&
    prismaErr.constructor?.name === "PrismaClientKnownRequestError"
  ) {
    if (prismaErr.code === "P2002") {
      res.status(409).json({
        message: "A record with that value already exists",
        field: prismaErr.meta?.target?.join(", "),
      });
      return;
    }
    if (prismaErr.code === "P2025") {
      res.status(404).json({ message: "Record not found" });
      return;
    }
  }

  // CORS errors
  if (err.message?.includes("CORS")) {
    res.status(403).json({ message: err.message });
    return;
  }

  // Generic HTTP errors
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  if (process.env.NODE_ENV !== "production") {
    console.error("❌ Error:", err);
  }

  res.status(statusCode).json({ message });
};

// Convenience function to create typed HTTP errors
export const createError = (statusCode: number, message: string): AppError => {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  return err;
};
