import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../utils/errors.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY ?? "15m";
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY ?? "7d";

interface TokenPayload {
  userId: string;
  email: string;
}

export function generateTokens(payload: TokenPayload) {
  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRY as jwt.SignOptions["expiresIn"],
  });
  const refreshToken = jwt.sign(
    { ...payload, type: "refresh" },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRY as jwt.SignOptions["expiresIn"] },
  );
  return { accessToken, refreshToken };
}

export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return { userId: decoded.userId, email: decoded.email };
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}

export function verifyRefreshToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload & {
      type?: string;
    };
    if (decoded.type !== "refresh") {
      throw new UnauthorizedError("Invalid refresh token");
    }
    return { userId: decoded.userId, email: decoded.email };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError("Invalid or expired refresh token");
  }
}

export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed authorization header");
  }

  const token = authHeader.slice(7);
  req.user = verifyToken(token);
  next();
}
