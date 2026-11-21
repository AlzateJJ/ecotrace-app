import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import type { DB } from "./db.js";
import { HttpError, safeUser, uuid, type User } from "./domain.js";
import { demoUsers } from "./seed.js";
import { registerReadRoutes } from "./read-routes.js";
import { registerWriteRoutes } from "./write-routes.js";

declare module "fastify" {
  interface FastifyRequest {
    user: User;
  }
}
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export async function buildApp(
  db: DB,
  options: {
    production?: boolean;
    demo?: boolean;
    origin?: string;
    logger?: boolean;
  } = {},
) {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 256 * 1024,
    trustProxy: !!options.production,
  });
  await app.register(cookie);
  await app.register(helmet);
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  app.decorateRequest("user", null as unknown as User);
  app.setErrorHandler((error: any, request, reply) => {
    if (error instanceof z.ZodError)
      return reply
        .code(400)
        .send({ message: error.issues.map((i: any) => i.message).join(". ") });
    if (error.statusCode && error.statusCode < 500)
      return reply.code(error.statusCode).send({ message: error.message });
    if (error.code === "23505")
      return reply.code(409).send({
        message:
          "El registro ya existe. Actualiza la información y vuelve a intentarlo.",
      });
    request.log.error(error);
    return reply.code(500).send({
      message: "No pudimos completar la operación. Inténtalo de nuevo.",
    });
  });
  const allowedOrigins = new Set(
    options.production
      ? [options.origin!]
      : [
          options.origin,
          "http://localhost:5173",
          "http://127.0.0.1:5173",
          "http://localhost:4173",
          "http://127.0.0.1:4173",
          "http://localhost:3000",
          "http://127.0.0.1:3000",
        ].filter(Boolean),
  );
  app.addHook("onRequest", async (req) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers["x-ecotrace-request"] !== "1")
        throw new HttpError(403, "Solicitud no permitida.");
      if (req.headers.origin && !allowedOrigins.has(req.headers.origin))
        throw new HttpError(403, "Origen no permitido.");
    }
    const path = req.url.split("?")[0];
    if (
      path === "/api/health" ||
      path.startsWith("/api/auth/") ||
      path.startsWith("/api/verify/")
    )
      return;
    if (!path.startsWith("/api/")) return;
    const token = req.cookies.ecotrace_session;
    if (!token) throw new HttpError(401, "Inicia sesión para continuar.");
    const u = (
      await db.query(
        `SELECT u.*,s.kind AS site_kind,s.name AS site_name FROM sessions se JOIN users u ON u.id=se.user_id LEFT JOIN sites s ON s.id=u.site_id WHERE se.token_hash=$1 AND se.expires_at>now() AND u.active=true`,
        [hash(token)],
      )
    ).rows[0];
    if (!u) throw new HttpError(401, "Tu sesión terminó. Ingresa de nuevo.");
    req.user = u;
  });
  const session = async (userId: string, reply: any) => {
    const token = randomBytes(32).toString("hex");
    await db.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)",
      [hash(token), userId, new Date(Date.now() + 86400000)],
    );
    reply.setCookie("ecotrace_session", token, {
      httpOnly: true,
      secure: !!options.production,
      sameSite: "strict",
      path: "/",
      maxAge: 86400,
    });
    return { ok: true };
  };
  app.get("/api/health", async () => {
    await db.query("SELECT 1");
    return { status: "ok" };
  });
  app.get("/api/auth/config", async () => ({
    demo: !!options.demo && !options.production,
    users:
      options.demo && !options.production
        ? demoUsers.map(({ id, name, role, site }) => ({
            id,
            name,
            role,
            site,
          }))
        : [],
  }));
  app.post(
    "/api/auth/demo",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!options.demo || options.production)
        throw new HttpError(404, "No disponible.");
      const { userId } = z.object({ userId: z.string() }).parse(req.body);
      if (!demoUsers.some((u) => u.id === userId))
        throw new HttpError(404, "Perfil de ejemplo no disponible.");
      return session(userId, reply);
    },
  );
  app.post(
    "/api/auth/request-code",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req) => {
      const { email } = z
        .object({
          email: z
            .email("Escribe un correo válido.")
            .transform((v) => v.trim().toLowerCase()),
        })
        .parse(req.body);
      const code = String(randomInt(100000, 1000000));
      const challenge = uuid();
      const exists =
        (
          await db.query(
            "SELECT id FROM users WHERE email=$1 AND active=true",
            [email],
          )
        ).rows.length > 0;
      await db.query("DELETE FROM login_codes WHERE expires_at<now()");
      await db.query("DELETE FROM sessions WHERE expires_at<now()");
      if (exists) {
        await db.transaction(async (tx) => {
          await tx.query(
            "UPDATE login_codes SET consumed=true WHERE email=$1",
            [email],
          );
          await tx.query(
            "INSERT INTO login_codes(id,email,code_hash,expires_at) VALUES($1,$2,$3,$4)",
            [
              challenge,
              email,
              hash(challenge + code),
              new Date(Date.now() + 10 * 60000),
            ],
          );
        });
        if (options.production || process.env.SMTP_HOST) {
          const transport = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_SECURE === "true",
            auth: process.env.SMTP_USER
              ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
              : undefined,
          });
          await transport.sendMail({
            from: process.env.SMTP_FROM,
            to: email,
            subject: "Tu código de acceso a EcoTrace",
            text: `Tu código es ${code}. Vence en 10 minutos. Si no solicitaste este acceso, ignora este mensaje.`,
          });
        }
      }
      return {
        challenge,
        message: "Si tu correo está habilitado, recibirás un código de acceso.",
        ...(!options.production && options.demo && exists
          ? { developmentCode: code }
          : {}),
      };
    },
  );
  app.post(
    "/api/auth/verify",
    { config: { rateLimit: { max: 15, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { challenge, code } = z
        .object({
          challenge: z.uuid(),
          code: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos."),
        })
        .parse(req.body);
      const userId = await db.transaction(async (tx) => {
        const c = (
          await tx.query("SELECT * FROM login_codes WHERE id=$1 FOR UPDATE", [
            challenge,
          ])
        ).rows[0];
        if (
          !c ||
          c.consumed ||
          c.attempts >= 5 ||
          new Date(c.expires_at).getTime() < Date.now()
        )
          return null;
        await tx.query(
          "UPDATE login_codes SET attempts=attempts+1 WHERE id=$1",
          [challenge],
        );
        if (
          !timingSafeEqual(
            Buffer.from(c.code_hash),
            Buffer.from(hash(challenge + code)),
          )
        )
          return null;
        const u = (
          await tx.query(
            "SELECT id FROM users WHERE email=$1 AND active=true",
            [c.email],
          )
        ).rows[0];
        if (!u) return null;
        await tx.query("UPDATE login_codes SET consumed=true WHERE id=$1", [
          challenge,
        ]);
        return u.id as string;
      });
      if (!userId)
        throw new HttpError(
          401,
          "Código incorrecto, vencido o agotado. Solicita uno nuevo.",
        );
      return session(userId, reply);
    },
  );
  app.post("/api/logout", async (req, reply) => {
    if (req.cookies.ecotrace_session)
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        hash(req.cookies.ecotrace_session),
      ]);
    reply.clearCookie("ecotrace_session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/me", async (req) => safeUser(req.user));
  registerReadRoutes(app, db);
  registerWriteRoutes(app, db);
  return app;
}
