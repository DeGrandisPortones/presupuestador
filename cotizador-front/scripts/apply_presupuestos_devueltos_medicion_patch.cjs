const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "src/pages/PresupuestosPage/index.jsx");

if (!fs.existsSync(target)) {
  console.warn("[presupuestos-devueltos-medicion] No se encontro PresupuestosPage/index.jsx; se omite.");
  process.exit(0);
}

let content = fs.readFileSync(target, "utf8");
const before = content;

function replaceExact(from, to, label) {
  if (content.includes(to)) return;
  if (!content.includes(from)) {
    console.warn(`[presupuestos-devueltos-medicion] No se encontro patron para ${label}; se omite.`);
    return;
  }
  content = content.replace(from, to);
}

replaceExact(
`          <Button variant={filter === "mediciones" ? "primary" : "ghost"} onClick={() => setFilter("mediciones")}>Portones en Medición</Button>`,
`          <Button variant={filter === "mediciones" ? "primary" : "ghost"} onClick={() => setFilter("mediciones")}>Portones en Medición</Button>
          {(user?.is_vendedor || user?.is_distribuidor) ? <Button variant={filter === "devueltos_medicion" ? "primary" : "ghost"} onClick={() => setFilter("devueltos_medicion")}>Devueltos por medición</Button> : null}`,
  "boton Devueltos por medicion"
);

replaceExact(
`    else if (filter === "mediciones") {
      filtered = filtered.filter((item) => item.rowKind === "quote" && effectiveQuoteKind(item.raw) === "porton").filter((item) => {
        const q = item.raw;
        if (isReturnedFromMeasurement(q)) return true;
        return q?.fulfillment_mode === "produccion" && q?.status !== "draft" && q?.requires_measurement === true;
      });
    }
    if (typeFilter === "porton") filtered = filtered.filter((item) => item.rowKind === "quote" && effectiveQuoteKind(item.raw) === "porton");`,
`    else if (filter === "mediciones") {
      filtered = filtered.filter((item) => item.rowKind === "quote" && effectiveQuoteKind(item.raw) === "porton").filter((item) => {
        const q = item.raw;
        if (isReturnedFromMeasurement(q)) return true;
        return q?.fulfillment_mode === "produccion" && q?.status !== "draft" && q?.requires_measurement === true;
      });
    }
    else if (filter === "devueltos_medicion") {
      filtered = filtered.filter((item) => item.rowKind === "quote" && isReturnedFromMeasurement(item.raw));
    }
    if (typeFilter === "porton") filtered = filtered.filter((item) => item.rowKind === "quote" && effectiveQuoteKind(item.raw) === "porton");`,
  "filtro Devueltos por medicion"
);

if (content !== before) {
  fs.writeFileSync(target, content, "utf8");
  console.log("[presupuestos-devueltos-medicion] Patch aplicado.");
} else {
  console.log("[presupuestos-devueltos-medicion] Sin cambios; ya estaba aplicado o no se encontraron patrones.");
}
