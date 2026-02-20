import pg from "pg";
const { Pool } = pg;

// IMPORTANTE (ESM): los imports se evalúan antes de que corra dotenv.config() en index.js.
// Para evitar leer process.env "vacío" al importar este módulo, inicializamos el Pool
// de forma perezosa (cuando realmente se hace la primera query).
let _pool = null;

function buildPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_URL en el entorno");

  // En Supabase muchas veces hace falta SSL. Si tu server NO soporta SSL, seteá PGSSLMODE=disable.
  const ssl = process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false };

  return new Pool({
    connectionString,
    ssl,
  });
}

export function getPool() {
  if (!_pool) _pool = buildPool();
  return _pool;
}

export async function dbQuery(text, params = []) {
  const res = await getPool().query(text, params);
  return res;
}
