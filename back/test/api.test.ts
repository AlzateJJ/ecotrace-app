import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { connectDatabase, migrate, type DB } from "../src/db.js";
import { seedDemo } from "../src/seed.js";
import { buildApp } from "../src/app.js";
let db: DB;
let app: Awaited<ReturnType<typeof buildApp>>;
const cookies: Record<string, string> = {};
before(async () => {
  db = await connectDatabase({ embedded: true });
  await migrate(db);
  await seedDemo(db);
  app = await buildApp(db, { demo: true });
  for (const id of [
    "javier",
    "julio",
    "santiago",
    "isabela",
    "andres",
    "planta",
    "admin",
  ]) {
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/demo",
      headers: { "x-ecotrace-request": "1" },
      payload: { userId: "usr-" + id },
    });
    assert.equal(r.statusCode, 200, r.body);
    cookies[id] = r.cookies[0].name + "=" + r.cookies[0].value;
  }
  const token = "external-session";
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)",
    [
      createHash("sha256").update(token).digest("hex"),
      "usr-other",
      new Date(Date.now() + 60000),
    ],
  );
  cookies.external = "ecotrace_session=" + token;
});
after(async () => {
  await app.close();
  await db.close();
});
const call = (as: string, method: any, url: string, payload?: any) =>
  app.inject({
    method,
    url,
    payload,
    headers: { cookie: cookies[as], "x-ecotrace-request": "1" },
  });
