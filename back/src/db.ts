import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface DB {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (db: DB) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function connectDatabase(
  options: { url?: string; embedded?: string | true; ssl?: boolean } = {},
): Promise<DB> {
  if (options.url) {
    const pool = new pg.Pool({
      connectionString: options.url,
      max: 10,
      ssl: options.ssl ? { rejectUnauthorized: true } : undefined,
    });
    const query = async (sql: string, params: any[] = []) => {
      const r = await pool.query(sql, params);
      return { rows: r.rows };
    };
    return {
      query,
      exec: (sql) => pool.query(sql),
      close: () => pool.end(),
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const tx: DB = {
            query: async (s, p) => ({ rows: (await client.query(s, p)).rows }),
            exec: (s) => client.query(s),
            close: async () => {},
            transaction: (f) => f(tx),
          };
          const result = await fn(tx);
          await client.query("COMMIT");
          return result;
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      },
    };
  }
  if (!options.embedded)
    throw new Error(
      "Configura DATABASE_URL o habilita DEV_EMBEDDED_DB para desarrollo local.",
    );
  if (typeof options.embedded === "string")
    await mkdir(dirname(options.embedded), { recursive: true });
  const local = new PGlite(
    options.embedded === true ? undefined : options.embedded,
  );
  await local.waitReady;
  const wrap = (client: any): DB => ({
    query: (s, p) => client.query(s, p),
    exec: (s) => client.exec(s),
    close: () => local.close(),
    transaction: (fn) => client.transaction((tx: any) => fn(wrap(tx))),
  });
  return wrap(local);
}

export async function migrate(db: DB) {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  await db.transaction(async (tx) => {
    await tx.query("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");
    for (const [version, file] of [
      ["001", "001_initial.sql"],
      ["002", "002_password_auth.sql"],
    ]) {
      if (
        (
          await tx.query(
            "SELECT version FROM schema_migrations WHERE version=$1",
            [version],
          )
        ).rows.length
      )
        continue;
      await tx.exec(
        await readFile(
          new URL(`../migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
      await tx.query("INSERT INTO schema_migrations(version) VALUES ($1)", [
        version,
      ]);
    }
  });
}
