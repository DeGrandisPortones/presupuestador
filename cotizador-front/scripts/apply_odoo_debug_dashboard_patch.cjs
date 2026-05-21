const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rel = 'src/pages/DashboardPage/index.jsx';
const file = path.join(root, rel);

function read() {
  return fs.readFileSync(file, 'utf8');
}

function write(content) {
  fs.writeFileSync(file, content, 'utf8');
}

function insertAfter(content, anchor, insertion, label) {
  if (content.includes(insertion.trim())) return content;
  if (!content.includes(anchor)) {
    console.warn(`[odoo-debug-dashboard] No se encontro ancla para ${label}.`);
    return content;
  }
  return content.replace(anchor, `${anchor}${insertion}`);
}

function replaceExact(content, from, to, label) {
  if (content.includes(to.trim())) return content;
  if (!content.includes(from)) {
    console.warn(`[odoo-debug-dashboard] No se encontro bloque para ${label}.`);
    return content;
  }
  return content.replace(from, to);
}

function patch() {
  let content = read();

  content = insertAfter(
    content,
    'import Input from "../../ui/Input.jsx";',
    '\nimport { http } from "../../api/http.js";',
    'import http',
  );

  content = replaceExact(
    content,
    'function DataTab({ sections, tags, products, quotes, productQuery, setProductQuery, quoteQuery, setQuoteQuery, sectionFilter, setSectionFilter, tagFilter, setTagFilter }) {\n  return (',
    `function DataTab({ sections, tags, products, quotes, productQuery, setProductQuery, quoteQuery, setQuoteQuery, sectionFilter, setSectionFilter, tagFilter, setTagFilter }) {
  const [odooDebug, setOdooDebug] = useState(null);
  const [odooDebugLoadingProductId, setOdooDebugLoadingProductId] = useState(null);

  async function openOdooDebug(product) {
    const productId = Number(product?.odoo_variant_id || product?.id || product?.product_id || 0) || null;
    const templateId = Number(product?.odoo_template_id || product?.odoo_id || 0) || null;
    const name = getProductLabel(product);

    setOdooDebug({ product, data: null, error: "", loadedAt: null });
    setOdooDebugLoadingProductId(product?.id || productId || templateId || "debug");

    try {
      const params = {};
      if (productId) params.product_id = productId;
      if (templateId) params.template_id = templateId;
      if (!productId && !templateId && name) params.q = name;

      const response = await http.get("/api/catalog/odoo-product-debug", { params });
      setOdooDebug({ product, data: response.data, error: "", loadedAt: new Date().toISOString() });
    } catch (err) {
      setOdooDebug({ product, data: null, error: err?.message || "No se pudo consultar Odoo", loadedAt: new Date().toISOString() });
    } finally {
      setOdooDebugLoadingProductId(null);
    }
  }

  function closeOdooDebug() {
    setOdooDebug(null);
  }

  async function copyOdooDebugJson() {
    if (!odooDebug?.data || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(JSON.stringify(odooDebug.data, null, 2));
    alert("JSON copiado.");
  }

  return (`,
    'DataTab state/debug function',
  );

  content = content.replaceAll(
    '<table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>',
    '<table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1040 }}>',
  );

  content = replaceExact(
    content,
    '              <th style={thStyle}>Secciones</th>\n            </tr>',
    '              <th style={thStyle}>Secciones</th>\n              <th style={thStyle}>Odoo</th>\n            </tr>',
    'header Odoo column',
  );

  content = replaceExact(
    content,
    '                <td style={tdStyle}>{(product.section_ids || []).map((id) => sections.find((section) => Number(section.id) === Number(id))?.name || id).join(", ") || "-"}</td>\n              </tr>',
    `                <td style={tdStyle}>{(product.section_ids || []).map((id) => sections.find((section) => Number(section.id) === Number(id))?.name || id).join(", ") || "-"}</td>
                <td style={tdStyle}>
                  <Button
                    variant="secondary"
                    disabled={odooDebugLoadingProductId === product.id}
                    onClick={() => openOdooDebug(product)}
                  >
                    {odooDebugLoadingProductId === product.id ? "Consultando..." : "Ver JSON Odoo"}
                  </Button>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Var: {product.odoo_variant_id || product.id || "-"} · Tmpl: {product.odoo_template_id || product.odoo_id || "-"}
                  </div>
                </td>
              </tr>`,
    'row Odoo button',
  );

  content = replaceExact(
    content,
    '        {!products.length ? <div className="muted">Sin productos para mostrar.</div> : null}\n      </div>\n\n      <div className="spacer" />',
    `        {!products.length ? <div className="muted">Sin productos para mostrar.</div> : null}
      </div>

      {odooDebug ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.55)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={closeOdooDebug}
        >
          <div
            style={{
              width: "min(1100px, 96vw)",
              maxHeight: "92vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 20px 70px rgba(15,23,42,0.35)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0 }}>JSON Odoo del producto</h3>
                <div className="muted" style={{ marginTop: 4 }}>
                  {getProductLabel(odooDebug.product)} · ID presupuestador {odooDebug.product?.id || "-"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {odooDebug.data ? <Button variant="secondary" onClick={copyOdooDebugJson}>Copiar JSON</Button> : null}
                <Button variant="ghost" onClick={closeOdooDebug}>Cerrar</Button>
              </div>
            </div>

            <div className="spacer" />

            {odooDebug.error ? (
              <div style={{ color: "#b91c1c", fontWeight: 800 }}>{odooDebug.error}</div>
            ) : null}

            {!odooDebug.data && !odooDebug.error ? (
              <div className="muted">Consultando Odoo con el token de la sesión...</div>
            ) : null}

            {odooDebug.data ? (
              <>
                <div className="muted" style={{ marginBottom: 8 }}>
                  Buscá dentro del JSON: product_tag_ids, product_template_tag_ids, website_tag_ids, tag_ids, public_categ_ids, raw_tag_refs, tags_resolved.
                </div>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background: "#0f172a",
                    color: "#e2e8f0",
                    padding: 14,
                    borderRadius: 12,
                    fontSize: 12,
                    lineHeight: 1.45,
                    maxHeight: "68vh",
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(odooDebug.data, null, 2)}
                </pre>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="spacer" />`,
    'debug modal insert',
  );

  write(content);
  console.log('[odoo-debug-dashboard] Patch aplicado.');
}

try {
  patch();
} catch (err) {
  console.error('[odoo-debug-dashboard] Error:', err);
  process.exit(1);
}