test("authentication and CSRF are required", async () => {
  assert.equal((await app.inject("/api/bootstrap")).statusCode, 401);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/lots",
        headers: { cookie: cookies.javier },
        payload: {},
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/logout",
        headers: {
          cookie: cookies.javier,
          "x-ecotrace-request": "1",
          origin: "https://evil.example",
        },
      })
    ).statusCode,
    403,
  );
});
test("roles and organizations restrict reads and writes", async () => {
  assert.equal(
    (await call("external", "GET", "/api/lots/LT-2026-00487")).statusCode,
    404,
  );
  assert.equal(
    (await call("javier", "GET", "/api/lots/LT-2026-00477")).statusCode,
    404,
  );
  assert.equal(
    (await call("andres", "GET", "/api/lots/LT-2026-00487")).statusCode,
    404,
  );
  assert.equal(
    (
      await call("javier", "POST", "/api/lots/LT-2026-00487/receive", {
        accepted: true,
        verifiedKg: 120,
      })
    ).statusCode,
    403,
  );
  const trainer = (await call("andres", "GET", "/api/bootstrap")).json();
  assert.equal(trainer.payments.length, 0);
  assert.equal(trainer.lots.length, 0);
  assert.ok(trainer.team.length);
  const recycler = (await call("javier", "GET", "/api/bootstrap")).json();
  assert.ok(recycler.lots.every((l: any) => l.owner_id === "usr-javier"));
  assert.equal(recycler.users.length, 0);
  assert.equal(
    (
      await call("javier", "PATCH", "/api/profile", {
        name: "Javier",
        phone: "",
        role: "admin",
      })
    ).statusCode,
    400,
  );
});
test("delivery synchronization is idempotent and the full custody chain is enforced", async () => {
  const payload = {
    clientId: randomUUID(),
    materialId: "pet-clear",
    centerId: "eca-esperanza",
    declaredKg: 130,
  };
  const created = await call("javier", "POST", "/api/lots", payload);
  assert.equal(created.statusCode, 201, created.body);
  const lid = created.json().id;
  const retry = await call("javier", "POST", "/api/lots", payload);
  assert.equal(retry.json().id, lid);
  assert.equal(
    (await call("javier", "POST", "/api/lots", { ...payload, declaredKg: 140 }))
      .statusCode,
    409,
  );
  assert.equal(
    (
      await call("planta", "POST", `/api/lots/${lid}/receive`, {
        accepted: true,
        verifiedKg: 130,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await call("julio", "POST", `/api/lots/${lid}/receive`, {
        accepted: true,
        verifiedKg: 125,
      })
    ).statusCode,
    400,
  );
  const receipt = await call("julio", "POST", `/api/lots/${lid}/receive`, {
    accepted: true,
    verifiedKg: 125,
    note: "Diferencia medida en báscula",
  });
  assert.equal(receipt.statusCode, 200, receipt.body);
  assert.equal(receipt.json().amount, 150000);
  assert.equal(
    (
      await call("julio", "POST", `/api/lots/${lid}/receive`, {
        accepted: true,
        verifiedKg: 125,
      })
    ).statusCode,
    409,
  );
  assert.equal(
    Number(
      (
        await db.query("SELECT count(*) AS n FROM payments WHERE lot_id=$1", [
          lid,
        ])
      ).rows[0].n,
    ),
    1,
  );
  const data = {
    lotIds: [lid],
    destinationId: "planta-medellin",
    transporterId: "usr-santiago",
    scheduledDate: "2026-12-01",
    timeWindow: "09:00–10:00",
  };
  const dispatch = await call("julio", "POST", "/api/dispatches", data);
  assert.equal(dispatch.statusCode, 201, dispatch.body);
  const did = dispatch.json().id;
  assert.equal(
    (await call("julio", "POST", "/api/dispatches", data)).statusCode,
    409,
  );
  assert.equal(
    (await call("santiago", "POST", `/api/dispatches/${did}/arrive`))
      .statusCode,
    409,
  );
  assert.equal(
    (
      await call("santiago", "POST", `/api/dispatches/${did}/load`, {
        scannedLotIds: ["wrong-code"],
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await call("santiago", "POST", `/api/dispatches/${did}/load`, {
        scannedLotIds: [lid],
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await call("santiago", "POST", `/api/dispatches/${did}/receive`, {
        lots: [{ id: lid, kg: 125 }],
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await call("santiago", "POST", `/api/dispatches/${did}/arrive`))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await call("planta", "POST", `/api/dispatches/${did}/receive`, {
        lots: [{ id: lid, kg: 123 }],
      })
    ).statusCode,
    400,
  );
  const final = await call("planta", "POST", `/api/dispatches/${did}/receive`, {
    lots: [{ id: lid, kg: 123 }],
    note: "Diferencia verificada en báscula de destino",
  });
  assert.equal(final.statusCode, 200, final.body);
  const detail = (await call("javier", "GET", `/api/lots/${lid}`)).json();
  assert.equal(detail.status, "delivered");
  assert.equal(detail.events.length, 6);
  assert.equal(detail.incidents.length, 1);
  const cert = (
    await db.query("SELECT * FROM certificates WHERE lot_id=$1", [lid])
  ).rows[0];
  assert.equal(cert.snapshot.kg, 123);
  const publicCert = await app.inject("/api/verify/" + cert.verification_code);
  assert.equal(publicCert.statusCode, 200);
  assert.ok(!publicCert.body.includes("payment_account"));
  assert.equal(
    (await call("external", "GET", `/api/certificates/${cert.id}/pdf`))
      .statusCode,
    404,
  );
  const pdf = await call("isabela", "GET", `/api/certificates/${cert.id}/pdf`);
  assert.equal(pdf.statusCode, 200);
  assert.equal(pdf.rawPayload.subarray(0, 4).toString(), "%PDF");
  const p = (await db.query("SELECT * FROM payments WHERE lot_id=$1", [lid]))
    .rows[0];
  assert.equal(p.status, "pending");
  assert.equal(p.amount, 150000);
  assert.equal(
    (
      await call("javier", "POST", `/api/payments/${p.id}/paid`, {
        reference: "REF-123",
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await call("isabela", "POST", `/api/payments/${p.id}/paid`, {
        reference: "REF-123",
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await call("isabela", "POST", `/api/payments/${p.id}/paid`, {
        reference: "REF-123",
      })
    ).statusCode,
    409,
  );
});
test("rejected material creates no payment or points", async () => {
  const l = (
    await call("javier", "POST", "/api/lots", {
      clientId: randomUUID(),
      materialId: "pet-clear",
      centerId: "eca-esperanza",
      declaredKg: 50,
    })
  ).json();
  assert.equal(
    (
      await call("julio", "POST", `/api/lots/${l.id}/receive`, {
        accepted: false,
        note: "Material contaminado",
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await db.query("SELECT * FROM payments WHERE lot_id=$1", [l.id])).rows
      .length,
    0,
  );
  assert.equal(
    (await db.query("SELECT * FROM point_movements WHERE lot_id=$1", [l.id]))
      .rows.length,
    0,
  );
});
test("workshops and attendance use authorized enrolled users", async () => {
  const r = await call("andres", "POST", "/api/workshops", {
    name: "Taller de prueba",
    location: "ECA La Esperanza",
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    targetRole: "reciclador",
  });
  assert.equal(r.statusCode, 201, r.body);
  const wid = r.json().id;
  assert.equal(
    (
      await call("isabela", "PUT", `/api/workshops/${wid}/attendance`, {
        attendedIds: [],
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await call("andres", "PUT", `/api/workshops/${wid}/attendance`, {
        attendedIds: ["usr-other"],
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await call("andres", "PUT", `/api/workshops/${wid}/attendance`, {
        attendedIds: ["usr-javier"],
      })
    ).statusCode,
    200,
  );
});
test("OTP codes have attempt limits and are single use", async () => {
  const c = (
    await call("javier", "POST", "/api/auth/request-code", {
      email: "javier@demo.ecotrace.co",
    })
  ).json();
  assert.ok(c.developmentCode);
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await call("javier", "POST", "/api/auth/verify", {
          challenge: c.challenge,
          code: "000000",
        })
      ).statusCode,
      401,
    );
  assert.equal(
    (
      await call("javier", "POST", "/api/auth/verify", {
        challenge: c.challenge,
        code: c.developmentCode,
      })
    ).statusCode,
    401,
  );
  const d = (
    await call("javier", "POST", "/api/auth/request-code", {
      email: "javier@demo.ecotrace.co",
    })
  ).json();
  assert.equal(
    (
      await call("javier", "POST", "/api/auth/verify", {
        challenge: d.challenge,
        code: d.developmentCode,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await call("javier", "POST", "/api/auth/verify", {
        challenge: d.challenge,
        code: d.developmentCode,
      })
    ).statusCode,
    401,
  );
});
test("production does not expose demo login", async () => {
  const prod = await buildApp(db, {
    production: true,
    demo: true,
    origin: "https://ecotrace.example",
  });
  const r = await prod.inject("/api/auth/config");
  assert.equal(r.json().demo, false);
  assert.deepEqual(r.json().users, []);
  assert.equal(
    (
      await prod.inject({
        method: "POST",
        url: "/api/auth/demo",
        headers: { "x-ecotrace-request": "1" },
        payload: { userId: "usr-admin" },
      })
    ).statusCode,
    404,
  );
  await prod.close();
});
