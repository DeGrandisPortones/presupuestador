const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "src/pages/PresupuestosPage/index.jsx");

if (!fs.existsSync(target)) {
  console.warn("[presupuestos-no-legacy-doors] No se encontro PresupuestosPage/index.jsx; se omite.");
  process.exit(0);
}

let content = fs.readFileSync(target, "utf8");
const before = content;

function replaceExact(from, to, label) {
  if (content.includes(to)) return;
  if (!content.includes(from)) {
    console.warn(`[presupuestos-no-legacy-doors] No se encontro patron para ${label}; se omite.`);
    return;
  }
  content = content.replace(from, to);
}

replaceExact(
  'import { listDoors } from "../../api/doors.js";\n',
  '',
  'remover import legacy doors'
);

replaceExact(
`function quoteEditorPath(q) {
  const kind = effectiveQuoteKind(q);
  if (kind === "ipanel") return \`/cotizador/ipanel/\${q.id}\`;
  if (kind === "otros") return \`/cotizador/otros/\${q.id}\`;
  return \`/cotizador/\${q.id}\`;
}`,
`function quoteEditorPath(q) {
  const kind = effectiveQuoteKind(q);
  if (kind === "ipanel") return \`/cotizador/ipanel/\${q.id}\`;
  if (kind === "otros") return \`/cotizador/otros/\${q.id}\`;
  if (kind === "puerta") return \`/cotizador/puerta/\${q.id}\`;
  return \`/cotizador/\${q.id}\`;
}`,
  'ruta editor puerta'
);

replaceExact(
`function quoteTypeLabel(q) {
  const kind = effectiveQuoteKind(q);
  if (kind === "ipanel") return "Ipanel";
  if (kind === "otros") return "Otros";
  return "Portón";
}`,
`function quoteTypeLabel(q) {
  const kind = effectiveQuoteKind(q);
  if (kind === "ipanel") return "Ipanel";
  if (kind === "otros") return "Otros";
  if (kind === "puerta") return "Puerta";
  return "Portón";
}`,
  'label quote puerta'
);

replaceExact(
`  const doorsQ = useQuery({ queryKey: ["doors", "mine", "presupuestos"], queryFn: () => listDoors({ scope: "mine" }), enabled: !!user?.is_vendedor || !!user?.is_distribuidor });`,
`  const doorsQ = { data: [], isLoading: false, error: null }; // flujo legacy de puertas desactivado; las puertas nuevas entran como presupuestos`,
  'desactivar consulta legacy doors'
);

replaceExact(
`    if (typeFilter === "door") filtered = filtered.filter((item) => item.rowKind === "door");`,
`    if (typeFilter === "door") filtered = filtered.filter((item) => item.rowKind === "door" || (item.rowKind === "quote" && effectiveQuoteKind(item.raw) === "puerta"));`,
  'filtro puertas por catalog_kind'
);

replaceExact(
`  const isLoading = quotesQ.isLoading || doorsQ.isLoading;`,
`  const isLoading = quotesQ.isLoading;`,
  'loading sin legacy doors'
);

replaceExact(
`  const error = quotesQ.error || doorsQ.error;`,
`  const error = quotesQ.error;`,
  'error sin legacy doors'
);

if (content !== before) {
  fs.writeFileSync(target, content, "utf8");
  console.log("[presupuestos-no-legacy-doors] Patch aplicado.");
} else {
  console.log("[presupuestos-no-legacy-doors] Sin cambios; ya estaba aplicado o no se encontraron patrones.");
}
