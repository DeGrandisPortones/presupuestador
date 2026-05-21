#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
function file(rel) { return path.join(root, rel); }
function exists(rel) { return fs.existsSync(file(rel)); }
function read(rel) { return fs.readFileSync(file(rel), 'utf8'); }
function write(rel, content) { fs.writeFileSync(file(rel), content); }
function backup(rel) {
  const src = file(rel);
  if (!fs.existsSync(src)) return;
  const bak = `${src}.bak_puertas_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(src, bak);
}
function patch(rel, fn) {
  if (!exists(rel)) { console.warn(`[SKIP] ${rel} no existe`); return; }
  backup(rel);
  const before = read(rel);
  const after = fn(before);
  if (after !== before) { write(rel, after); console.log(`[OK] parcheado ${rel}`); }
  else console.log(`[OK] ${rel} sin cambios necesarios`);
}
function insertOnce(content, marker, insertion, label) {
  if (content.includes(insertion.trim())) return content;
  const idx = content.indexOf(marker);
  if (idx === -1) throw new Error(`No se encontro marcador para ${label}: ${marker}`);
  return content.slice(0, idx + marker.length) + insertion + content.slice(idx + marker.length);
}

// 1) Soporte catalog_kind='puerta' en backend.
patch('cotizador-back/src/catalogDb.js', (s) => {
  return s
    .replace(/'porton', 'ipanel', 'otros'/g, "'porton', 'ipanel', 'otros', 'puerta'")
    .replace(/"porton", "ipanel", "otros"/g, '"porton", "ipanel", "otros", "puerta"')
    .replace(/usar \\"porton\\", \\"ipanel\\" u \\"otros\\"/g, 'usar "porton", "ipanel", "otros" o "puerta"')
    .replace(/usar "porton", "ipanel" u "otros"/g, 'usar "porton", "ipanel", "otros" o "puerta"')
    .replace(/usar "porton", "ipanel" u "otros"/g, 'usar "porton", "ipanel", "otros" o "puerta"');
});

patch('cotizador-back/src/settingsDb.js', (s) => {
  return s
    .replace(/"porton", "ipanel", "otros"/g, '"porton", "ipanel", "otros", "puerta"')
    .replace(/'porton', 'ipanel', 'otros'/g, "'porton', 'ipanel', 'otros', 'puerta'");
});

patch('cotizador-back/src/routes/quotes.routes.js', (s) => {
  return s
    .replace(/\["porton", "ipanel", "otros"\]\.includes\(k\)/g, '["porton", "ipanel", "otros", "puerta"].includes(k)')
    .replace(/usar \\"porton\\", \\"ipanel\\" u \\"otros\\"/g, 'usar "porton", "ipanel", "otros" o "puerta"')
    .replace(/usar "porton", "ipanel" u "otros"/g, 'usar "porton", "ipanel", "otros" o "puerta"')
    .replace(/No podes cambiar el tipo de cotizador \(porton\/ipanel\)/g, 'No podes cambiar el tipo de cotizador (porton/ipanel/otros/puerta)');
});

patch('cotizador-back/src/catalogBootstrap.js', (s) => {
  if (s.includes('if (k === "puerta") return belongsToConfiguredSection;')) return s;
  return s.replace(
    'if (k === "otros") return belongsToConfiguredSection;\n    return !isIpanel;',
    'if (k === "otros") return belongsToConfiguredSection;\n    if (k === "puerta") return belongsToConfiguredSection;\n    return !isIpanel;'
  );
});

// 2) Endpoints admin para Reglas Tecnicas puertas.
patch('cotizador-back/src/routes/admin.routes.js', (s) => {
  let out = s;
  if (!out.includes('../doorTechnicalRulesDb.js')) {
    out = out.replace(
      'import { getProductionPlanningWithUsage } from "../productionPlanning.js";\n',
      'import { getProductionPlanningWithUsage } from "../productionPlanning.js";\nimport { getDoorTechnicalRules, setDoorTechnicalRules } from "../doorTechnicalRulesDb.js";\n'
    );
  }
  if (!out.includes('router.get("/door-technical-rules"')) {
    out = out.replace(
      '  router.put("/door-quote-settings", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {\n    try { res.json({ ok: true, settings: await setDoorQuoteSettings(req.body || {}) }); } catch (e) { next(e); }\n  });\n',
      '  router.put("/door-quote-settings", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {\n    try { res.json({ ok: true, settings: await setDoorQuoteSettings(req.body || {}) }); } catch (e) { next(e); }\n  });\n\n  router.get("/door-technical-rules", requireAuth, requireSuperuser, async (_req, res, next) => {\n    try { res.json({ ok: true, rules: await getDoorTechnicalRules() }); } catch (e) { next(e); }\n  });\n  router.put("/door-technical-rules", requireAuth, requireSuperuser, async (req, res, next) => {\n    try { res.json({ ok: true, rules: await setDoorTechnicalRules(req.body || {}) }); } catch (e) { next(e); }\n  });\n'
    );
  }
  return out;
});

// 3) Front API admin.
patch('cotizador-front/src/api/admin.js', (s) => {
  if (s.includes('adminGetDoorTechnicalRules')) return s;
  const extraPath = file('cotizador-front/src/api/admin.js.patch-extra');
  const extra = fs.existsSync(extraPath) ? fs.readFileSync(extraPath, 'utf8') : `\nexport async function adminGetDoorTechnicalRules() {\n  const { data } = await http.get(\`/api/admin/door-technical-rules\`);\n  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las reglas tecnicas de puertas");\n  return data.rules || {};\n}\n\nexport async function adminSaveDoorTechnicalRules(payload = {}) {\n  const { data } = await http.put(\`/api/admin/door-technical-rules\`, payload || {});\n  if (!data?.ok) throw new Error(data?.error || "No se pudieron guardar las reglas tecnicas de puertas");\n  return data.rules || {};\n}\n`;
  return `${s.trim()}\n${extra}\n`;
});
try { fs.unlinkSync(file('cotizador-front/src/api/admin.js.patch-extra')); } catch (_) {}

// 4) Rutas front.
patch('cotizador-front/src/App.jsx', (s) => {
  let out = s;
  if (!out.includes('const CotizadorPuertaRoute')) {
    out = out.replace('const CotizadorOtrosRoute = () => <CotizadorPage catalogKind="otros" />;\n', 'const CotizadorOtrosRoute = () => <CotizadorPage catalogKind="otros" />;\nconst CotizadorPuertaRoute = () => <CotizadorPage catalogKind="puerta" />;\n');
  }
  if (!out.includes('SuperuserDoorTechnicalRulesPage')) {
    out = out.replace('import SuperuserMeasurementRulesPage from "./pages/SuperuserMeasurementRulesPage/index.jsx";\n', 'import SuperuserMeasurementRulesPage from "./pages/SuperuserMeasurementRulesPage/index.jsx";\nimport SuperuserDoorTechnicalRulesPage from "./pages/SuperuserDoorTechnicalRulesPage/index.jsx";\n');
  }
  if (!out.includes('path="cotizador/puerta"')) {
    out = out.replace('          <Route path="cotizador/otros/:id" element={<CotizadorOtrosRoute />} />\n', '          <Route path="cotizador/otros/:id" element={<CotizadorOtrosRoute />} />\n          <Route path="cotizador/puerta" element={<CotizadorPuertaRoute />} />\n          <Route path="cotizador/puerta/:id" element={<CotizadorPuertaRoute />} />\n');
  }
  if (!out.includes('path="dashboard/reglas-tecnicas-puertas"')) {
    out = out.replace('          <Route path="dashboard/reglas-tecnicas" element={<SuperuserMeasurementRulesPage />} />\n', '          <Route path="dashboard/reglas-tecnicas" element={<SuperuserMeasurementRulesPage />} />\n          <Route path="dashboard/reglas-tecnicas-puertas" element={<SuperuserDoorTechnicalRulesPage />} />\n');
  }
  return out;
});

patch('cotizador-front/src/pages/MenuPage/index.jsx', (s) => {
  if (s.includes('Reglas Tecnicas puertas')) return s;
  return s.replace(
    '        {showPdfNamesAdmin && (\n',
    '        {showTechnicalRules && (\n          <MenuTile\n            title="Reglas Tecnicas puertas"\n            description="Define descuentos y parametros para calcular automaticamente el Ipanel de cada puerta."\n            buttonText="Abrir reglas puertas"\n            onClick={() => navigate("/dashboard/reglas-tecnicas-puertas")}\n            icon="P"\n          />\n        )}\n\n        {showPdfNamesAdmin && (\n'
  );
});

// 5) Cotizador puerta en el front.
patch('cotizador-front/src/pages/CotizadorPage/index.jsx', (s) => {
  let out = s;
  out = out.replace(
    'if (normalizedKind === "ipanel") return `/cotizador/ipanel/${safeId}${suffix}`; if (normalizedKind === "otros") return `/cotizador/otros/${safeId}${suffix}`; return `/cotizador/${safeId}${suffix}`;',
    'if (normalizedKind === "ipanel") return `/cotizador/ipanel/${safeId}${suffix}`; if (normalizedKind === "otros") return `/cotizador/otros/${safeId}${suffix}`; if (normalizedKind === "puerta") return `/cotizador/puerta/${safeId}${suffix}`; return `/cotizador/${safeId}${suffix}`;'
  );
  out = out.replace(
    'const itemLabel = normalizedKind === "ipanel" ? "Ipanel" : "portón";',
    'const itemLabel = normalizedKind === "ipanel" ? "Ipanel" : (normalizedKind === "puerta" ? "puerta" : "portón");'
  );
  out = out.replace(
    'if (!isDoorWorkflow || normalizedCatalogKind !== "ipanel" || !workflowDoorId) return false;',
    'if (!isDoorWorkflow || !["ipanel", "puerta"].includes(normalizedCatalogKind) || !workflowDoorId) return false;'
  );
  out = out.replace(/toast\.success\("Ipanel guardado\. Seguimos con el marco de puerta\."\);/g, 'toast.success("Presupuesto de puerta guardado. Volviendo al panel.");');
  out = out.replace(/toast\.success\("Ipanel confirmado\. Seguimos con el marco de puerta\."\);/g, 'toast.success("Presupuesto de puerta confirmado. Volviendo al panel.");');
  out = out.replace('      {normalizedCatalogKind !== "otros" ? (', '      {!["otros", "puerta"].includes(normalizedCatalogKind) ? (');
  return out;
});

console.log('\nListo. Si copiaste el ZIP sobre el repo, los archivos de reemplazo ya quedaron aplicados y este script completo los parches restantes.');
