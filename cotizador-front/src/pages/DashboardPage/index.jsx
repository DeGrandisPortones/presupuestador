import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../domain/auth/store.js";
import { PORTON_TYPES } from "../../domain/quote/portonConstants.js";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

import {
  adminGetCatalog,
  adminCreateSection,
  adminUpdateSection,
  adminDeleteSection,
  adminSetTagSection,
  adminSetProductAlias,
  adminSetProductVisibility,
  adminRefreshCatalog,
  adminGetQuotes,
  adminGetFinalSettings,
  adminSaveFinalSettings,
  adminGetTechnicalMeasurementRules,
  adminSaveTechnicalMeasurementRules,
  adminGetProductPdfNames,
  adminSetProductPdfName,
  adminDebugOdooProduct,
} from "../../api/admin.js";

const CATALOG_KIND_OPTIONS = [
  { key: "porton", label: "Portones" },
  { key: "ipanel", label: "Ipanel" },
  { key: "plegados", label: "Plegados" },
  { key: "otros", label: "Otros" },
  { key: "puerta", label: "Puertas" },
];

function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function formatKindLabel(kind) {
  return CATALOG_KIND_OPTIONS.find((item) => item.key === kind)?.label || kind;
}

function parseIdList(value) {
  return String(value || "")
    .split(/[;,\s]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function stringifyIdList(values) {
  return Array.isArray(values)
    ? values.map((item) => Number(item)).filter(Boolean).join(", ")
    : "";
}

function visibilityModeFromProduct(product) {
  const vendedor = !!product?.disable_for_vendedor;
  const distribuidor = !!product?.disable_for_distribuidor;
  if (vendedor && distribuidor) return "both";
  if (vendedor) return "vendedor";
  if (distribuidor) return "distribuidor";
  return "none";
}

function flagsFromVisibilityMode(mode) {
  const normalized = String(mode || "none");
  return {
    disable_for_vendedor: normalized === "vendedor" || normalized === "both",
    disable_for_distribuidor: normalized === "distribuidor" || normalized === "both",
  };
}

function getProductSearchText(product = {}) {
  return norm([
    product.id,
    product.odoo_id,
    product.odoo_template_id,
    product.odoo_variant_id,
    product.display_name,
    product.alias,
    product.internal_alias,
    product.name,
    product.raw_name,
    product.client_display_name,
    product.code,
  ].filter(Boolean).join(" "));
}

function getProductLabel(product = {}) {
  return String(
    product.display_name ||
      product.alias ||
      product.internal_alias ||
      product.name ||
      product.raw_name ||
      product.client_display_name ||
      `Producto ${product.id || ""}`,
  ).trim();
}

function newDependencyRule(index = 1) {
  return {
    id: `dep_${Date.now()}_${index}`,
    name: "",
    active: true,
    parent_section_id: "",
    trigger_mode: "product",
    trigger_product_id: "",
    child_section_ids: [],
    sort_order: index,
  };
}

function newSystemRule(index = 1) {
  return {
    id: `sys_${Date.now()}_${index}`,
    name: "",
    active: true,
    required_product_ids_text: "",
    match_mode: "all",
    derived_porton_type: "",
    sort_order: index,
  };
}

function buildQuoteSearchText(quote = {}) {
  const customer = quote.end_customer || {};
  return norm([
    quote.id,
    quote.quote_number,
    quote.odoo_sale_order_name,
    quote.final_sale_order_name,
    quote.status,
    quote.final_status,
    customer.name,
    customer.first_name,
    customer.last_name,
    customer.phone,
    customer.city,
  ].filter(Boolean).join(" "));
}

function buildRulePayloadFromState({ initialSectionId, dependencyRules, productsBySectionId }) {
  const normalizedDependencyRules = (Array.isArray(dependencyRules) ? dependencyRules : [])
    .map((rule, index) => {
      const parentSectionId = Number(rule.parent_section_id || 0) || null;
      const sectionProducts = productsBySectionId.get(Number(parentSectionId)) || [];
      const requiredProductIds = String(rule.trigger_mode || "product") === "any"
        ? sectionProducts.map((product) => Number(product.id)).filter(Boolean)
        : [Number(rule.trigger_product_id || 0)].filter(Boolean);

      return {
        id: rule.id || `dep_${index + 1}`,
        name: String(rule.name || "").trim(),
        active: rule.active !== false,
        parent_section_id: parentSectionId,
        required_product_ids: requiredProductIds,
        match_mode: "any",
        child_section_ids: Array.isArray(rule.child_section_ids)
          ? rule.child_section_ids.map((item) => Number(item)).filter(Boolean)
          : [],
        sort_order: index + 1,
      };
    })
    .filter((rule) => rule.parent_section_id && rule.required_product_ids.length && rule.child_section_ids.length);

  return {
    initial_section_id: Number(initialSectionId || 0) || null,
    section_dependency_rules: normalizedDependencyRules,
  };
}

function buildSystemsPayload(systemRules) {
  return (Array.isArray(systemRules) ? systemRules : [])
    .map((rule, index) => ({
      id: rule.id || `sys_${index + 1}`,
      name: String(rule.name || "").trim(),
      active: rule.active !== false,
      required_product_ids: parseIdList(rule.required_product_ids_text),
      match_mode: String(rule.match_mode || "all"),
      derived_porton_type: String(rule.derived_porton_type || "").trim(),
      sort_order: index + 1,
    }))
    .filter((rule) => rule.required_product_ids.length && rule.derived_porton_type);
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const qc = useQueryClient();

  const isSuperuser = !!user?.is_superuser;
  const seeAllDistributors = !!user?.see_all_distributors;
  const enabled = !!user?.is_enc_comercial || isSuperuser || seeAllDistributors;
  const canManageAdvanced = isSuperuser || seeAllDistributors;

  const [catalogKind, setCatalogKind] = useState("porton");
  const [tab, setTab] = useState("tags");
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionUseSurface, setNewSectionUseSurface] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [quoteQuery, setQuoteQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [toleranceAreaM2, setToleranceAreaM2] = useState("0");
  const [savingTolerance, setSavingTolerance] = useState(false);
  const [initialSectionId, setInitialSectionId] = useState("");
  const [dependencyRules, setDependencyRules] = useState([]);
  const [systemRules, setSystemRules] = useState([]);
  const [savingInitialSection, setSavingInitialSection] = useState(false);
  const [savingDependencies, setSavingDependencies] = useState(false);
  const [savingSystems, setSavingSystems] = useState(false);
  const [pdfDrafts, setPdfDrafts] = useState({});

  const catalogQ = useQuery({
    queryKey: ["adminCatalog", catalogKind],
    queryFn: () => adminGetCatalog(catalogKind),
    enabled,
  });

  const quotesQ = useQuery({
    queryKey: ["adminQuotes", catalogKind],
    queryFn: () => adminGetQuotes(catalogKind, 200),
    enabled: enabled && tab === "data",
  });

  const finalSettingsQ = useQuery({
    queryKey: ["adminFinalSettings"],
    queryFn: adminGetFinalSettings,
    enabled,
  });

  const technicalRulesQ = useQuery({
    queryKey: ["adminTechnicalMeasurementRulesForDashboard", catalogKind],
    queryFn: () => adminGetTechnicalMeasurementRules(catalogKind),
    enabled,
  });

  const pdfNamesQ = useQuery({
    queryKey: ["adminProductPdfNames", catalogKind],
    queryFn: () => adminGetProductPdfNames(catalogKind),
    enabled: enabled && canManageAdvanced && tab === "pdf",
  });

  useEffect(() => {
    if (finalSettingsQ.data) {
      setToleranceAreaM2(String(finalSettingsQ.data.tolerance_area_m2 ?? 0));
    }
  }, [finalSettingsQ.data]);

  useEffect(() => {
    const rules = technicalRulesQ.data || {};
    setInitialSectionId(Number(rules.initial_section_id || 0) || "");

    const rawDependencies = Array.isArray(rules.section_dependency_rules)
      ? rules.section_dependency_rules
      : [];
    setDependencyRules(rawDependencies.map((rule, index) => ({
      id: String(rule.id || `dep_${index + 1}`),
      name: String(rule.name || ""),
      active: rule.active !== false,
      parent_section_id: Number(rule.parent_section_id || 0) || "",
      trigger_mode: Array.isArray(rule.required_product_ids) && rule.required_product_ids.length > 1 ? "any" : "product",
      trigger_product_id: Array.isArray(rule.required_product_ids) && rule.required_product_ids.length === 1 ? Number(rule.required_product_ids[0]) : "",
      child_section_ids: Array.isArray(rule.child_section_ids) ? rule.child_section_ids.map((item) => Number(item)).filter(Boolean) : [],
      sort_order: Number(rule.sort_order || index + 1) || index + 1,
    })));

    const rawSystems = Array.isArray(rules.system_derivation_rules) ? rules.system_derivation_rules : [];
    setSystemRules(rawSystems.map((rule, index) => ({
      id: String(rule.id || `sys_${index + 1}`),
      name: String(rule.name || ""),
      active: rule.active !== false,
      required_product_ids_text: stringifyIdList(rule.required_product_ids),
      match_mode: String(rule.match_mode || "all"),
      derived_porton_type: String(rule.derived_porton_type || ""),
      sort_order: Number(rule.sort_order || index + 1) || index + 1,
    })));
  }, [technicalRulesQ.data]);

  useEffect(() => {
    const next = {};
    for (const item of (pdfNamesQ.data || [])) {
      next[String(item.product_id)] = String(item.pdf_name || "");
    }
    setPdfDrafts(next);
  }, [pdfNamesQ.data]);

  useEffect(() => {
    setProductQuery("");
    setQuoteQuery("");
    setSectionFilter("all");
    setTagFilter("all");
  }, [catalogKind]);

  useEffect(() => {
    if (catalogKind !== "porton" && tab === "systems") setTab("tags");
  }, [catalogKind, tab]);

  useEffect(() => {
    if (!canManageAdvanced && (tab === "aliases" || tab === "pdf")) setTab("tags");
  }, [canManageAdvanced, tab]);

  const catalog = catalogQ.data || {};
  const sections = Array.isArray(catalog.sections) ? catalog.sections : [];
  const tags = Array.isArray(catalog.tags) ? catalog.tags : [];
  const products = Array.isArray(catalog.products) ? catalog.products : [];

  const productsBySectionId = useMemo(() => {
    const map = new Map();
    for (const section of sections) map.set(Number(section.id), []);
    for (const product of products) {
      const sectionIds = Array.isArray(product.section_ids) ? product.section_ids : [];
      for (const rawSectionId of sectionIds) {
        const sectionId = Number(rawSectionId);
        if (map.has(sectionId)) map.get(sectionId).push(product);
      }
    }
    return map;
  }, [sections, products]);

  const filteredProductsByQuery = useMemo(() => {
    const needle = norm(productQuery);
    let source = products;
    if (sectionFilter !== "all") {
      const sectionId = Number(sectionFilter);
      source = source.filter((product) => Array.isArray(product.section_ids) && product.section_ids.includes(sectionId));
    }
    if (tagFilter !== "all") {
      const tagId = Number(tagFilter);
      source = source.filter((product) => Array.isArray(product.tag_ids) && product.tag_ids.includes(tagId));
    }
    if (!needle) return source;
    return source.filter((product) => getProductSearchText(product).includes(needle));
  }, [products, productQuery, sectionFilter, tagFilter]);

  const filteredQuotes = useMemo(() => {
    const needle = norm(quoteQuery);
    const source = Array.isArray(quotesQ.data) ? quotesQ.data : [];
    if (!needle) return source;
    return source.filter((quote) => buildQuoteSearchText(quote).includes(needle));
  }, [quotesQ.data, quoteQuery]);

  const invalidateCatalog = () => {
    qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] });
    qc.invalidateQueries({ queryKey: ["catalog-bootstrap", catalogKind] });
  };

  const invalidateTechnicalRules = () => {
    qc.invalidateQueries({ queryKey: ["adminTechnicalMeasurementRulesForDashboard", catalogKind] });
    qc.invalidateQueries({ queryKey: ["technical-rules-for-section-catalog", catalogKind] });
  };

  async function onRefresh() {
    await adminRefreshCatalog();
    invalidateCatalog();
    alert(`Catálogo de ${formatKindLabel(catalogKind)} actualizado.`);
  }

  async function onCreateSection() {
    const name = String(newSectionName || "").trim();
    if (!name) return;
    await adminCreateSection(catalogKind, {
      name,
      position: sections.length + 1,
      use_surface_qty: newSectionUseSurface,
    });
    setNewSectionName("");
    setNewSectionUseSurface(false);
    invalidateCatalog();
    alert("Sección creada.");
  }

  async function onSaveTolerance() {
    setSavingTolerance(true);
    try {
      const saved = await adminSaveFinalSettings({ tolerance_area_m2: toleranceAreaM2 });
      setToleranceAreaM2(String(saved.tolerance_area_m2 ?? 0));
      qc.invalidateQueries({ queryKey: ["adminFinalSettings"] });
      alert("Tolerancia guardada correctamente.");
    } finally {
      setSavingTolerance(false);
    }
  }

  async function onSaveInitialSection() {
    setSavingInitialSection(true);
    try {
      await adminSaveTechnicalMeasurementRules(catalogKind, {
        initial_section_id: Number(initialSectionId || 0) || null,
          });
      invalidateTechnicalRules();
      alert("Secciones inicial/final guardadas.");
    } finally {
      setSavingInitialSection(false);
    }
  }

  async function onSaveDependencies() {
    setSavingDependencies(true);
    try {
      await adminSaveTechnicalMeasurementRules(
        catalogKind,
        buildRulePayloadFromState({ initialSectionId, dependencyRules, productsBySectionId }),
      );
      invalidateTechnicalRules();
      alert("Dependencias guardadas.");
    } finally {
      setSavingDependencies(false);
    }
  }

  async function onSaveSystems() {
    setSavingSystems(true);
    try {
      await adminSaveTechnicalMeasurementRules("porton", {
        system_derivation_rules: buildSystemsPayload(systemRules),
      });
      invalidateTechnicalRules();
      alert("Tipos o sistemas guardados.");
    } finally {
      setSavingSystems(false);
    }
  }

  if (!enabled) {
    return (
      <div className="container">
        <div className="spacer" />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Dashboard</h2>
          <div className="muted">No tenés permisos.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="spacer" />

      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Dashboard del Presupuestador</h2>
          <div className="muted">Configuración de catálogo, dependencias y cotización final</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CATALOG_KIND_OPTIONS.map((option) => (
            <Button key={option.key} variant={catalogKind === option.key ? "primary" : "ghost"} onClick={() => setCatalogKind(option.key)}>
              {option.label}
            </Button>
          ))}
        </div>
        <Button variant="ghost" onClick={onRefresh} disabled={catalogQ.isLoading || catalogQ.isFetching}>
          {catalogQ.isFetching ? "Refrescando..." : "Refrescar catálogo"}
        </Button>
      </div>

      <div className="spacer" />
      <div className="card" style={{ background: "#fafafa" }}>
        <h3 style={{ marginTop: 0 }}>Tolerancia comercial para cotización final</h3>
        <div className="muted" style={{ marginBottom: 10 }}>La tolerancia se mide en <b>m²</b>.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 220 }}>
            <div className="muted">Tolerancia m²</div>
            <Input value={toleranceAreaM2} onChange={setToleranceAreaM2} placeholder="0" style={{ width: "100%" }} />
          </div>
          <Button variant="primary" onClick={onSaveTolerance} disabled={savingTolerance || finalSettingsQ.isLoading}>
            {savingTolerance ? "Guardando..." : "Guardar tolerancia"}
          </Button>
        </div>
      </div>

      <div className="spacer" />
      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className={tab === "tags" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("tags")}>Etiquetas → Secciones</button>
        {canManageAdvanced ? <button className={tab === "aliases" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("aliases")}>Alias y visibilidad</button> : null}
        <button className={tab === "dependencies" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("dependencies")}>Dependencias</button>
        {catalogKind === "porton" ? <button className={tab === "systems" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("systems")}>Tipos o sistemas</button> : null}
        {canManageAdvanced ? <button className={tab === "pdf" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("pdf")}>Nombres PDF</button> : null}
        <button className={tab === "data" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("data")}>Data</button>
      </div>

      <div className="spacer" />
      {catalogQ.isLoading ? <div className="muted">Cargando catálogo...</div> : null}
      {catalogQ.isError ? <div style={{ color: "#d93025" }}>{catalogQ.error.message}</div> : null}

      {!catalogQ.isLoading && !catalogQ.isError ? (
        <>
          {catalogKind === "puerta" ? (
            <div className="card" style={{ background: "#f7fbff", border: "1px solid #d9e5f7" }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Catálogo de Puertas</div>
              <div className="muted">
                Configurá acá las secciones, etiquetas, alias, visibilidad y nombres PDF de Puertas. El cotizador de puertas usa este catálogo con <b>catalog_kind=&quot;puerta&quot;</b>.
              </div>
            </div>
          ) : null}

          {tab === "tags" ? (
            <TagsTab
              catalogKind={catalogKind}
              sections={sections}
              tags={tags}
              newSectionName={newSectionName}
              setNewSectionName={setNewSectionName}
              newSectionUseSurface={newSectionUseSurface}
              setNewSectionUseSurface={setNewSectionUseSurface}
              onCreateSection={onCreateSection}
              invalidateCatalog={invalidateCatalog}
            />
          ) : null}

          {canManageAdvanced && tab === "aliases" ? (
            <AliasesTab
              catalogKind={catalogKind}
              products={filteredProductsByQuery}
              productQuery={productQuery}
              setProductQuery={setProductQuery}
              sectionFilter={sectionFilter}
              setSectionFilter={setSectionFilter}
              tagFilter={tagFilter}
              setTagFilter={setTagFilter}
              sections={sections}
              tags={tags}
              invalidateCatalog={invalidateCatalog}
            />
          ) : null}

          {tab === "dependencies" ? (
            <DependenciesTab
              catalogKind={catalogKind}
              sections={sections}
              productsBySectionId={productsBySectionId}
              initialSectionId={initialSectionId}
              setInitialSectionId={setInitialSectionId}
              dependencyRules={dependencyRules}
              setDependencyRules={setDependencyRules}
              savingInitialSection={savingInitialSection}
              onSaveInitialSection={onSaveInitialSection}
              savingDependencies={savingDependencies}
              onSaveDependencies={onSaveDependencies}
            />
          ) : null}

          {catalogKind === "porton" && tab === "systems" ? (
            <SystemsTab
              products={products}
              systemRules={systemRules}
              setSystemRules={setSystemRules}
              savingSystems={savingSystems}
              onSaveSystems={onSaveSystems}
            />
          ) : null}

          {canManageAdvanced && tab === "pdf" ? (
            <PdfNamesTab
              catalogKind={catalogKind}
              items={pdfNamesQ.data || []}
              isLoading={pdfNamesQ.isLoading}
              isError={pdfNamesQ.isError}
              error={pdfNamesQ.error}
              drafts={pdfDrafts}
              setDrafts={setPdfDrafts}
              qc={qc}
            />
          ) : null}

          {tab === "data" ? (
            <DataTab
              sections={sections}
              tags={tags}
              products={filteredProductsByQuery}
              quotes={filteredQuotes}
              productQuery={productQuery}
              setProductQuery={setProductQuery}
              quoteQuery={quoteQuery}
              setQuoteQuery={setQuoteQuery}
              sectionFilter={sectionFilter}
              setSectionFilter={setSectionFilter}
              tagFilter={tagFilter}
              setTagFilter={setTagFilter}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function TagsTab({ catalogKind, sections, tags, newSectionName, setNewSectionName, newSectionUseSurface, setNewSectionUseSurface, onCreateSection, invalidateCatalog }) {
  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "es", { sensitivity: "base" })),
    [tags],
  );

  return (
    <div className="row">
      <div className="card" style={{ flex: 1, minWidth: 320 }}>
        <h3 style={{ marginTop: 0 }}>Secciones</h3>
        <div className="muted">Estas secciones son las que va a ver el vendedor en el cotizador.</div>
        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Input value={newSectionName} onChange={setNewSectionName} placeholder="Nueva sección..." style={{ flex: 1, minWidth: 180 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180 }}>
            <input type="checkbox" checked={newSectionUseSurface} onChange={(event) => setNewSectionUseSurface(event.target.checked)} />
            <span className="muted">Cantidad = superficie</span>
          </label>
          <Button variant="primary" disabled={!String(newSectionName || "").trim()} onClick={onCreateSection}>Crear</Button>
        </div>
        <div className="spacer" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sections.map((section) => (
            <EditableSectionRow key={section.id} catalogKind={catalogKind} section={section} invalidateCatalog={invalidateCatalog} />
          ))}
          {!sections.length ? <div className="muted">Todavía no hay secciones para este catálogo.</div> : null}
        </div>
      </div>

      <div className="card" style={{ flex: 2, minWidth: 520 }}>
        <h3 style={{ marginTop: 0 }}>Asignar sección por etiqueta de Odoo</h3>
        <div className="muted">Los productos que tengan esa etiqueta van a aparecer dentro de la sección elegida.</div>
        <div className="spacer" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sortedTags.map((tag) => (
            <div key={tag.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, border: "1px solid #eee", padding: 10, borderRadius: 10, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800 }}>{tag.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>ID etiqueta: {tag.id}</div>
              </div>
              <select
                value={tag.section_id || ""}
                onChange={async (event) => {
                  const sectionId = event.target.value ? Number(event.target.value) : null;
                  await adminSetTagSection(catalogKind, tag.id, sectionId);
                  invalidateCatalog();
                  alert("Etiqueta actualizada.");
                }}
                style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", minWidth: 220 }}
              >
                <option value="">(sin sección)</option>
                {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
              </select>
            </div>
          ))}
          {!sortedTags.length ? <div className="muted">No hay etiquetas cargadas desde Odoo para este catálogo.</div> : null}
        </div>
      </div>
    </div>
  );
}

function EditableSectionRow({ catalogKind, section, invalidateCatalog }) {
  const [name, setName] = useState(section.name || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => setName(section.name || ""), [section.id, section.name]);

  const changed = String(name || "").trim() && String(name || "").trim() !== String(section.name || "").trim();

  return (
    <div style={{ border: "1px solid #eee", padding: 10, borderRadius: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
        <div>
          <div className="muted" style={{ marginBottom: 6 }}>Nombre de la sección · ID {section.id}</div>
          <Input value={name} onChange={setName} placeholder="Nombre de la sección" style={{ width: "100%" }} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            variant="primary"
            disabled={!changed || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await adminUpdateSection(catalogKind, section.id, { name: String(name || "").trim() });
                invalidateCatalog();
                alert("Nombre de la sección actualizado.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              if (!window.confirm(`Borrar sección "${section.name}"?`)) return;
              await adminDeleteSection(catalogKind, section.id);
              invalidateCatalog();
              alert("Sección borrada.");
            }}
          >
            Borrar
          </Button>
        </div>
      </div>
      <div className="spacer" />
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={!!section.use_surface_qty}
          onChange={async (event) => {
            await adminUpdateSection(catalogKind, section.id, { use_surface_qty: event.target.checked });
            invalidateCatalog();
          }}
        />
        <span className="muted">Usar superficie como cantidad automática para los productos de esta sección.</span>
      </label>
    </div>
  );
}

function CatalogFilters({ sections, tags, productQuery, setProductQuery, sectionFilter, setSectionFilter, tagFilter, setTagFilter }) {
  return (
    <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <input
        value={productQuery}
        onChange={(event) => setProductQuery(event.target.value)}
        placeholder="Buscar producto por nombre, ID, código o alias..."
        style={{ flex: 1, minWidth: 260, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
      />
      <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 200 }}>
        <option value="all">Todas las secciones</option>
        {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
      </select>
      <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 200 }}>
        <option value="all">Todas las etiquetas</option>
        {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
      </select>
    </div>
  );
}

function AliasesTab({ catalogKind, products, productQuery, setProductQuery, sectionFilter, setSectionFilter, tagFilter, setTagFilter, sections, tags, invalidateCatalog }) {
  return (
    <>
      <CatalogFilters sections={sections} tags={tags} productQuery={productQuery} setProductQuery={setProductQuery} sectionFilter={sectionFilter} setSectionFilter={setSectionFilter} tagFilter={tagFilter} setTagFilter={setTagFilter} />
      <div className="spacer" />
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Alias y visibilidad</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead>
            <tr>
              <th style={thStyle}>ID Pres.</th>
              <th style={thStyle}>Producto</th>
              <th style={thStyle}>Alias visible</th>
              <th style={thStyle}>Visibilidad</th>
              <th style={thStyle}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => <AliasRow key={product.id} catalogKind={catalogKind} product={product} invalidateCatalog={invalidateCatalog} />)}
          </tbody>
        </table>
        {!products.length ? <div className="muted">Sin productos para mostrar.</div> : null}
      </div>
    </>
  );
}

function AliasRow({ catalogKind, product, invalidateCatalog }) {
  const [alias, setAlias] = useState(product.alias || product.internal_alias || "");
  const [visibility, setVisibility] = useState(visibilityModeFromProduct(product));
  const [saving, setSaving] = useState(false);

  useEffect(() => setAlias(product.alias || product.internal_alias || ""), [product.id, product.alias, product.internal_alias]);
  useEffect(() => setVisibility(visibilityModeFromProduct(product)), [product]);

  return (
    <tr>
      <td style={tdStyle}>
        <div style={{ fontWeight: 800 }}>{product.id}</div>
        <div className="muted" style={{ fontSize: 12 }}>Odoo: {product.odoo_id || product.odoo_template_id || product.odoo_variant_id || "-"}</div>
      </td>
      <td style={tdStyle}>
        <div style={{ fontWeight: 800 }}>{getProductLabel(product)}</div>
        <div className="muted" style={{ fontSize: 12 }}>{product.name || product.raw_name || product.client_display_name || ""}</div>
      </td>
      <td style={tdStyle}>
        <input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="Alias para el presupuestador" style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
      </td>
      <td style={tdStyle}>
        <select value={visibility} onChange={(event) => setVisibility(event.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 190 }}>
          <option value="none">Visible para todos</option>
          <option value="vendedor">Ocultar vendedor</option>
          <option value="distribuidor">Ocultar distribuidor</option>
          <option value="both">Ocultar ambos</option>
        </select>
      </td>
      <td style={tdStyle}>
        <Button
          variant="primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await adminSetProductAlias(catalogKind, product.id, alias);
              await adminSetProductVisibility(catalogKind, product.id, flagsFromVisibilityMode(visibility));
              invalidateCatalog();
              alert("Producto actualizado.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Guardando..." : "Guardar"}
        </Button>
      </td>
    </tr>
  );
}

function DependenciesTab({ catalogKind, sections, productsBySectionId, initialSectionId, setInitialSectionId, dependencyRules, setDependencyRules, savingInitialSection, onSaveInitialSection, savingDependencies, onSaveDependencies }) {
  function updateRule(index, patch) {
    setDependencyRules((prev) => prev.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)));
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Dependencias del catálogo de {formatKindLabel(catalogKind)}</h3>
      <div className="muted">
        Definí con qué sección empieza el cotizador y qué secciones se habilitan después según lo que elija el vendedor.
      </div>
      <div className="spacer" />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ minWidth: 260 }}>
          <div className="muted">Sección inicial</div>
          <select value={initialSectionId || ""} onChange={(event) => setInitialSectionId(event.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 260 }}>
            <option value="">Sin sección inicial</option>
            {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
          </select>
        </div>
        <Button variant="primary" onClick={onSaveInitialSection} disabled={savingInitialSection}>{savingInitialSection ? "Guardando..." : "Guardar secciones"}</Button>
      </div>
      <div className="spacer" />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>Reglas</h4>
        <Button variant="secondary" onClick={() => setDependencyRules((prev) => [...prev, newDependencyRule(prev.length + 1)])}>Agregar regla</Button>
      </div>
      <div className="spacer" />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {dependencyRules.map((rule, index) => {
          const parentSectionId = Number(rule.parent_section_id || 0);
          const parentProducts = productsBySectionId.get(parentSectionId) || [];
          return (
            <div key={rule.id || index} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <div>
                  <div className="muted">Nombre</div>
                  <Input value={rule.name || ""} onChange={(value) => updateRule(index, { name: value })} placeholder="Nombre de la regla" style={{ width: "100%" }} />
                </div>
                <div>
                  <div className="muted">Sección padre</div>
                  <select value={rule.parent_section_id || ""} onChange={(event) => updateRule(index, { parent_section_id: event.target.value, trigger_product_id: "" })} style={selectFullStyle}>
                    <option value="">Seleccionar</option>
                    {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="muted">Condición</div>
                  <select value={rule.trigger_mode || "product"} onChange={(event) => updateRule(index, { trigger_mode: event.target.value })} style={selectFullStyle}>
                    <option value="product">Si elige producto</option>
                    <option value="any">Si elige cualquier producto de la sección</option>
                  </select>
                </div>
                {String(rule.trigger_mode || "product") === "product" ? (
                  <div>
                    <div className="muted">Producto disparador</div>
                    <select value={rule.trigger_product_id || ""} onChange={(event) => updateRule(index, { trigger_product_id: event.target.value })} style={selectFullStyle}>
                      <option value="">Seleccionar</option>
                      {parentProducts.map((product) => <option key={product.id} value={product.id}>{getProductLabel(product)}</option>)}
                    </select>
                  </div>
                ) : null}
                <div>
                  <div className="muted">Secciones que habilita</div>
                  <input
                    value={stringifyIdList(rule.child_section_ids)}
                    onChange={(event) => updateRule(index, { child_section_ids: parseIdList(event.target.value) })}
                    placeholder="IDs separados por coma"
                    style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                  />
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    IDs disponibles: {sections.map((section) => `${section.id}=${section.name}`).join(" · ") || "sin secciones"}
                  </div>
                </div>
              </div>
              <div className="spacer" />
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={rule.active !== false} onChange={(event) => updateRule(index, { active: event.target.checked })} />
                  <span className="muted">Activa</span>
                </label>
                <Button variant="ghost" onClick={() => setDependencyRules((prev) => prev.filter((_, idx) => idx !== index))}>Eliminar regla</Button>
              </div>
            </div>
          );
        })}
        {!dependencyRules.length ? <div className="muted">No hay reglas cargadas.</div> : null}
      </div>
      <div className="spacer" />
      <Button variant="primary" onClick={onSaveDependencies} disabled={savingDependencies}>{savingDependencies ? "Guardando..." : "Guardar dependencias"}</Button>
    </div>
  );
}

