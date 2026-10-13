import bcrypt from "bcryptjs";
import crypto from "crypto";

const SALT_ROUNDS = 12;

export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, SALT_ROUNDS);
}

export async function verifyPassword(plainText: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plainText, hashed);
}

/**
 * Generate a cryptographically secure random token (hex)
 */
export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("hex");
}

/**
 * Hash tokens before saving to database (SHA-256)
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}