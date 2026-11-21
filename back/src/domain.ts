import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";
export type Role =
  | "reciclador"
  | "operario"
  | "transportador"
  | "empresa"
  | "capacitador"
  | "admin";
export interface User {
  id: string;
  org_id: string;
  site_id: string | null;
  name: string;
  email: string;
  phone: string;
  role: Role;
  association: string;
  payment_account: string;
  site_kind?: string;
  site_name?: string;
}
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const requireRole = (u: User, roles: Role[]) => {
  if (!roles.includes(u.role))
    throw new HttpError(
      403,
      "Tu perfil no tiene permiso para realizar esta acción.",
    );
};
export const id = (prefix: string) =>
  `${prefix}-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
export const uuid = () => randomUUID();
export const lotQuery = `SELECT l.*, m.name AS material_name, s.name AS center_name, s.address AS center_address, u.name AS owner_name, d.transporter_id, d.destination_id, d.status AS dispatch_status FROM lots l JOIN materials m ON m.id=l.material_id JOIN sites s ON s.id=l.center_id JOIN users u ON u.id=l.owner_id LEFT JOIN dispatches d ON d.id=l.dispatch_id`;
export function lotScope(u: User, start = 1): { sql: string; params: any[] } {
  const params: any[] = [u.org_id];
  let sql = `l.org_id=$${start}`;
  if (u.role === "reciclador") {
    params.push(u.id);
    sql += ` AND l.owner_id=$${start + 1}`;
  }
  if (u.role === "operario") {
    params.push(u.site_id);
    sql += ` AND (l.center_id=$${start + 1} OR d.destination_id=$${start + 1})`;
  }
  if (u.role === "transportador") {
    params.push(u.id);
    sql += ` AND d.transporter_id=$${start + 1}`;
  }
  if (u.role === "capacitador") sql += " AND false";
  return { sql, params };
}
export async function getLot(db: DB, u: User, lotId: string) {
  const scope = lotScope(u, 2);
  const lot = (
    await db.query(`${lotQuery} WHERE l.id=$1 AND ${scope.sql}`, [
      lotId,
      ...scope.params,
    ])
  ).rows[0];
  if (!lot)
    throw new HttpError(404, "No se encontró el lote o no tienes acceso.");
  return lot;
}
export async function event(
  db: DB,
  lotId: string,
  u: User,
  action: string,
  detail: string,
) {
  await db.query(
    "INSERT INTO lot_events(id,lot_id,actor_id,action,detail) VALUES($1,$2,$3,$4,$5)",
    [uuid(), lotId, u.id, action, detail],
  );
  await db.query("UPDATE users SET last_active=now() WHERE id=$1", [u.id]);
}
export async function notify(
  db: DB,
  userId: string,
  title: string,
  body: string,
) {
  await db.query(
    "INSERT INTO notifications(id,user_id,title,body) VALUES($1,$2,$3,$4)",
    [uuid(), userId, title, body],
  );
}
export async function audit(db: DB, u: User, action: string, resource: string) {
  await db.query(
    "INSERT INTO audit_log(id,org_id,actor_id,action,resource_id) VALUES($1,$2,$3,$4,$5)",
    [uuid(), u.org_id, u.id, action, resource],
  );
}
export function safeUser(u: User) {
  return {
    id: u.id,
    org_id: u.org_id,
    site_id: u.site_id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    association: u.association,
    payment_account: u.role === "reciclador" ? u.payment_account : undefined,
    site_kind: u.site_kind,
    site_name: u.site_name,
  };
}