function SystemsTab({ products, systemRules, setSystemRules, savingSystems, onSaveSystems }) {
  function updateSystemRule(index, patch) {
    setSystemRules((prev) => prev.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)));
  }

  const productsHint = useMemo(() => {
    return (Array.isArray(products) ? products : [])
      .slice(0, 80)
      .map((product) => `${product.id}=${getProductLabel(product)}`)
      .join(" · ");
  }, [products]);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>Tipos o sistemas de Portones</h3>
          <div className="muted">
            Asigná qué sistema debe tomar el presupuesto cuando contiene una combinación de IDs de productos.
          </div>
        </div>
        <Button variant="secondary" onClick={() => setSystemRules((prev) => [...prev, newSystemRule(prev.length + 1)])}>Agregar sistema</Button>
      </div>
      <div className="spacer" />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(Array.isArray(systemRules) ? systemRules : []).map((rule, index) => (
          <div key={rule.id || index} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fafafa" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <div>
                <div className="muted">Nombre</div>
                <Input value={rule.name || ""} onChange={(value) => updateSystemRule(index, { name: value })} placeholder="Ej: Para revestir con puerta" style={{ width: "100%" }} />
              </div>
              <div>
                <div className="muted">IDs de productos requeridos</div>
                <input
                  value={rule.required_product_ids_text || ""}
                  onChange={(event) => updateSystemRule(index, { required_product_ids_text: event.target.value })}
                  placeholder="Ej: 3006, 2815"
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Separá IDs con coma, espacio o punto y coma.</div>
              </div>
              <div>
                <div className="muted">Coincidencia</div>
                <select value={rule.match_mode || "all"} onChange={(event) => updateSystemRule(index, { match_mode: event.target.value })} style={selectFullStyle}>
                  <option value="all">Todos los IDs</option>
                  <option value="any">Cualquiera de los IDs</option>
                </select>
              </div>
              <div>
                <div className="muted">Sistema asignado</div>
                <select value={rule.derived_porton_type || ""} onChange={(event) => updateSystemRule(index, { derived_porton_type: event.target.value })} style={selectFullStyle}>
                  <option value="">Seleccionar sistema</option>
                  {PORTON_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
                </select>
              </div>
            </div>
            <div className="spacer" />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={rule.active !== false} onChange={(event) => updateSystemRule(index, { active: event.target.checked })} />
                <span className="muted">Activa</span>
              </label>
              <Button variant="ghost" onClick={() => setSystemRules((prev) => prev.filter((_, idx) => idx !== index))}>Eliminar sistema</Button>
            </div>
          </div>
        ))}
        {!systemRules.length ? <div className="muted">No hay tipos/sistemas automáticos cargados.</div> : null}
      </div>
      {productsHint ? (
        <>
          <div className="spacer" />
          <div className="muted" style={{ fontSize: 12 }}>
            IDs disponibles: {productsHint}
          </div>
        </>
      ) : null}
      <div className="spacer" />
      <Button variant="primary" onClick={onSaveSystems} disabled={savingSystems}>{savingSystems ? "Guardando..." : "Guardar tipos o sistemas"}</Button>
    </div>
  );
}

