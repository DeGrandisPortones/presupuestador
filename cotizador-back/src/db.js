import pg from "pg";
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // En Supabase muchas veces hace falta SSL
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

export async function dbQuery(text, params = []) {
  const res = await pool.query(text, params);
  return res;
}
