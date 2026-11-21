import { connectDatabase, migrate } from "./db.js";
import { databaseOptions } from "./config.js";
const db = await connectDatabase(databaseOptions());
try {
  await migrate(db);
  console.log("Migraciones aplicadas.");
} finally {
  await db.close();
}
