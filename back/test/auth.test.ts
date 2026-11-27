import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { connectDatabase, migrate, type DB } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { bootstrapOrganization } from "../src/bootstrap.js";
import { seedMaterials } from "../src/seed.js";
import { hashPassword, verifyPassword } from "../src/password.js";

const password = "Una frase de prueba para EcoTrace";
let db: DB;
let app: Awaited<ReturnType<typeof buildApp>>;
let address = 1;
const accounts: Record<string, { cookie: string; id: string }> = {};
const request = (url: string, payload: any, cookie?: string) =>
  app.inject({
    method: "POST",
    url,
    payload,
    remoteAddress: `192.0.2.${address++}`,
    headers: {
      "x-ecotrace-request": "1",
      origin: "https://ecotrace.example",
      ...(cookie ? { cookie } : {}),
    },
  });
const profile = (role = "reciclador") => ({
  name: "Persona de prueba",
  email: `${randomUUID()}@example.test`,
  password,
  role,
});
before(async () => {
  db = await connectDatabase({ embedded: true });
  await migrate(db);
  await bootstrapOrganization(db, "public-org", {});
  await seedMaterials(db);
  await db.exec(
    "INSERT INTO organizations(id,name) VALUES('private-org','Otra organización'); INSERT INTO sites(id,org_id,name,kind,address) VALUES ('center','public-org','Centro de prueba','center','Dirección de prueba'),('plant','public-org','Planta de prueba','plant','Dirección de prueba'),('private-site','private-org','Sede externa','center','No pública')",
  );
  app = await buildApp(db, {
    production: true,
    origin: "https://ecotrace.example",
    registrationOrgId: "public-org",
  });
});
after(async () => {
  await app.close();
  await db.close();
});

test("registration works without an administrator or mail provider; catalog is scoped", async () => {
  assert.equal((await db.query("SELECT id FROM users")).rows.length, 0);
  const config = (await app.inject("/api/auth/config")).json();
  assert.equal(config.registration, true);
  assert.deepEqual(config.roles, [
    "reciclador",
    "operario",
    "transportador",
    "empresa",
    "capacitador",
  ]);
  assert.deepEqual(
    config.sites.map((s: any) => s.id),
    ["center", "plant"],
  );
  assert.equal(config.demo, false);
  assert.deepEqual(config.users, []);
});

test("each public role signs up, starts a session, signs out and logs in with its password", async () => {
  for (const key of [
    "reciclador",
    "operario",
    "planta",
    "transportador",
    "empresa",
    "capacitador",
  ]) {
    const role = key === "planta" ? "operario" : key;
    const data = {
      ...profile(role),
      email: ` ${key.toUpperCase()}@example.test `,
      ...(role === "operario"
        ? { siteId: key === "planta" ? "plant" : "center" }
        : {}),
    };
    const registered = await request("/api/auth/register", data);
    assert.equal(registered.statusCode, 201, registered.body);
    assert.match(registered.headers["set-cookie"] as string, /HttpOnly/);
    assert.match(registered.headers["set-cookie"] as string, /Secure/);
    assert.match(registered.headers["set-cookie"] as string, /SameSite=Strict/);
    const cookie = `ecotrace_session=${registered.cookies[0].value}`;
    const me = (
      await app.inject({ url: "/api/me", headers: { cookie } })
    ).json();
    assert.equal(me.role, role);
    assert.equal(me.org_id, "public-org");
    assert.equal(me.email, `${key}@example.test`);
    assert.equal(me.password_hash, undefined);
    const stored = (
      await db.query("SELECT password_hash FROM users WHERE id=$1", [me.id])
    ).rows[0];
    assert.notEqual(stored.password_hash, password);
    assert.ok(await verifyPassword(password, stored.password_hash));
    assert.equal((await request("/api/logout", {}, cookie)).statusCode, 200);
    assert.equal(
      (await app.inject({ url: "/api/me", headers: { cookie } })).statusCode,
      401,
    );
    const login = await request("/api/auth/login", {
      email: data.email,
      password,
    });
    assert.equal(login.statusCode, 200, login.body);
    accounts[key] = {
      cookie: `ecotrace_session=${login.cookies[0].value}`,
      id: me.id,
    };
    const bootstrap = await app.inject({
      url: "/api/bootstrap",
      headers: { cookie: accounts[key].cookie },
    });
    assert.equal(bootstrap.statusCode, 200, bootstrap.body);
    assert.ok(!bootstrap.body.includes("password_hash"));
    assert.equal(
      (
        await request(
          "/api/sites",
          { name: "Sede", kind: "center", address: "Calle 1" },
          accounts[key].cookie,
        )
      ).statusCode,
      403,
    );
  }
});

