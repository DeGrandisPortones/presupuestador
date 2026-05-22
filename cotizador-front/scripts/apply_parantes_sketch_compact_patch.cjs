const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "src/pages/CotizadorPage/components/PortonDimensions.jsx");

function replaceExact(content, from, to, label) {
  if (content.includes(to)) return content;
  if (!content.includes(from)) {
    console.warn(`[parantes-sketch-compact] No se encontro bloque para ${label}; se omite.`);
    return content;
  }
  return content.replace(from, to);
}

if (!fs.existsSync(target)) {
  console.warn("[parantes-sketch-compact] No se encontro PortonDimensions.jsx; se omite.");
  process.exit(0);
}

let content = fs.readFileSync(target, "utf8");
const before = content;

// Hace el dibujo un poco mas chico dentro del SVG y agrega margen util a la derecha.
// Asi los valores rojos de las cotas horizontales no quedan recortados.
content = replaceExact(content, "  const width = 720;", "  const width = 780;", "ancho del viewBox");
content = replaceExact(content, "  const rectW = 560;", "  const rectW = 500;", "ancho del porton en esquema");

// Acerca la linea de cota al dibujo y achica un poco el texto de los valores.
content = replaceExact(
  content,
  "                const dimX = rectX + rectW + 52;",
  "                const dimX = rectX + rectW + 34;",
  "posicion de cotas horizontales",
);

content = replaceExact(
  content,
  `<text x={dimX + 10} y={midY + 4} fontSize="11" fontWeight="700" fill="#dc2626">{formatNumberForInput(segment.lengthMm)} mm</text>`,
  `<text x={dimX + 8} y={midY + 4} fontSize="10" fontWeight="700" fill="#dc2626">{formatNumberForInput(segment.lengthMm)} mm</text>`,
  "texto de cotas horizontales",
);

// Mantiene tambien el cambio de nombres por si el zip anterior no estuviera aplicado.
content = replaceExact(
  content,
  `<text x={rectX - 8} y={rectY + 5} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">Lateral</text>`,
  `<text x={rectX - 8} y={rectY + 5} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">Superior</text>`,
  "etiqueta superior",
);

content = replaceExact(
  content,
  `<text x={rectX - 8} y={rectY + rectH + 5} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">Lateral</text>`,
  `<text x={rectX - 8} y={rectY + rectH + 5} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">Inferior</text>`,
  "etiqueta inferior",
);

if (content !== before) {
  fs.writeFileSync(target, content, "utf8");
  console.log("[parantes-sketch-compact] Patch aplicado.");
} else {
  console.log("[parantes-sketch-compact] Sin cambios.");
}
