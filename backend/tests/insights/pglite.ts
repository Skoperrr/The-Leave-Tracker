// Test-only PostgreSQL-in-WASM bridge. Production always uses Prisma's pg pool.
import { PGlite } from "@electric-sql/pglite";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.js";
export async function insightsTestDatabase() {
  const sql = new PGlite();
  await sql.exec(
    await readFile(
      new URL(
        "../../prisma/migrations/20261013090000_initial/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await sql.exec(
    await readFile(
      new URL(
        "../../prisma/migrations/20261013170000_calendar_integration/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await sql.exec(
    await readFile(
      new URL(
        "../../prisma/migrations/20261013180000_unique_org_google_calendar/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const queries: string[] = [];
  type Query = {
    text: string;
    values?: unknown[];
    rowMode?: "array";
    types?: {
      getTypeParser(oid: number, format: string): (value: string) => unknown;
    };
  };
  const query = async (input: Query | string) => {
    const request = typeof input === "string" ? { text: input } : input;
    queries.push(request.text);
    const parsers: Record<number, (value: string) => unknown> = {};
    // Honour pg's text parsers, including Prisma's raw date/numeric parsers.
    for (const oid of [
      16, 17, 20, 21, 23, 25, 26, 700, 701, 1042, 1043, 1082, 1114, 1184, 1186,
      1700, 2950, 114, 3802,
    ]) {
      parsers[oid] =
        request.types?.getTypeParser(oid, "text") ??
        pg.types.getTypeParser(oid);
    }
    const result = await sql.query(request.text, request.values ?? [], {
      rowMode: request.rowMode ?? "array",
      parsers,
    });
    return {
      rows: result.rows,
      fields: result.fields,
      rowCount: result.affectedRows ?? result.rows.length,
    };
  };
  const connection = Object.assign(new EventEmitter(), { query, release() {} });
  const pool = new pg.Pool();
  Object.defineProperty(pool, "query", { value: query });
  Object.defineProperty(pool, "connect", { value: async () => connection });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  return {
    db,
    sql,
    queries,
    async close() {
      await db.$disconnect();
      await pool.end();
      await sql.close();
    },
  };
}
