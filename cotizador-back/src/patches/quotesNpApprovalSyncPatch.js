import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function readTargetFile() {
  const filename = fileURLToPath(import.meta.url);
  const dirname = path.dirname(filename);
  const target = path.resolve(dirname, "../routes/quotes.routes.js");
  return { target, content: fs.readFileSync(target, "utf8") };
}

export function applyQuotesNpApprovalSyncPatch() {
  const { target, content } = readTargetFile();
  let next = content;

  // Punto quirurgico del fix:
  // La aprobacion Comercial + Tecnica debe crear la NP en Odoo.
  // El flujo de medicion / tecnica_only / sin_medicion queda pendiente DESPUES de la NP,
  // no antes. Por eso se elimina solo el return que frenaba markSyncingIfReady().
  const deferLine = "  if (shouldDeferSyncUntilMeasurement(quote)) return null;\n";
  const deferReplacement = "  // NP Odoo: no se difiere la sincronizacion inicial por medicion/tecnica.\n";
  if (next.includes(deferLine)) {
    next = next.replace(deferLine, deferReplacement);
  }

  // Seguridad: si quedo aplicado un hotfix anterior demasiado amplio, restauramos
  // la logica original para otros cotizadores. En portones con medicion, quoteNeedsMeasurement(qSync)
  // mantiene directFinal=false naturalmente, por lo que la aprobacion inicial genera NP.
  const badDirectFinalLine = "    const directFinal = false; // La aprobación inicial siempre debe generar NP; la NV va por el flujo final.\n";
  const originalDirectFinalLine = "    const directFinal = qSync.fulfillment_mode === \"produccion\" && !quoteNeedsMeasurement(qSync);\n";
  if (next.includes(badDirectFinalLine)) {
    next = next.replace(badDirectFinalLine, originalDirectFinalLine);
  }

  if (next === content) {
    console.log("[quotes-np-sync] Sin cambios: quotes.routes.js ya estaba corregido.");
    return;
  }

  fs.writeFileSync(target, next, "utf8");
  console.log("[quotes-np-sync] Patch aplicado: Comercial + Tecnica generan NP sin bloquear por medicion.");
}