test("newly registered accounts can complete the custody chain and training workflow", async () => {
  const as = (key: string, url: string, payload: any = {}) =>
    request(url, payload, accounts[key].cookie);
  const created = await as("reciclador", "/api/lots", {
    clientId: randomUUID(),
    materialId: "pet-clear",
    centerId: "center",
    declaredKg: 20,
  });
  assert.equal(created.statusCode, 201, created.body);
  const lotId = created.json().id;
  assert.equal(
    (
      await as("planta", `/api/lots/${lotId}/receive`, {
        accepted: true,
        verifiedKg: 20,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await as("operario", `/api/lots/${lotId}/receive`, {
        accepted: true,
        verifiedKg: 20,
      })
    ).statusCode,
    200,
  );
  const dispatch = await as("operario", "/api/dispatches", {
    lotIds: [lotId],
    destinationId: "plant",
    transporterId: accounts.transportador.id,
    scheduledDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    timeWindow: "09:00–10:00",
  });
  assert.equal(dispatch.statusCode, 201, dispatch.body);
  const did = dispatch.json().id;
  assert.equal(
    (
      await as("transportador", `/api/dispatches/${did}/load`, {
        scannedLotIds: [lotId],
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await as("transportador", `/api/dispatches/${did}/arrive`)).statusCode,
    200,
  );
  assert.equal(
    (
      await as("planta", `/api/dispatches/${did}/receive`, {
        lots: [{ id: lotId, kg: 20 }],
      })
    ).statusCode,
    200,
  );
  const certificate = (
    await db.query(
      "SELECT verification_code FROM certificates WHERE lot_id=$1",
      [lotId],
    )
  ).rows[0];
  assert.equal(
    (await app.inject(`/api/verify/${certificate.verification_code}`))
      .statusCode,
    200,
  );
  const payment = (
    await db.query("SELECT id FROM payments WHERE lot_id=$1", [lotId])
  ).rows[0];
  assert.equal(
    (
      await as("empresa", `/api/payments/${payment.id}/paid`, {
        reference: "PRUEBA-REGISTRO",
      })
    ).statusCode,
    200,
  );
  const workshop = await as("capacitador", "/api/workshops", {
    name: "Taller de bienvenida",
    location: "Centro de prueba",
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    targetRole: "reciclador",
  });
  assert.equal(workshop.statusCode, 201, workshop.body);
  const attendance = await app.inject({
    method: "PUT",
    url: `/api/workshops/${workshop.json().id}/attendance`,
    headers: { "x-ecotrace-request": "1", cookie: accounts.capacitador.cookie },
    payload: { attendedIds: [accounts.reciclador.id] },
  });
  assert.equal(attendance.statusCode, 200, attendance.body);
});

test("signup rejects admin, privilege injection, foreign sites and invalid credentials", async () => {
  for (const data of [
    profile("admin"),
    { ...profile(), org_id: "private-org" },
    { ...profile(), active: true },
    { ...profile(), password_hash: "forged" },
    { ...profile(), siteId: "center" },
    profile("operario"),
    { ...profile("operario"), siteId: "private-site" },
    { ...profile(), email: "invalid" },
    { ...profile(), password: "short" },
    { ...profile(), password: "a".repeat(129) },
  ])
    assert.equal(
      (await request("/api/auth/register", data)).statusCode,
      400,
      JSON.stringify(data.role),
    );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: profile(),
      })
    ).statusCode,
    403,
  );
});

