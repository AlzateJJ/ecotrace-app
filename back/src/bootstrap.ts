import type { DB } from "./db.js";
import { uuid } from "./domain.js";
import { emailSchema, passwordSchema, hashPassword } from "./password.js";

export async function bootstrapOrganization(
  db: DB,
  orgId: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!!email !== !!password)
    throw new Error(
      "Configura ambos BOOTSTRAP_ADMIN_EMAIL y BOOTSTRAP_ADMIN_PASSWORD, o deja ambos vacíos.",
    );
  const admin =
    email && password
      ? {
          email: emailSchema.parse(email),
          password: passwordSchema.parse(password),
        }
      : undefined;
  await db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO organizations(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
      [orgId, env.BOOTSTRAP_ORG_NAME?.trim() || "EcoTrace"],
    );
    if (!admin) return;
    // Serialize bootstrap across replicas. Never promote an existing public account.
    await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
      orgId,
    ]);
    const existing = (
      await tx.query(
        "SELECT org_id,role FROM users WHERE lower(trim(email))=$1",
        [admin.email],
      )
    ).rows[0];
    if (existing) {
      if (existing.org_id !== orgId || existing.role !== "admin")
        throw new Error(
          "El correo de bootstrap ya pertenece a otra cuenta. No se modificaron sus permisos.",
        );
      return;
    }
    await tx.query(
      "INSERT INTO users(id,org_id,name,email,role,password_hash) VALUES($1,$2,$3,$4,'admin',$5)",
      [
        uuid(),
        orgId,
        env.BOOTSTRAP_ADMIN_NAME?.trim() || "Administrador",
        admin.email,
        await hashPassword(admin.password),
      ],
    );
  });
}
