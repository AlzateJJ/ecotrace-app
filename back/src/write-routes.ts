import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DB } from "./db.js";
import {
  audit,
  event,
  getLot,
  HttpError,
  id,
  notify,
  requireRole,
  uuid,
} from "./domain.js";
const weight = z
  .number()
  .positive("El peso debe ser mayor a cero.")
  .max(50000, "El peso máximo es 50.000 kg.")
  .multipleOf(0.01);
const text = z.string().trim().min(2).max(200);
export function registerWriteRoutes(app: FastifyInstance, db: DB) {
  app.post("/api/lots", async (req, reply) => {
    const u = req.user;
    requireRole(u, ["reciclador"]);
    const b = z
      .object({
        clientId: z.uuid(),
        materialId: text,
        centerId: text,
        declaredKg: weight,
      })
      .parse(req.body);
    const result = await db.transaction(async (tx) => {
      const site = (
        await tx.query(
          "SELECT id FROM sites WHERE id=$1 AND org_id=$2 AND kind='center'",
          [b.centerId, u.org_id],
        )
      ).rows[0];
      const m = (
        await tx.query("SELECT * FROM materials WHERE id=$1", [b.materialId])
      ).rows[0];
      if (!site || !m)
        throw new HttpError(
          400,
          "Selecciona un material y un centro disponibles.",
        );
      const newId = id("LT");
      const inserted = (
        await tx.query(
          "INSERT INTO lots(id,org_id,owner_id,center_id,material_id,client_id,declared_kg,unit_price,points_rate) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(owner_id,client_id) DO NOTHING RETURNING *",
          [
            newId,
            u.org_id,
            u.id,
            b.centerId,
            b.materialId,
            b.clientId,
            b.declaredKg,
            m.price,
            m.points,
          ],
        )
      ).rows[0];
      if (!inserted) {
        const old = (
          await tx.query(
            "SELECT * FROM lots WHERE owner_id=$1 AND client_id=$2",
            [u.id, b.clientId],
          )
        ).rows[0];
        if (
          old.material_id !== b.materialId ||
          old.center_id !== b.centerId ||
          Number(old.declared_kg) !== b.declaredKg
        )
          throw new HttpError(
            409,
            "Este registro ya se sincronizó con otros datos.",
          );
        return old;
      }
      await event(
        tx,
        newId,
        u,
        "registered",
        `${b.declaredKg} kg declarados. Pendiente de pesaje.`,
      );
      return inserted;
    });
    return reply.code(201).send(result);
  });
  app.post<{ Params: { id: string } }>("/api/lots/:id/receive", async (req) => {
    const u = req.user;
    requireRole(u, ["operario"]);
    const b = z
      .object({
        accepted: z.boolean(),
        verifiedKg: weight.optional(),
        note: z.string().trim().max(1000).default(""),
      })
      .parse(req.body);
    const visible = await getLot(db, u, req.params.id);
    if (visible.center_id !== u.site_id || u.site_kind !== "center")
      throw new HttpError(
        403,
        "Solo el centro de destino puede recibir esta entrega.",
      );
    return db.transaction(async (tx) => {
      const l = (
        await tx.query("SELECT * FROM lots WHERE id=$1 FOR UPDATE", [
          visible.id,
        ])
      ).rows[0];
      if (l.status !== "declared")
        throw new HttpError(409, "Esta entrega ya fue procesada.");
      if (!b.accepted) {
        if (b.note.length < 5)
          throw new HttpError(400, "Explica el motivo del rechazo.");
        await tx.query(
          "UPDATE lots SET status='rejected',updated_at=now() WHERE id=$1",
          [l.id],
        );
        await event(tx, l.id, u, "rejected", b.note);
        await notify(tx, l.owner_id, "Entrega rechazada", `${l.id}: ${b.note}`);
        return { ok: true };
      }
      if (!b.verifiedKg)
        throw new HttpError(400, "Ingresa el peso verificado.");
      if (Number(l.declared_kg) !== b.verifiedKg && b.note.length < 5)
        throw new HttpError(
          400,
          "Explica la diferencia entre el peso declarado y el verificado.",
        );
      await tx.query(
        "UPDATE lots SET status='received',verified_kg=$2,updated_at=now() WHERE id=$1",
        [l.id, b.verifiedKg],
      );
      const amount = Math.round(b.verifiedKg * Number(l.unit_price));
      const points = Math.floor(b.verifiedKg * Number(l.points_rate));
      await tx.query(
        "INSERT INTO payments(id,org_id,lot_id,owner_id,amount) VALUES($1,$2,$3,$4,$5)",
        [uuid(), u.org_id, l.id, l.owner_id, amount],
      );
      await tx.query(
        "INSERT INTO point_movements(id,lot_id,user_id,points) VALUES($1,$2,$3,$4)",
        [uuid(), l.id, l.owner_id, points],
      );
      await event(
        tx,
        l.id,
        u,
        "received",
        `${b.verifiedKg} kg aceptados. ${b.note}`.trim(),
      );
      await notify(
        tx,
        l.owner_id,
        "Entrega recibida",
        `${l.id}: ${b.verifiedKg} kg verificados. Liquidación: $${amount.toLocaleString("es-CO")}.`,
      );
      return { ok: true, amount, points };
    });
  });
  app.post("/api/dispatches", async (req, reply) => {
    const u = req.user;
    requireRole(u, ["operario"]);
    if (u.site_kind !== "center")
      throw new HttpError(
        403,
        "El despacho se prepara desde un centro de acopio.",
      );
    const b = z
      .object({
        lotIds: z.array(text).min(1).max(100),
        destinationId: text,
        transporterId: text,
        scheduledDate: z.iso.date(),
        timeWindow: z.string().trim().min(3).max(50),
      })
      .parse(req.body);
    if (new Set(b.lotIds).size !== b.lotIds.length)
      throw new HttpError(400, "No repitas lotes en el despacho.");
    return db.transaction(async (tx) => {
      const destination = (
        await tx.query(
          "SELECT id FROM sites WHERE id=$1 AND org_id=$2 AND kind='plant'",
          [b.destinationId, u.org_id],
        )
      ).rows[0];
      const transporter = (
        await tx.query(
          "SELECT id FROM users WHERE id=$1 AND org_id=$2 AND role='transportador' AND active=true",
          [b.transporterId, u.org_id],
        )
      ).rows[0];
      if (!destination || !transporter)
        throw new HttpError(
          400,
          "El destino o el transportador no están habilitados.",
        );
      const lots = (
        await tx.query(
          "SELECT * FROM lots WHERE org_id=$1 AND id=ANY($2::text[]) ORDER BY id FOR UPDATE",
          [u.org_id, b.lotIds],
        )
      ).rows;
      if (
        lots.length !== b.lotIds.length ||
        lots.some(
          (l) =>
            l.center_id !== u.site_id ||
            l.status !== "received" ||
            l.dispatch_id,
        )
      )
        throw new HttpError(
          409,
          "Hay lotes que ya no están disponibles para este despacho.",
        );
      const did = id("DSP");
      await tx.query(
        "INSERT INTO dispatches(id,org_id,origin_id,destination_id,transporter_id,scheduled_date,time_window) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          did,
          u.org_id,
          u.site_id,
          b.destinationId,
          b.transporterId,
          b.scheduledDate,
          b.timeWindow,
        ],
      );
      for (const l of lots) {
        await tx.query(
          "UPDATE lots SET dispatch_id=$2,updated_at=now() WHERE id=$1",
          [l.id, did],
        );
        await event(tx, l.id, u, "dispatched", `Asignado al despacho ${did}.`);
      }
      await notify(
        tx,
        b.transporterId,
        "Nueva recogida asignada",
        `${did} · ${lots.length} lotes · ${b.timeWindow}`,
      );
      return reply.code(201).send({ id: did });
    });
  });
  app.post<{ Params: { id: string } }>(
    "/api/dispatches/:id/load",
    async (req) => {
      const u = req.user;
      requireRole(u, ["transportador"]);
      const b = z
        .object({ scannedLotIds: z.array(text).min(1).max(100) })
        .parse(req.body);
      return db.transaction(async (tx) => {
        const d = (
          await tx.query(
            "SELECT * FROM dispatches WHERE id=$1 AND org_id=$2 AND transporter_id=$3 FOR UPDATE",
            [req.params.id, u.org_id, u.id],
          )
        ).rows[0];
        if (!d) throw new HttpError(404, "Despacho no disponible.");
        if (d.status !== "prepared")
          throw new HttpError(409, "El despacho ya fue cargado.");
        const lots = (
          await tx.query(
            "SELECT * FROM lots WHERE dispatch_id=$1 ORDER BY id FOR UPDATE",
            [d.id],
          )
        ).rows;
        if (
          new Set(b.scannedLotIds).size !== lots.length ||
          b.scannedLotIds.length !== lots.length ||
          lots.some((l) => !b.scannedLotIds.includes(l.id))
        )
          throw new HttpError(
            400,
            "Confirma todos los códigos de los lotes asignados.",
          );
        await tx.query("UPDATE dispatches SET status='transit' WHERE id=$1", [
          d.id,
        ]);
        for (const l of lots) {
          await tx.query(
            "UPDATE lots SET status='transit',updated_at=now() WHERE id=$1",
            [l.id],
          );
          await event(
            tx,
            l.id,
            u,
            "loaded",
            "Carga confirmada por el transportador. En tránsito.",
          );
          await notify(
            tx,
            l.owner_id,
            "Tu lote va en camino",
            `${l.id} salió del centro de acopio.`,
          );
        }
        return { ok: true };
      });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/dispatches/:id/arrive",
    async (req) => {
      const u = req.user;
      requireRole(u, ["transportador"]);
      return db.transaction(async (tx) => {
        const d = (
          await tx.query(
            "SELECT * FROM dispatches WHERE id=$1 AND org_id=$2 AND transporter_id=$3 FOR UPDATE",
            [req.params.id, u.org_id, u.id],
          )
        ).rows[0];
        if (!d) throw new HttpError(404, "Despacho no disponible.");
        if (d.status !== "transit")
          throw new HttpError(409, "El despacho debe estar en tránsito.");
        await tx.query(
          "UPDATE dispatches SET status='awaiting_receipt' WHERE id=$1",
          [d.id],
        );
        for (const l of (
          await tx.query("SELECT id FROM lots WHERE dispatch_id=$1", [d.id])
        ).rows)
          await event(
            tx,
            l.id,
            u,
            "arrived",
            "Llegada registrada. Pendiente de verificación de la planta.",
          );
        for (const p of (
          await tx.query(
            "SELECT id FROM users WHERE site_id=$1 AND role='operario' AND active=true",
            [d.destination_id],
          )
        ).rows)
          await notify(
            tx,
            p.id,
            "Material por recibir",
            `${d.id} está esperando verificación en planta.`,
          );
        return { ok: true };
      });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/dispatches/:id/receive",
    async (req) => {
      const u = req.user;
      requireRole(u, ["operario"]);
      if (u.site_kind !== "plant")
        throw new HttpError(403, "La recepción final corresponde a la planta.");
      const b = z
        .object({
          lots: z
            .array(z.object({ id: text, kg: weight }))
            .min(1)
            .max(100),
          note: z.string().trim().max(1000).default(""),
        })
        .parse(req.body);
      return db.transaction(async (tx) => {
        const d = (
          await tx.query(
            "SELECT * FROM dispatches WHERE id=$1 AND org_id=$2 AND destination_id=$3 FOR UPDATE",
            [req.params.id, u.org_id, u.site_id],
          )
        ).rows[0];
        if (!d) throw new HttpError(404, "Despacho no disponible.");
        if (d.status !== "awaiting_receipt")
          throw new HttpError(
            409,
            "El transportador debe registrar primero su llegada.",
          );
        const lots = (
          await tx.query(
            "SELECT l.*,m.name AS material_name,s.name AS origin_name,u.association FROM lots l JOIN materials m ON m.id=l.material_id JOIN sites s ON s.id=l.center_id JOIN users u ON u.id=l.owner_id WHERE l.dispatch_id=$1 ORDER BY l.id FOR UPDATE OF l",
            [d.id],
          )
        ).rows;
        if (
          b.lots.length !== lots.length ||
          new Set(b.lots.map((l) => l.id)).size !== lots.length ||
          lots.some((l) => !b.lots.some((x) => x.id === l.id))
        )
          throw new HttpError(
            400,
            "Registra el peso de cada lote del despacho.",
          );
        const mismatch = lots.some(
          (l) =>
            Number(l.verified_kg) !== b.lots.find((x) => x.id === l.id)!.kg,
        );
        if (mismatch && b.note.length < 5)
          throw new HttpError(
            400,
            "Explica las diferencias de peso antes de confirmar.",
          );
        for (const l of lots) {
          const kg = b.lots.find((x) => x.id === l.id)!.kg;
          await tx.query(
            "UPDATE lots SET status='delivered',destination_kg=$2,updated_at=now() WHERE id=$1",
            [l.id, kg],
          );
          await event(
            tx,
            l.id,
            u,
            "delivered",
            `${kg} kg verificados en planta. ${b.note}`.trim(),
          );
          if (Number(l.verified_kg) !== kg)
            await tx.query(
              "INSERT INTO incidents(id,org_id,lot_id,reporter_id,description) VALUES($1,$2,$3,$4,$5)",
              [
                uuid(),
                u.org_id,
                l.id,
                u.id,
                `Diferencia de peso: ${l.verified_kg} kg en acopio, ${kg} kg en planta. ${b.note}`,
              ],
            );
          const snapshot = {
            lot_id: l.id,
            kg,
            material: l.material_name,
            origin: l.origin_name,
            destination: u.site_name,
            association: l.association,
            received_at: new Date().toISOString(),
          };
          await tx.query(
            "INSERT INTO certificates(id,org_id,lot_id,verification_code,snapshot) VALUES($1,$2,$3,$4,$5)",
            [id("CO"), u.org_id, l.id, uuid(), JSON.stringify(snapshot)],
          );
          await notify(
            tx,
            l.owner_id,
            "Tu material llegó a la planta",
            `${l.id}: recepción final de ${kg} kg confirmada.`,
          );
        }
        await tx.query("UPDATE dispatches SET status='delivered' WHERE id=$1", [
          d.id,
        ]);
        return { ok: true };
      });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/lots/:id/incidents",
    async (req) => {
      const b = z
        .object({
          description: z
            .string()
            .trim()
            .min(10, "Describe la novedad con al menos 10 caracteres.")
            .max(1000),
        })
        .parse(req.body);
      const l = await getLot(db, req.user, req.params.id);
      await db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO incidents(id,org_id,lot_id,reporter_id,description) VALUES($1,$2,$3,$4,$5)",
          [uuid(), req.user.org_id, l.id, req.user.id, b.description],
        );
        await event(tx, l.id, req.user, "incident", b.description);
      });
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/payments/:id/paid",
    async (req) => {
      const u = req.user;
      requireRole(u, ["empresa", "admin"]);
      const b = z
        .object({
          reference: z
            .string()
            .trim()
            .min(4, "Escribe la referencia del comprobante.")
            .max(120),
        })
        .parse(req.body);
      return db.transaction(async (tx) => {
        const p = (
          await tx.query(
            "SELECT * FROM payments WHERE id=$1 AND org_id=$2 FOR UPDATE",
            [req.params.id, u.org_id],
          )
        ).rows[0];
        if (!p) throw new HttpError(404, "Liquidación no disponible.");
        if (p.status !== "pending")
          throw new HttpError(409, "Este pago ya fue registrado.");
        await tx.query(
          "UPDATE payments SET status='paid',reference=$2,paid_at=now() WHERE id=$1",
          [p.id, b.reference],
        );
        await audit(tx, u, "payment_recorded", p.id);
        await notify(
          tx,
          p.owner_id,
          "Pago registrado",
          `${p.lot_id}: comprobante ${b.reference}.`,
        );
        return { ok: true };
      });
    },
  );
  app.post("/api/workshops", async (req, reply) => {
    const u = req.user;
    requireRole(u, ["capacitador"]);
    const b = z
      .object({
        name: text,
        location: text,
        startsAt: z.iso.datetime(),
        targetRole: z.enum(["reciclador", "operario", "transportador"]),
      })
      .parse(req.body);
    if (new Date(b.startsAt).getTime() < Date.now())
      throw new HttpError(400, "Selecciona una fecha futura.");
    return db.transaction(async (tx) => {
      const wid = uuid();
      await tx.query(
        "INSERT INTO workshops(id,org_id,trainer_id,name,location,starts_at,target_role) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [wid, u.org_id, u.id, b.name, b.location, b.startsAt, b.targetRole],
      );
      const users = (
        await tx.query(
          "SELECT id FROM users WHERE org_id=$1 AND role=$2 AND active=true",
          [u.org_id, b.targetRole],
        )
      ).rows;
      for (const person of users) {
        await tx.query(
          "INSERT INTO attendance(workshop_id,user_id) VALUES($1,$2)",
          [wid, person.id],
        );
        await notify(
          tx,
          person.id,
          "Nuevo taller",
          `${b.name} · ${b.location}`,
        );
      }
      await audit(tx, u, "workshop_created", wid);
      return reply.code(201).send({ id: wid });
    });
  });
  app.put<{ Params: { id: string } }>(
    "/api/workshops/:id/attendance",
    async (req) => {
      const u = req.user;
      requireRole(u, ["capacitador"]);
      const b = z
        .object({ attendedIds: z.array(text).max(500) })
        .parse(req.body);
      return db.transaction(async (tx) => {
        const w = (
          await tx.query(
            "SELECT * FROM workshops WHERE id=$1 AND org_id=$2 AND trainer_id=$3 FOR UPDATE",
            [req.params.id, u.org_id, u.id],
          )
        ).rows[0];
        if (!w) throw new HttpError(404, "Taller no disponible.");
        const enrolled = (
          await tx.query(
            "SELECT user_id FROM attendance WHERE workshop_id=$1",
            [w.id],
          )
        ).rows.map((r) => r.user_id);
        if (b.attendedIds.some((x) => !enrolled.includes(x)))
          throw new HttpError(
            400,
            "Solo puedes registrar la asistencia de personas inscritas.",
          );
        await tx.query(
          "UPDATE attendance SET attended=false WHERE workshop_id=$1",
          [w.id],
        );
        for (const uid of new Set(b.attendedIds))
          await tx.query(
            "UPDATE attendance SET attended=true WHERE workshop_id=$1 AND user_id=$2",
            [w.id, uid],
          );
        await audit(tx, u, "attendance_updated", w.id);
        return { ok: true };
      });
    },
  );
  app.patch("/api/profile", async (req) => {
    const b = z
      .object({
        name: text,
        phone: z
          .string()
          .regex(/^[+\d ()-]{0,25}$/, "El teléfono no es válido."),
        paymentAccount: z.string().trim().max(120).optional(),
      })
      .strict()
      .parse(req.body);
    if (b.paymentAccount !== undefined && req.user.role !== "reciclador")
      throw new HttpError(403, "Este perfil no tiene cuenta de pagos.");
    await db.query(
      "UPDATE users SET name=$2,phone=$3,payment_account=COALESCE($4,payment_account) WHERE id=$1",
      [req.user.id, b.name, b.phone, b.paymentAccount ?? null],
    );
    return { ok: true };
  });
  app.post("/api/notifications/read", async (req) => {
    await db.query(
      "UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL",
      [req.user.id],
    );
    return { ok: true };
  });
  app.patch("/api/organization", async (req) => {
    requireRole(req.user, ["empresa", "admin"]);
    const b = z.object({ goalKg: weight }).parse(req.body);
    await db.query("UPDATE organizations SET goal_kg=$2 WHERE id=$1", [
      req.user.org_id,
      b.goalKg,
    ]);
    return { ok: true };
  });
  app.post("/api/users", async (req, reply) => {
    const u = req.user;
    requireRole(u, ["admin"]);
    const b = z
      .object({
        name: text,
        email: z.email().transform((v) => v.toLowerCase().trim()),
        role: z.enum([
          "reciclador",
          "operario",
          "transportador",
          "empresa",
          "capacitador",
          "admin",
        ]),
        siteId: z.string().optional(),
        association: z.string().trim().max(150).default(""),
      })
      .strict()
      .parse(req.body);
    if (b.role === "operario" && !b.siteId)
      throw new HttpError(400, "Asigna un centro o planta al operario.");
    if (
      b.siteId &&
      !(
        await db.query("SELECT id FROM sites WHERE id=$1 AND org_id=$2", [
          b.siteId,
          u.org_id,
        ])
      ).rows.length
    )
      throw new HttpError(400, "La sede no pertenece a tu organización.");
    const uid = uuid();
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO users(id,org_id,site_id,name,email,role,association) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          uid,
          u.org_id,
          b.siteId ?? null,
          b.name,
          b.email,
          b.role,
          b.association,
        ],
      );
      await audit(tx, u, "user_created", uid);
    });
    return reply.code(201).send({ id: uid });
  });
  app.patch<{ Params: { id: string } }>("/api/users/:id", async (req) => {
    const u = req.user;
    requireRole(u, ["admin"]);
    const b = z.object({ active: z.boolean() }).strict().parse(req.body);
    if (req.params.id === u.id)
      throw new HttpError(400, "No puedes deshabilitar tu propia cuenta.");
    return db.transaction(async (tx) => {
      const updated = (
        await tx.query(
          "UPDATE users SET active=$3 WHERE id=$1 AND org_id=$2 RETURNING id",
          [req.params.id, u.org_id, b.active],
        )
      ).rows[0];
      if (!updated) throw new HttpError(404, "Usuario no disponible.");
      if (!b.active)
        await tx.query("DELETE FROM sessions WHERE user_id=$1", [
          req.params.id,
        ]);
      await audit(
        tx,
        u,
        b.active ? "user_enabled" : "user_disabled",
        req.params.id,
      );
      return { ok: true };
    });
  });
  app.post("/api/sites", async (req, reply) => {
    const u = req.user;
    requireRole(u, ["admin"]);
    const b = z
      .object({ name: text, kind: z.enum(["center", "plant"]), address: text })
      .parse(req.body);
    const sid = uuid();
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO sites(id,org_id,name,kind,address) VALUES($1,$2,$3,$4,$5)",
        [sid, u.org_id, b.name, b.kind, b.address],
      );
      await audit(tx, u, "site_created", sid);
    });
    return reply.code(201).send({ id: sid });
  });
}