test("duplicates and legacy accounts cannot be claimed through signup", async () => {
  const duplicate = await request("/api/auth/register", {
    ...profile(),
    email: " RECICLADOR@EXAMPLE.TEST ",
  });
  assert.equal(duplicate.statusCode, 409);
  await db.query(
    "INSERT INTO users(id,org_id,name,email,role) VALUES('legacy','public-org','Anterior','legacy@example.test','empresa')",
  );
  assert.equal(
    (
      await request("/api/auth/register", {
        ...profile(),
        email: "legacy@example.test",
      })
    ).statusCode,
    409,
  );
  const legacy = await request("/api/auth/login", {
    email: "legacy@example.test",
    password,
  });
  const missing = await request("/api/auth/login", {
    email: "missing@example.test",
    password,
  });
  const wrong = await request("/api/auth/login", {
    email: "reciclador@example.test",
    password: "Contraseña incorrecta",
  });
  for (const r of [legacy, missing, wrong]) {
    assert.equal(r.statusCode, 401);
    assert.equal(r.body, missing.body);
    assert.equal(r.cookies.length, 0);
  }
  const disabled = await request("/api/auth/register", {
    ...profile(),
    email: "disabled@example.test",
  });
  const disabledCookie = `ecotrace_session=${disabled.cookies[0].value}`;
  await db.query(
    "UPDATE users SET active=false WHERE email='disabled@example.test'",
  );
  assert.equal(
    (
      await request("/api/auth/login", {
        email: "disabled@example.test",
        password,
      })
    ).body,
    missing.body,
  );
  assert.equal(
    (await app.inject({ url: "/api/me", headers: { cookie: disabledCookie } }))
      .statusCode,
    401,
  );
  assert.equal(
    (
      await request("/api/auth/request-code", {
        email: "reciclador@example.test",
      })
    ).statusCode,
    404,
  );
  assert.equal((await request("/api/auth/verify", {})).statusCode, 404);
});

test("passwords use independent salts and login attempts are limited", async () => {
  const first = await hashPassword(password);
  assert.notEqual(first, await hashPassword(password));
  assert.equal(await verifyPassword(password, "malformed"), false);
  for (let i = 0; i < 11; i++) {
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress: "198.51.100.1",
      headers: { "x-ecotrace-request": "1" },
      payload: { email: "nobody@example.test", password },
    });
    assert.equal(r.statusCode, i < 10 ? 401 : 429);
  }
});

test("optional admin bootstrap is idempotent and cannot promote a registered user", async () => {
  const env = {
    BOOTSTRAP_ADMIN_EMAIL: "admin@example.test",
    BOOTSTRAP_ADMIN_PASSWORD: password,
  };
  await bootstrapOrganization(db, "public-org", env);
  await bootstrapOrganization(db, "public-org", env);
  assert.equal(
    (await db.query("SELECT id FROM users WHERE role='admin'")).rows.length,
    1,
  );
  assert.equal(
    (
      await request("/api/auth/login", {
        email: env.BOOTSTRAP_ADMIN_EMAIL,
        password,
      })
    ).statusCode,
    200,
  );
  await assert.rejects(
    bootstrapOrganization(db, "public-org", {
      ...env,
      BOOTSTRAP_ADMIN_EMAIL: "reciclador@example.test",
    }),
    /otra cuenta/,
  );
  assert.equal(
    (
      await db.query(
        "SELECT role FROM users WHERE email='reciclador@example.test'",
      )
    ).rows[0].role,
    "reciclador",
  );
  await assert.rejects(
    bootstrapOrganization(db, "public-org", {
      BOOTSTRAP_ADMIN_EMAIL: "admin@example.test",
    }),
    /ambos/,
  );
});

test("password migration preserves existing users and runs only once", async () => {
  const legacy = await connectDatabase({ embedded: true });
  try {
    await legacy.exec(
      await readFile(
        new URL("../migrations/001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    await legacy.exec(
      "CREATE TABLE schema_migrations(version text PRIMARY KEY,applied_at timestamptz DEFAULT now()); INSERT INTO schema_migrations(version) VALUES('001'); INSERT INTO organizations(id,name) VALUES('original','Original'); INSERT INTO users(id,org_id,name,email,role) VALUES('original-user','original','Original','original@example.test','reciclador'); INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('old-session','original-user',now()+interval '1 day')",
    );
    await migrate(legacy);
    assert.equal(
      (await legacy.query("SELECT name,password_hash FROM users")).rows[0].name,
      "Original",
    );
    assert.equal(
      (await legacy.query("SELECT password_hash FROM users")).rows[0]
        .password_hash,
      null,
    );
    assert.equal((await legacy.query("SELECT * FROM sessions")).rows.length, 0);
    await legacy.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('new-session','original-user',now()+interval '1 day')",
    );
    await migrate(legacy);
    assert.equal((await legacy.query("SELECT * FROM sessions")).rows.length, 1);
    assert.equal(
      (await legacy.query("SELECT version FROM schema_migrations")).rows.length,
      2,
    );
  } finally {
    await legacy.close();
  }
});
