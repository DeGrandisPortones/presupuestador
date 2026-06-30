/**
 * Crea el usuario "logistica" con acceso solo a Estado de Portones.
 * Uso: node scripts/seed-logistica-user.mjs
 */
import dotenv from "dotenv";
dotenv.config();

import { dbQuery, getPool } from "../src/db.js";

const USERNAME = "logistica";
const PASSWORD = "log123";

async function run() {
  const existing = await dbQuery(
    `select id from public.presupuestador_users where username = $1 limit 1`,
    [USERNAME]
  );

  if (existing.rows.length > 0) {
    console.log(`Usuario "${USERNAME}" ya existe (id=${existing.rows[0].id}). No se creó nada.`);
    await getPool().end();
    return;
  }

  const r = await dbQuery(
    `insert into public.presupuestador_users
       (username, password_hash, visible_password, full_name, is_active,
        is_distribuidor, is_vendedor, is_medidor, is_logistica, is_superuser, is_administracion,
        is_enc_comercial, is_rev_tecnica)
     values
       ($1, crypt($2, gen_salt('bf')), $2, 'Logística', true,
        false, false, false, true, false, false,
        false, false)
     returning id, username`,
    [USERNAME, PASSWORD]
  );

  const user = r.rows[0];
  console.log(`Usuario creado: id=${user.id}, username="${user.username}"`);
  await getPool().end();
}

run().catch((e) => { console.error(e); process.exit(1); });
