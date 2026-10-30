import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
export function database(connectionString) {
  const parsed = new URL(connectionString);
  if (parsed.searchParams.get('sslmode') === 'require')
    parsed.searchParams.set('sslmode', 'verify-full');
  const pool = new pg.Pool({
    connectionString: parsed.href,
    max: 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
  });
  pool.on('error', () =>
    console.error(
      'Postgres idle connection closed; the next request will reconnect.',
    ),
  );
  const db = drizzle(pool);
  // Compile positional parameters to Drizzle's parameterized SQL; only static query text is raw.
  async function query(text, values = []) {
    const parts = text
      .split(/(\$\d+)/g)
      .filter(Boolean)
      .map((part) =>
        /^\$\d+$/.test(part)
          ? sql`${values[Number(part.slice(1)) - 1]}`
          : sql.raw(part),
      );
    const result = await db.execute(sql.join(parts, sql.raw('')));
    return result.rows;
  }
  return { query, pool };
}
