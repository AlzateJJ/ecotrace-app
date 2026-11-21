import "dotenv/config";
export const production = process.env.NODE_ENV === "production";
export function databaseOptions() {
  if (production && !process.env.DATABASE_URL)
    throw new Error("DATABASE_URL es obligatoria en producción.");
  return {
    url: process.env.DATABASE_URL || undefined,
    embedded:
      !production && process.env.DEV_EMBEDDED_DB !== "false"
        ? ".data/ecotrace"
        : undefined,
    ssl: process.env.DATABASE_SSL === "true",
  };
}
export function validateProduction() {
  if (!production) return;
  if (process.env.DEMO_MODE === "true")
    throw new Error("DEMO_MODE no se permite en producción.");
  if (!process.env.APP_ORIGIN?.startsWith("https://"))
    throw new Error("APP_ORIGIN debe ser el origen HTTPS público del front.");
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
    throw new Error(
      "Configura SMTP_HOST y SMTP_FROM para enviar códigos de acceso.",
    );
}
