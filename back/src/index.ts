import { connectDatabase, migrate } from "./db.js";
import { databaseOptions, production, validateProduction } from "./config.js";
import { seedDemo, seedMaterials } from "./seed.js";
import { buildApp } from "./app.js";
import { bootstrapOrganization } from "./bootstrap.js";
validateProduction();
const db = await connectDatabase(databaseOptions());
await migrate(db);
await seedMaterials(db);
const demo = !production && process.env.DEMO_MODE !== "false";
if (demo) await seedDemo(db);
const registrationOrgId =
  process.env.PUBLIC_REGISTRATION_ORG_ID?.trim() ||
  (demo ? "org-demo" : "org-ecotrace");
await bootstrapOrganization(db, registrationOrgId);
const app = await buildApp(db, {
  production,
  demo,
  origin: process.env.APP_ORIGIN,
  logger: true,
  registrationOrgId,
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
