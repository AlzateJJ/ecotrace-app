import { connectDatabase, migrate } from "./db.js";
import { databaseOptions, production } from "./config.js";
import { seedDemo } from "./seed.js";
if (production) throw new Error("No se cargan datos de ejemplo en producción.");
const db = await connectDatabase(databaseOptions());
try {
  await migrate(db);
  await seedDemo(db);
  console.log("Datos de demostración listos.");
} finally {
  await db.close();
}
