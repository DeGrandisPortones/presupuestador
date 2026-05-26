const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'src/pages/CotizadorPage/index.jsx');

if (!fs.existsSync(target)) {
  console.warn('[acopio-revision-notice] No se encontro CotizadorPage/index.jsx; se omite.');
  process.exit(0);
}

let content = fs.readFileSync(target, 'utf8');
const before = content;

const nextBlock = `      {isAcopioRevision ? (
        <>
          <div className="spacer" />
          <div
            className="card"
            style={{
              background: "#fff8f3",
              border: "2px solid #f2d3bf",
              borderRadius: 16,
              padding: 22,
              boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 10, fontSize: 24, lineHeight: 1.2, color: "#111827" }}>
              Ajuste de presupuesto en Acopio
            </div>
            <div style={{ fontSize: 17, lineHeight: 1.55, color: "#374151" }}>
              Guardá los cambios y luego usá <b>Solicitar paso a Producción</b> desde <b>Mis presupuestos</b>. Cuando Comercial y Técnica aprueben ese paso, el sistema lo tratará como un portón en producción.
            </div>
          </div>
        </>
      ) : null}`;

if (!content.includes('el sistema lo tratará como un portón en producción')) {
  const exactOld = `      {isAcopioRevision ? (<><div className="spacer" /><div className="card" style={{ background: "#fff8f3", border: "1px solid #f2d3bf" }}><div style={{ fontWeight: 900, marginBottom: 6 }}>Ajuste de presupuesto en Acopio</div><div className="muted">Este ajuste no se envía desde acá. Guardá los cambios y luego usá <b>Solicitar paso a Producción</b> desde <b>Mis presupuestos</b>. Cuando Comercial y Técnica aprueben ese paso, el sistema enviará la venta final a Odoo.</div></div></>) : null}`;

  if (content.includes(exactOld)) {
    content = content.replace(exactOld, nextBlock);
  } else {
    content = content.replace(
      /\n\s*\{isAcopioRevision \? \([\s\S]*?Ajuste de presupuesto en Acopio[\s\S]*?\) : null\}\n(?=\n\s*\{normalizedCatalogKind === "porton")/,
      `\n${nextBlock}\n`
    );
  }
}

if (content !== before) {
  fs.writeFileSync(target, content, 'utf8');
  console.log('[acopio-revision-notice] Leyenda de acopio actualizada.');
} else {
  console.log('[acopio-revision-notice] Sin cambios; la leyenda ya estaba actualizada o no se encontro el patron.');
}
