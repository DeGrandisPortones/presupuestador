const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "src/pages/CotizadorPage/components/PortonDimensions.jsx");

function replaceExact(content, from, to, label) {
  if (content.includes(to)) return content;
  if (!content.includes(from)) {
    console.warn(`[parantes-labels] No se encontro bloque para ${label}; se omite.`);
    return content;
  }
  return content.replace(from, to);
}

if (!fs.existsSync(target)) {
  console.warn("[parantes-labels] No se encontro PortonDimensions.jsx; se omite.");
  process.exit(0);
}

let content = fs.readFileSync(target, "utf8");
const before = content;

content = replaceExact(
  content,
  `<text x={rectX - 8} y={rectY + 5} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">Lateral</text>`,
  `<text x={rectX - 8} y={rectY + 5} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">Superior</text>`,
  "etiqueta superior en parantes horizontales",
);

content = replaceExact(
  content,
  `<text x={rectX - 8} y={rectY + rectH + 5} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">Lateral</text>`,
  `<text x={rectX - 8} y={rectY + rectH + 5} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">Inferior</text>`,
  "etiqueta inferior en parantes horizontales",
);

if (content !== before) {
  fs.writeFileSync(target, content, "utf8");
  console.log("[parantes-labels] Patch aplicado.");
} else {
  console.log("[parantes-labels] Sin cambios.");
}
