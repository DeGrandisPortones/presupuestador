const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "src/pages/PresupuestosPage/index.jsx");

if (!fs.existsSync(target)) {
  console.warn("[hide-legacy-add-door] No se encontro PresupuestosPage/index.jsx; se omite.");
  process.exit(0);
}

let content = fs.readFileSync(target, "utf8");
const before = content;

content = content.replace(
  /\n\s*const linkedDoorQuoteIds = useMemo\(\(\) => new Set\(\(doorsQ\.data \|\| \[\]\)\.map\(\(d\) => String\(d\?\.linked_quote_id \|\| ""\)\.trim\(\)\)\.filter\(Boolean\)\), \[doorsQ\.data\]\);/,
  ""
);

content = content.replace(
  /\n\s*const canAddDoor = effectiveQuoteKind\(r\) === "porton" && r\.status === "draft" && !linkedDoorQuoteIds\.has\(String\(r\.id\)\);/,
  ""
);

content = content.replace(
  /\n\s*\{canAddDoor \? <Button variant="ghost" onClick=\{\(\) => navigate\(`\/puertas\/nuevo\/\$\{r\.id\}`\)\}>Agregar puerta<\/Button> : null\}/,
  ""
);

if (content !== before) {
  fs.writeFileSync(target, content, "utf8");
  console.log("[hide-legacy-add-door] Boton legacy Agregar puerta ocultado.");
} else {
  console.log("[hide-legacy-add-door] Sin cambios; el boton ya estaba oculto o no se encontro el patron.");
}
