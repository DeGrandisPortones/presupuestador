/**
 * PATCH ONE-TIME: Corrección de referencia PNP5981 → PNP3994
 *
 * Contexto: la puerta vinculada al portón NP3994 recibió incorrectamente
 * el número 5981 (número propio de la secuencia) en vez de 3994 (número
 * del portón al que está vinculada).
 *
 * Efecto de este patch:
 *  - Actualiza odoo_sale_order_name de 'PNP5981' a 'PNP3994'
 *  - Cuando se genere la NV (puerta saliendo de acopio), usará PNV3994
 *
 * NOTA: Si en Odoo ya existe la orden PNP5981, renombrala manualmente a PNP3994
 *       en Odoo antes o después de correr este patch.
 *
 * Uso: node src/patches/fixPnp5981ToPorton3994.js
 */

import "dotenv/config";
import { dbQuery } from "../db.js";

async function run() {
  // 1. Verificar que existe la quote afectada
  const findResult = await dbQuery(
    `SELECT id, quote_number, catalog_kind, status, odoo_sale_order_name, final_sale_order_name
     FROM public.presupuestador_quotes
     WHERE odoo_sale_order_name = 'PNP5981'`
  );

  if (findResult.rows.length === 0) {
    console.log("[fixPnp5981] No se encontró ninguna quote con odoo_sale_order_name = 'PNP5981'. Nada que hacer.");
    process.exit(0);
  }

  console.log("[fixPnp5981] Quotes encontradas:");
  for (const row of findResult.rows) {
    console.log(
      `  id=${row.id}  quote_number=${row.quote_number}  kind=${row.catalog_kind}  status=${row.status}  ` +
      `np=${row.odoo_sale_order_name}  nv=${row.final_sale_order_name ?? "(vacío)"}`
    );
  }

  if (findResult.rows.length > 1) {
    console.error("[fixPnp5981] ERROR: se encontraron múltiples quotes. Abortar y revisar manualmente.");
    process.exit(1);
  }

  const row = findResult.rows[0];
  if (row.catalog_kind !== "puerta") {
    console.error(`[fixPnp5981] ERROR: la quote encontrada es de tipo '${row.catalog_kind}', no 'puerta'. Abortar.`);
    process.exit(1);
  }

  // 2. Aplicar la corrección
  await dbQuery(
    `UPDATE public.presupuestador_quotes
     SET odoo_sale_order_name = 'PNP3994'
     WHERE id = $1`,
    [row.id]
  );

  console.log(`[fixPnp5981] OK: quote ${row.id} actualizada → odoo_sale_order_name = 'PNP3994'`);
  console.log("[fixPnp5981] Cuando se saque la puerta de acopio, la NV se generará como PNV3994.");

  process.exit(0);
}

run().catch((err) => {
  console.error("[fixPnp5981] Error inesperado:", err);
  process.exit(1);
});