function PdfNamesTab({ catalogKind, items, isLoading, isError, error, drafts, setDrafts, qc }) {
  const [q, setQ] = useState("");
  const [savingProductId, setSavingProductId] = useState(null);

  const filtered = useMemo(() => {
    const needle = norm(q);
    const source = Array.isArray(items) ? items : [];
    if (!needle) return source;
    return source.filter((item) => norm([item.product_id, item.odoo_id, item.odoo_name, item.presupuestador_name, item.alias, item.pdf_name].join(" ")).includes(needle));
  }, [items, q]);

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ marginTop: 0 }}>Nombres PDF</h3>
      <div className="muted">Definí el nombre exacto que querés que salga en los PDF para este catálogo.</div>
      <div className="spacer" />
      <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar por ID, nombre Odoo, alias o nombre PDF..." style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
      <div className="spacer" />
      {isLoading ? <div className="muted">Cargando...</div> : null}
      {isError ? <div style={{ color: "#d93025" }}>{error?.message || "No se pudo cargar"}</div> : null}
      {!!filtered.length ? (
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead>
            <tr>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Producto</th>
              <th style={thStyle}>Nombre PDF</th>
              <th style={thStyle}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const productId = String(item.product_id);
              const draft = drafts[productId] ?? "";
              return (
                <tr key={`${catalogKind}-${productId}`}>
                  <td style={tdStyle}>{item.product_id}</td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 800 }}>{item.presupuestador_name || item.odoo_name || "-"}</div>
                    <div className="muted" style={{ fontSize: 12 }}>Odoo: {item.odoo_id || item.odoo_template_id || "-"}</div>
                  </td>
                  <td style={tdStyle}>
                    <input value={draft} onChange={(event) => setDrafts((prev) => ({ ...prev, [productId]: event.target.value }))} placeholder={item.odoo_name || "Nombre PDF"} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
                  </td>
                  <td style={tdStyle}>
                    <Button
                      variant="primary"
                      disabled={savingProductId === productId}
                      onClick={async () => {
                        setSavingProductId(productId);
                        try {
                          await adminSetProductPdfName(catalogKind, item.product_id, draft);
                          qc.invalidateQueries({ queryKey: ["adminProductPdfNames", catalogKind] });
                          alert("Nombre PDF guardado.");
                        } finally {
                          setSavingProductId(null);
                        }
                      }}
                    >
                      {savingProductId === productId ? "Guardando..." : "Guardar"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (!isLoading ? <div className="muted">Sin productos para mostrar.</div> : null)}
    </div>
  );
}

