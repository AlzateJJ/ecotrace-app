import { connectDatabase, migrate } from "./db.js";
import { databaseOptions, production, validateProduction } from "./config.js";
import { seedDemo, seedMaterials } from "./seed.js";
import { buildApp } from "./app.js";
import { uuid } from "./domain.js";
validateProduction();
const db = await connectDatabase(databaseOptions());
await migrate(db);
await seedMaterials(db);
const demo = !production && process.env.DEMO_MODE !== "false";
if (demo) await seedDemo(db);
if (
  production &&
  !(await db.query("SELECT id FROM users LIMIT 1")).rows.length
) {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email)
    throw new Error(
      "Configura BOOTSTRAP_ADMIN_EMAIL para crear la primera cuenta.",
    );
  await db.transaction(async (tx) => {
    const org = uuid();
    await tx.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
      org,
      process.env.BOOTSTRAP_ORG_NAME || "Mi organización",
    ]);
    await tx.query(
      "INSERT INTO users(id,org_id,name,email,role) VALUES($1,$2,$3,$4,'admin')",
      [uuid(), org, process.env.BOOTSTRAP_ADMIN_NAME || "Administrador", email],
    );
  });
}
const app = await buildApp(db, {
  production,
  demo,
  origin: process.env.APP_ORIGIN,
  logger: true,
});
await app.listen({
  host: production ? "::" : "127.0.0.1",
  port: Number(process.env.PORT || 3001),
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
