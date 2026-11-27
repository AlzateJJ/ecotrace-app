import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { createHash, randomBytes } from "node:crypto";
import {
  emailSchema,
  passwordSchema,
  hashPassword,
  verifyPassword,
} from "./password.js";
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
    registrationOrgId?: string;
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
  const registrationOrgId = options.registrationOrgId;
  const publicRoles = [
    "reciclador",
    "operario",
    "transportador",
    "empresa",
    "capacitador",
  ] as const;
  app.get("/api/auth/config", async () => ({
    registration: !!registrationOrgId,
    roles: publicRoles,
    sites: registrationOrgId
      ? (
          await db.query(
            "SELECT id,name,kind FROM sites WHERE org_id=$1 ORDER BY name",
            [registrationOrgId],
          )
        ).rows
      : [],
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
    "/api/auth/register",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req, reply) => {
      if (!registrationOrgId)
        throw new HttpError(503, "El registro no está disponible todavía.");
      const b = z
        .object({
          name: z
            .string()
            .trim()
            .min(2, "Escribe tu nombre completo.")
            .max(100),
          email: emailSchema,
          password: passwordSchema,
          role: z.enum(publicRoles),
          siteId: z.string().min(1).max(100).optional(),
        })
        .strict()
        .parse(req.body);
      if (b.role === "operario") {
        if (
          !b.siteId ||
          !(
            await db.query("SELECT id FROM sites WHERE id=$1 AND org_id=$2", [
              b.siteId,
              registrationOrgId,
            ])
          ).rows.length
        )
          throw new HttpError(
            400,
            "Selecciona un centro de acopio o planta disponible.",
          );
      } else if (b.siteId) {
        throw new HttpError(
          400,
          "Solo los operarios se vinculan a una sede al registrarse.",
        );
      }
      const passwordHash = await hashPassword(b.password);
      const userId = uuid();
      await db.query(
        "INSERT INTO users(id,org_id,site_id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          userId,
          registrationOrgId,
          b.siteId ?? null,
          b.name,
          b.email,
          b.role,
          passwordHash,
        ],
      );
      reply.code(201);
      return session(userId, reply);
    },
  );
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const b = z
        .object({ email: emailSchema, password: z.string().min(1).max(128) })
        .strict()
        .parse(req.body);
      const user = (
        await db.query(
          "SELECT id,active,password_hash FROM users WHERE lower(trim(email))=$1",
          [b.email],
        )
      ).rows[0];
      const valid = await verifyPassword(b.password, user?.password_hash);
      if (!valid || !user?.active)
        throw new HttpError(401, "Correo o contraseña incorrectos.");
      await db.query("DELETE FROM sessions WHERE expires_at<now()");
      return session(user.id, reply);
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
