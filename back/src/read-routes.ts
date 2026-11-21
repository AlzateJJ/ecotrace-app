import type { FastifyInstance } from "fastify";
import PDFDocument from "pdfkit";
import type { DB } from "./db.js";
import {
  getLot,
  lotQuery,
  lotScope,
  requireRole,
  safeUser,
  HttpError,
} from "./domain.js";
export function registerReadRoutes(app: FastifyInstance, db: DB) {
  app.get("/api/bootstrap", async (req) => {
    const u = req.user;
    const scope = lotScope(u);
    const broad = ["empresa", "admin"].includes(u.role);
    const training = ["capacitador", "admin"].includes(u.role);
    const lots = (
      await db.query(
        `${lotQuery} WHERE ${scope.sql} ORDER BY l.created_at DESC`,
        scope.params,
      )
    ).rows;
    const org = (
      await db.query("SELECT * FROM organizations WHERE id=$1", [u.org_id])
    ).rows[0];
    const sites = (
      await db.query("SELECT * FROM sites WHERE org_id=$1 ORDER BY kind,name", [
        u.org_id,
      ])
    ).rows;
    let dispatches: any[] = [];
    if (["operario", "transportador", "empresa", "admin"].includes(u.role)) {
      let where = "d.org_id=$1";
      const params: any[] = [u.org_id];
      if (u.role === "operario") {
        params.push(u.site_id);
        where += " AND (d.origin_id=$2 OR d.destination_id=$2)";
      }
      if (u.role === "transportador") {
        params.push(u.id);
        where += " AND d.transporter_id=$2";
      }
      dispatches = (
        await db.query(
          `SELECT d.*,o.name AS origin_name,p.name AS destination_name,o.address AS origin_address,p.address AS destination_address,t.name AS transporter_name FROM dispatches d JOIN sites o ON o.id=d.origin_id JOIN sites p ON p.id=d.destination_id JOIN users t ON t.id=d.transporter_id WHERE ${where} ORDER BY d.scheduled_date DESC,d.created_at DESC`,
          params,
        )
      ).rows;
      dispatches = dispatches.map((d) => ({
        ...d,
        lots: lots.filter((l) => l.dispatch_id === d.id),
      }));
    }
    const payments =
      broad || u.role === "reciclador"
        ? (
            await db.query(
              `SELECT p.*,u.name AS owner_name,m.name AS material_name,l.verified_kg,l.unit_price FROM payments p JOIN users u ON u.id=p.owner_id JOIN lots l ON l.id=p.lot_id JOIN materials m ON m.id=l.material_id WHERE p.org_id=$1 ${u.role === "reciclador" ? "AND p.owner_id=$2" : ""} ORDER BY p.created_at DESC`,
              u.role === "reciclador" ? [u.org_id, u.id] : [u.org_id],
            )
          ).rows
        : [];
    const team = training
      ? (
          await db.query(
            `SELECT u.id,u.name,u.role,u.phone,u.association,u.last_active,(SELECT count(*)::integer FROM lots l WHERE l.owner_id=u.id) AS deliveries FROM users u WHERE u.org_id=$1 AND u.active AND u.role IN ('reciclador','operario','transportador') ORDER BY u.last_active ASC NULLS FIRST`,
            [u.org_id],
          )
        ).rows
      : [];
    const workshops = training
      ? (
          await db.query(
            `SELECT w.*,COALESCE((SELECT json_agg(json_build_object('user_id',a.user_id,'name',u.name,'attended',a.attended) ORDER BY u.name) FROM attendance a JOIN users u ON u.id=a.user_id WHERE a.workshop_id=w.id),'[]') AS attendance FROM workshops w WHERE w.org_id=$1 ${u.role === "capacitador" ? "AND w.trainer_id=$2" : ""} ORDER BY w.starts_at`,
            u.role === "capacitador" ? [u.org_id, u.id] : [u.org_id],
          )
        ).rows
      : [];
    const certificates = broad
      ? (
          await db.query(
            "SELECT * FROM certificates WHERE org_id=$1 ORDER BY created_at DESC",
            [u.org_id],
          )
        ).rows
      : [];
    const users =
      u.role === "admin"
        ? (
            await db.query(
              "SELECT id,name,email,phone,role,site_id,active FROM users WHERE org_id=$1 ORDER BY name",
              [u.org_id],
            )
          ).rows
        : [];
    const transporters =
      u.role === "operario" || u.role === "admin"
        ? (
            await db.query(
              "SELECT id,name FROM users WHERE org_id=$1 AND role='transportador' AND active=true",
              [u.org_id],
            )
          ).rows
        : [];
    const points =
      u.role === "reciclador"
        ? Number(
            (
              await db.query(
                "SELECT COALESCE(sum(points),0) AS total FROM point_movements WHERE user_id=$1",
                [u.id],
              )
            ).rows[0].total,
          )
        : 0;
    const notifications = (
      await db.query(
        "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
        [u.id],
      )
    ).rows;
    const materials = (
      await db.query("SELECT * FROM materials ORDER BY price DESC")
    ).rows;
    return {
      user: safeUser(u),
      organization: org,
      sites,
      materials,
      lots,
      dispatches,
      payments,
      team,
      workshops,
      certificates,
      users,
      transporters,
      points,
      notifications,
    };
  });
  app.get<{ Params: { id: string } }>("/api/lots/:id", async (req) => {
    const lot = await getLot(db, req.user, req.params.id);
    const events = (
      await db.query(
        "SELECT e.*,u.name AS actor_name FROM lot_events e JOIN users u ON u.id=e.actor_id WHERE e.lot_id=$1 ORDER BY e.created_at,e.id",
        [lot.id],
      )
    ).rows;
    const incidents = (
      await db.query(
        "SELECT i.*,u.name AS reporter_name FROM incidents i JOIN users u ON u.id=i.reporter_id WHERE i.lot_id=$1 ORDER BY i.created_at DESC",
        [lot.id],
      )
    ).rows;
    return { ...lot, events, incidents };
  });
  app.get<{ Params: { code: string } }>("/api/verify/:code", async (req) => {
    const c = (
      await db.query(
        "SELECT id,snapshot,created_at FROM certificates WHERE verification_code=$1",
        [req.params.code],
      )
    ).rows[0];
    if (!c)
      throw new HttpError(
        404,
        "No encontramos un certificado con este código.",
      );
    return c;
  });
  app.get<{ Params: { id: string } }>(
    "/api/certificates/:id/pdf",
    async (req, reply) => {
      requireRole(req.user, ["empresa", "admin"]);
      const c = (
        await db.query("SELECT * FROM certificates WHERE id=$1 AND org_id=$2", [
          req.params.id,
          req.user.org_id,
        ])
      ).rows[0];
      if (!c) throw new HttpError(404, "Certificado no disponible.");
      const pdf = new PDFDocument({ size: "A4", margin: 55 });
      const chunks: Buffer[] = [];
      const done = new Promise<Buffer>((resolve, reject) => {
        pdf.on("data", (x) => chunks.push(x));
        pdf.on("end", () => resolve(Buffer.concat(chunks)));
        pdf.on("error", reject);
      });
      pdf.fillColor("#176348").fontSize(30).text("EcoTrace");
      pdf.moveDown().fontSize(21).text("Certificado de origen");
      pdf.fillColor("#243b31").fontSize(12).moveDown().text(c.id).moveDown();
      for (const [label, value] of [
        ["Lote", c.snapshot.lot_id],
        ["Material", c.snapshot.material],
        ["Peso recibido", `${c.snapshot.kg} kg`],
        ["Origen", c.snapshot.origin],
        ["Destino", c.snapshot.destination],
        ["Asociación", c.snapshot.association],
        [
          "Recepción",
          new Date(c.snapshot.received_at).toLocaleDateString("es-CO", {
            timeZone: "America/Bogota",
          }),
        ],
      ])
        pdf
          .font("Helvetica-Bold")
          .text(label)
          .font("Helvetica")
          .text(String(value))
          .moveDown(0.7);
      pdf
        .moveDown()
        .fontSize(10)
        .text("Código de verificación: " + c.verification_code)
        .moveDown()
        .text(
          "Este documento acredita los registros de recepción de EcoTrace. No constituye una certificación ambiental de un tercero.",
        );
      pdf.end();
      return reply
        .type("application/pdf")
        .header("Content-Disposition", `attachment; filename="${c.id}.pdf"`)
        .send(await done);
    },
  );
  app.get("/api/reports/lots.csv", async (req, reply) => {
    requireRole(req.user, ["empresa", "admin"]);
    const rows = (
      await db.query(
        `${lotQuery} WHERE l.org_id=$1 ORDER BY l.created_at DESC`,
        [req.user.org_id],
      )
    ).rows;
    const escape = (v: any) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@-]/, "'")
        .replaceAll('"', '""') +
      '"';
    const csv = [
      [
        "Lote",
        "Material",
        "Centro",
        "Reciclador",
        "Kg declarados",
        "Kg verificados",
        "Kg en planta",
        "Estado",
        "Fecha",
      ],
      ...rows.map((l) => [
        l.id,
        l.material_name,
        l.center_name,
        l.owner_name,
        l.declared_kg,
        l.verified_kg,
        l.destination_kg,
        l.status,
        new Date(l.created_at).toISOString(),
      ]),
    ]
      .map((r) => r.map(escape).join(";"))
      .join("\r\n");
    return reply
      .type("text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        'attachment; filename="ecotrace-lotes.csv"',
      )
      .send("\uFEFF" + csv);
  });
}
