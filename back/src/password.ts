import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Escribe un correo válido.").max(254));
export const passwordSchema = z
  .string()
  .min(15, "Usa una contraseña de al menos 15 caracteres.")
  .max(128, "La contraseña admite hasta 128 caracteres.");

// Versioned format fixes the work factor; never trust parameters supplied by a client.
const derive = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt-v1$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  encoded: string | null | undefined,
) {
  const parts = /^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(
    encoded ?? "",
  );
  // Missing and legacy accounts still perform the same expensive operation.
  const key = await derive(
    password,
    parts ? Buffer.from(parts[1], "hex") : Buffer.alloc(16),
  );
  const expected = parts ? Buffer.from(parts[2], "hex") : Buffer.alloc(64);
  return timingSafeEqual(key, expected) && !!parts;
}
