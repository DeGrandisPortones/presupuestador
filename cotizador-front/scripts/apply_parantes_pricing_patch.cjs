const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function filePath(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(filePath(relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(filePath(relativePath), content, "utf8");
}

function replaceExact(content, from, to, label) {
  if (content.includes(to)) return content;
  if (!content.includes(from)) {
    console.warn(`[parantes-pricing] No se encontró bloque para ${label}; se omite porque puede estar aplicado o el archivo cambió.`);
    return content;
  }
  return content.replace(from, to);
}

function insertAfter(content, anchor, insertion, label) {
  if (content.includes(insertion.trim())) return content;
  if (!content.includes(anchor)) {
    console.warn(`[parantes-pricing] No se encontró ancla para ${label}; se omite porque puede estar aplicado o el archivo cambió.`);
    return content;
  }
  return content.replace(anchor, `${anchor}${insertion}`);
}

function insertBefore(content, anchor, insertion, label) {
  if (content.includes(insertion.trim())) return content;
  if (!content.includes(anchor)) {
    console.warn(`[parantes-pricing] No se encontró ancla para ${label}; se omite porque puede estar aplicado o el archivo cambió.`);
    return content;
  }
  return content.replace(anchor, `${insertion}${anchor}`);
}

function patchStore() {
  const rel = "src/domain/quote/store.js";
  let content = read(rel);

  content = content.replace(
    /function isIntegerQtyProductId\(productId\) \{\s*return INTEGER_QTY_PRODUCT_IDS\.has\(Number\(productId\)\);\s*\}\n(?!function isIntegerQtyLine)/,
    `function isIntegerQtyProductId(productId) {\n  return INTEGER_QTY_PRODUCT_IDS.has(Number(productId));\n}\nfunction isIntegerQtyLine(line) {\n  return !!line?.integer_qty || !!line?.auto_parantes_pricing_line || isIntegerQtyProductId(line?.product_id);\n}\n`,
  );

  content = replaceExact(
    content,
    `function isProtectedLine(line) {\n  return !!line?.auto_system_item || !!line?.surface_quantity || !!line?.previously_billed_line;\n}`,
    `function isProtectedLine(line) {\n  return !!line?.auto_system_item || !!line?.surface_quantity || !!line?.previously_billed_line || !!line?.locked_line || !!line?.auto_parantes_pricing_line;\n}`,
    "store isProtectedLine",
  );

  content = replaceExact(
    content,
    `function normalizeEditableQty({ productId, qty, surfaceQuantity = false }) {\n  if (surfaceQuantity) {\n    const n = Number(String(qty ?? "").replace(",", "."));\n    return Number.isFinite(n) ? Math.max(0, n) : 0;\n  }\n  if (isIntegerQtyProductId(productId)) {\n    return normalizeIntegerQty(qty);\n  }\n  return 1;\n}`,
    `function normalizeEditableQty({ productId, qty, surfaceQuantity = false, integerQty = false }) {\n  if (surfaceQuantity) {\n    const n = Number(String(qty ?? "").replace(",", "."));\n    return Number.isFinite(n) ? Math.max(0, n) : 0;\n  }\n  if (integerQty || isIntegerQtyProductId(productId)) {\n    return normalizeIntegerQty(qty);\n  }\n  return 1;\n}`,
    "store normalizeEditableQty",
  );

  content = content.replaceAll("if (isIntegerQtyProductId(line?.product_id)) {", "if (isIntegerQtyLine(line)) {");
  content = content.replaceAll("const isIntegerQty = isIntegerQtyProductId(id);", "const isIntegerQty = !!p.integer_qty || !!p.auto_parantes_pricing_line || isIntegerQtyProductId(id);");

  content = content.replaceAll(
    `surfaceQuantity: !!l.surface_quantity,\n          }),`,
    `surfaceQuantity: !!l.surface_quantity,\n            integerQty: !!l.integer_qty || !!l.auto_parantes_pricing_line,\n          }),`,
  );

  content = content.replaceAll(
    `surfaceQuantity: !!current?.surface_quantity,\n    });`,
    `surfaceQuantity: !!current?.surface_quantity,\n      integerQty: !!current?.integer_qty || !!current?.auto_parantes_pricing_line,\n    });`,
  );

  content = content.replaceAll(
    `locked_line: !!l.locked_line,\n          line_key:`,
    `locked_line: !!l.locked_line,\n          integer_qty: !!l.integer_qty || !!l.auto_parantes_pricing_line,\n          auto_parantes_pricing_line: !!l.auto_parantes_pricing_line,\n          auto_parantes_pricing_raw_price: Number(l.auto_parantes_pricing_raw_price || 0) || 0,\n          auto_parantes_pricing_multiplier: Number(l.auto_parantes_pricing_multiplier || 1) || 1,\n          line_key:`,
  );

  content = content.replaceAll(
    `surface_quantity: isSurfaceQuantity,\n            line_key:`,
    `surface_quantity: isSurfaceQuantity,\n            integer_qty: isIntegerQty,\n            locked_line: !!p.locked_line || !!p.auto_parantes_pricing_line,\n            auto_parantes_pricing_line: !!p.auto_parantes_pricing_line,\n            auto_parantes_pricing_raw_price: Number(p.auto_parantes_pricing_raw_price || 0) || 0,\n            auto_parantes_pricing_multiplier: Number(p.auto_parantes_pricing_multiplier || 1) || 1,\n            line_key:`,
  );

  write(rel, content);
}

function patchLineRow() {
  const rel = "src/pages/CotizadorPage/components/LineRow.jsx";
  let content = read(rel);

  content = replaceExact(
    content,
    `  const isProtectedLine = !!line.auto_system_item || !!line.surface_quantity || !!line.previously_billed_line || SYSTEM_PRODUCT_IDS.has(Number(line.product_id));\n  const isIntegerQtyLine = !isProtectedLine && INTEGER_QTY_PRODUCT_IDS.has(Number(line.product_id));\n  const isUnitOnlyLine = !isProtectedLine && !isIntegerQtyLine;`,
    `  const isProtectedLine = !!line.auto_system_item || !!line.surface_quantity || !!line.previously_billed_line || !!line.locked_line || !!line.auto_parantes_pricing_line || SYSTEM_PRODUCT_IDS.has(Number(line.product_id));\n  const usesIntegerQty = !!line.integer_qty || !!line.auto_parantes_pricing_line || INTEGER_QTY_PRODUCT_IDS.has(Number(line.product_id));\n  const isIntegerQtyLine = !isProtectedLine && usesIntegerQty;\n  const isUnitOnlyLine = !isProtectedLine && !isIntegerQtyLine;`,
    "LineRow flags",
  );

  content = replaceExact(
    content,
    `          {!line.auto_system_item && line.surface_quantity ? " · Cantidad por superficie" : ""}\n          {isUnitOnlyLine ? " · Unidad fija" : ""}`,
    `          {!line.auto_system_item && line.surface_quantity ? " · Cantidad por superficie" : ""}\n          {line.auto_parantes_pricing_line ? " · Auto parantes apto para revestir" : ""}\n          {isUnitOnlyLine ? " · Unidad fija" : ""}`,
    "LineRow auto text",
  );

  content = content.replaceAll(`step={isIntegerQtyLine ? "1" : "0.01"}`, `step={usesIntegerQty ? "1" : "0.01"}`);

  write(rel, content);
}

function patchCotizadorPage() {
  const rel = "src/pages/CotizadorPage/index.jsx";
  let content = read(rel);

  content = insertAfter(
    content,
    `import PortonDimensions from "./components/PortonDimensions";`,
    `\nimport PortonParantesPricingSync from "./components/PortonParantesPricingSync";`,
    "CotizadorPage import PortonParantesPricingSync",
  );

  content = insertAfter(
    content,
    `      <HeaderBar showMargin />`,
    `\n      {normalizedCatalogKind === "porton" ? <PortonParantesPricingSync /> : null}`,
    "CotizadorPage render PortonParantesPricingSync",
  );

  write(rel, content);
}

function patchDashboard() {
  const rel = "src/pages/DashboardPage/index.jsx";
  let content = read(rel);

  content = insertAfter(
    content,
    `  const [savingDependencies, setSavingDependencies] = useState(false);`,
    `\n  const [parantesPricingProductId, setParantesPricingProductId] = useState("");\n  const [savingParantesPricing, setSavingParantesPricing] = useState(false);`,
    "Dashboard parantes state",
  );

  content = insertBefore(
    content,
    `  }, [technicalRulesQ.data]);`,
    `\n    const surfaceParams = rules.surface_parameters || rules.surface_calc_params || rules.parantes_config || {};\n    setParantesPricingProductId(String(surfaceParams.parantes_pricing_product_id || surfaceParams.parantes_price_product_id || ""));\n`,
    "Dashboard load parantes product id",
  );

  content = insertBefore(
    content,
    `  if (!enabled) {`,
    `  async function onSaveParantesPricingProduct() {\n    setSavingParantesPricing(true);\n    try {\n      const numericId = Number(String(parantesPricingProductId || "").replace(/[^0-9]/g, "")) || null;\n      await adminSaveTechnicalMeasurementRules("porton", {\n        parantes_pricing_product_id: numericId || "",\n        surface_parameters: {\n          parantes_pricing_product_id: numericId || "",\n        },\n      });\n      invalidateTechnicalRules();\n      alert("Producto de precio de parantes guardado.");\n    } finally {\n      setSavingParantesPricing(false);\n    }\n  }\n\n`,
    "Dashboard save parantes product function",
  );

  const tabsAnchor = `      <div className="spacer" />\n      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>`;
  const parantesCard = `      {catalogKind === "porton" ? (\n        <>\n          <div className="spacer" />\n          <div className="card" style={{ background: "#fafafa" }}>\n            <h3 style={{ marginTop: 0 }}>Precio automático de parantes</h3>\n            <div className="muted" style={{ marginBottom: 10 }}>\n              Solo aplica a portones <b>Aptos para revestir</b>. Indicá el ID del producto de Odoo/presupuestador que se debe agregar automáticamente.\n              La cantidad será la cantidad de parantes calculada. En orientación horizontal el precio unitario se duplica; en vertical se usa el precio de Odoo.\n            </div>\n            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>\n              <div style={{ minWidth: 260 }}>\n                <div className="muted">ID producto parantes</div>\n                <Input\n                  value={parantesPricingProductId}\n                  onChange={(value) => setParantesPricingProductId(String(value || "").replace(/[^0-9]/g, ""))}\n                  placeholder="Ej: 3006"\n                  style={{ width: "100%" }}\n                />\n              </div>\n              <Button variant="primary" onClick={onSaveParantesPricingProduct} disabled={savingParantesPricing}>\n                {savingParantesPricing ? "Guardando..." : "Guardar producto"}\n              </Button>\n              <Button\n                variant="ghost"\n                onClick={() => setParantesPricingProductId("")}\n                disabled={savingParantesPricing}\n              >\n                Limpiar\n              </Button>\n            </div>\n          </div>\n        </>\n      ) : null}\n\n`;
  content = insertBefore(content, tabsAnchor, parantesCard, "Dashboard parantes pricing card");

  write(rel, content);
}

try {
  patchStore();
  patchLineRow();
  patchCotizadorPage();
  patchDashboard();
  console.log("[parantes-pricing] Patch aplicado.");
} catch (err) {
  console.error("[parantes-pricing] Error aplicando patch:", err);
  process.exit(1);
}
