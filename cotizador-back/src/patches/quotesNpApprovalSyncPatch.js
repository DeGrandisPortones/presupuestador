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

  const deferLine = "  if (shouldDeferSyncUntilMeasurement(quote)) return null;\n";
  const deferReplacement = "  // La NP debe generarse al aprobar Comercial + Técnica; no se difiere por medición.\n";
  if (next.includes(deferLine)) {
    next = next.replace(deferLine, deferReplacement);
  }

  const directFinalLine = "    const directFinal = qSync.fulfillment_mode === \"produccion\" && !quoteNeedsMeasurement(qSync);\n";
  const directFinalReplacement = "    const directFinal = false; // La aprobación inicial siempre debe generar NP; la NV va por el flujo final.\n";
  if (next.includes(directFinalLine)) {
    next = next.replace(directFinalLine, directFinalReplacement);
  }

  if (next === content) {
    console.log("[quotes-np-sync] Sin cambios: quotes.routes.js ya estaba corregido o no tenía el patrón viejo.");
    return;
  }

  fs.writeFileSync(target, next, "utf8");
  console.log("[quotes-np-sync] Patch aplicado: las aprobaciones iniciales generan NP en Odoo.");
}