function OdooProductDebugPanel() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleDebug() {
    const val = input.trim();
    if (!val) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const isNumber = /^\d+$/.test(val);
      const data = await adminDebugOdooProduct(
        isNumber ? { templateId: val } : { query: val }
      );
      setResult(data);
    } catch (e) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  const allTagsFound = result ? [
    ...(result.variants || []).flatMap((v) => v.tags_resolved || []),
    ...(result.templates || []).flatMap((t) => t.tags_resolved || []),
  ] : [];
  const uniqueTags = [...new Map(allTagsFound.map((t) => [t.id, t])).values()];

  const isTemplateIdSearch = result && result.requested?.template_id;
  const variantsSaleOkCount = (result?.variants || []).filter((v) => v.raw?.sale_ok === true).length;
  const variantsTotal = result?.variants?.length ?? 0;

  return (
    <div className="card" style={{ background: "#fffbf0", border: "1px solid #ffe082" }}>
      <h3 style={{ marginTop: 0, color: "#7a5a00" }}>Debug: tags de Odoo para un producto</h3>
      <div className="muted" style={{ marginBottom: 10 }}>Ingresá el ID del template de Odoo (ej: 3503) o el nombre del producto.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleDebug()}
          placeholder="Template ID o nombre..."
          style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc" }}
        />
        <button
          onClick={handleDebug}
          disabled={loading || !input.trim()}
          style={{ padding: "8px 16px", borderRadius: 6, background: "#f57f17", color: "#fff", border: "none", cursor: "pointer", fontWeight: 700 }}
        >
          {loading ? "Consultando..." : "Consultar Odoo"}
        </button>
      </div>
      {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}
      {result && (
        <div style={{ marginTop: 16 }}>
          {isTemplateIdSearch ? (
            <div className="muted" style={{ marginBottom: 8, fontSize: 13 }}>
              Variantes del template: <b>{variantsTotal}</b> total, <b style={{ color: variantsSaleOkCount === 0 ? "#b71c1c" : "#1b5e20" }}>{variantsSaleOkCount} con sale_ok=true</b>
              {variantsTotal > 0 && ` → ${(result.variants || []).map((v) => `${v.name} (sale_ok=${v.raw?.sale_ok})`).join(", ")}`}
            </div>
          ) : (
            <div className="muted" style={{ marginBottom: 8, fontSize: 13 }}>
              Variantes encontradas (sale_ok=true): <b>{variantsTotal}</b>
              {variantsTotal > 0 && ` → ${result.variants.map((v) => v.name).join(", ")}`}
              {(result.templates || []).length > 0 && (
                <span style={{ marginLeft: 12, color: "#888" }}>
                  Templates: {result.templates.map((t) => `ID ${t.id} "${t.name}"`).join(", ")}
                </span>
              )}
            </div>
          )}
          {result.templates?.length > 0 && isTemplateIdSearch && (
            <div className="muted" style={{ marginBottom: 8, fontSize: 13 }}>
              Template: <b>ID {result.templates[0].id}</b> — "{result.templates[0].name}"
            </div>
          )}
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Tags encontrados en Odoo:</div>
          {uniqueTags.length === 0 ? (
            <div className="muted">Ningún tag encontrado para este producto.</div>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ background: "#fff8e1" }}>
                  <th style={thStyle}>Nombre</th>
                  <th style={thStyle}>Stable ID</th>
                  <th style={thStyle}>Raw ID</th>
                  <th style={thStyle}>Modelo</th>
                </tr>
              </thead>
              <tbody>
                {uniqueTags.map((tag) => (
                  <tr key={tag.id}>
                    <td style={tdStyle}><b>{tag.name}</b></td>
                    <td style={tdStyle}><code>{tag.id}</code></td>
                    <td style={tdStyle}><code>{tag.raw_id}</code></td>
                    <td style={tdStyle}><code>{tag.model}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result.variants?.[0]?.tag_fields_detected && (
            <div style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                Campos de tag en variant: {(Array.isArray(result.variants[0].tag_fields_detected) ? result.variants[0].tag_fields_detected : []).map((f) => typeof f === "string" ? f : f?.field).filter(Boolean).join(", ") || "(ninguno)"}
              </div>
            </div>
          )}
          {result.templates?.[0]?.tag_fields_detected && (
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Campos de tag en template: {(Array.isArray(result.templates[0].tag_fields_detected) ? result.templates[0].tag_fields_detected : []).map((f) => typeof f === "string" ? f : f?.field).filter(Boolean).join(", ") || "(ninguno)"}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DataTab({ sections, tags, products, quotes, productQuery, setProductQuery, quoteQuery, setQuoteQuery, sectionFilter, setSectionFilter, tagFilter, setTagFilter }) {
  return (
    <>
      <CatalogFilters sections={sections} tags={tags} productQuery={productQuery} setProductQuery={setProductQuery} sectionFilter={sectionFilter} setSectionFilter={setSectionFilter} tagFilter={tagFilter} setTagFilter={setTagFilter} />
      <div className="spacer" />
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Productos del catálogo</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Producto</th>
              <th style={thStyle}>Tags</th>
              <th style={thStyle}>Secciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td style={tdStyle}>{product.id}</td>
                <td style={tdStyle}>{getProductLabel(product)}</td>
                <td style={tdStyle}>{(product.tag_ids || []).map((id) => tags.find((tag) => Number(tag.id) === Number(id))?.name || id).join(", ") || "-"}</td>
                <td style={tdStyle}>{(product.section_ids || []).map((id) => sections.find((section) => Number(section.id) === Number(id))?.name || id).join(", ") || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!products.length ? <div className="muted">Sin productos para mostrar.</div> : null}
      </div>

      <div className="spacer" />
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Presupuestos recientes</h3>
        <input value={quoteQuery} onChange={(event) => setQuoteQuery(event.target.value)} placeholder="Buscar presupuesto por cliente, estado o referencia..." style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
        <div className="spacer" />
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr>
              <th style={thStyle}>Fecha</th>
              <th style={thStyle}>Cliente</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>Destino</th>
              <th style={thStyle}>Referencia Odoo</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => {
              const customer = quote.end_customer || {};
              return (
                <tr key={quote.id}>
                  <td style={tdStyle}>{quote.created_at ? new Date(quote.created_at).toLocaleDateString("es-AR") : "-"}</td>
                  <td style={tdStyle}>{customer.name || [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "-"}</td>
                  <td style={tdStyle}>{quote.final_status || quote.status || "-"}</td>
                  <td style={tdStyle}>{quote.fulfillment_mode || "-"}</td>
                  <td style={tdStyle}>{quote.final_sale_order_name || quote.odoo_sale_order_name || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!quotes.length ? <div className="muted">Sin presupuestos para mostrar.</div> : null}
      </div>

      <div className="spacer" />
      <OdooProductDebugPanel />
    </>
  );
}

const thStyle = { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" };
const tdStyle = { padding: "10px 8px", borderBottom: "1px solid #f3f3f3", verticalAlign: "top" };
const selectFullStyle = { width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" };
