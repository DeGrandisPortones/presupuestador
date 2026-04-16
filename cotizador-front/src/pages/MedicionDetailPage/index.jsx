import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getMeasurement,
  reviewMeasurement,
  saveMeasurementDetailed,
} from "../../api/measurements.js";
import {
  adminGetTechnicalMeasurementFieldDefinitions,
} from "../../api/admin.js";
import { getCatalogBootstrap } from "../../api/catalog.js";
import { useAuthStore } from "../../domain/auth/store.js";
import { mergeMeasurementFields } from "../../domain/measurement/technicalMeasurementRuleFields.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

const BASE_EDITABLE_SECTION_IDS = new Set([18, 23]);
const DEFAULT_RETURN_REASON_ITEM_18 =
  "El medidor cambió un producto de la sección 18. Esto puede ocasionar costos adicionales y debe revisarlo el vendedor.";
const SCHEME_RECT_PCTS = {
  alto: [
    { left: 9.22, top: 43.73, width: 14.4, height: 14.24 },
    { left: 27.02, top: 43.73, width: 14.4, height: 14.24 },
    { left: 44.5, top: 43.73, width: 14.24, height: 14.24 },
  ],
  ancho: [
    { left: 71.36, top: 22.71, width: 14.4, height: 14.24 },
    { left: 71.36, top: 48.14, width: 14.4, height: 13.9 },
    { left: 71.36, top: 82.71, width: 14.4, height: 14.24 },
  ],
};
const schemeOverlayBaseStyle = {
  position: "absolute",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  color: "#111",
  textShadow: "0 1px 0 rgba(255,255,255,0.9)",
  background: "rgba(255,255,255,0.55)",
  borderRadius: 6,
  pointerEvents: "none",
};

function text(v) {
  return String(v ?? "").trim();
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function splitName(endCustomer = {}) {
  const first = text(endCustomer.first_name);
  const last = text(endCustomer.last_name);
  if (first || last) return { first, last };
  const parts = text(endCustomer.name).split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}
function extractBudgetDimensionMm(quote, key) {
  const dims = quote?.payload?.dimensions || {};
  const raw = key === "ancho" ? dims?.width : dims?.height;
  const n = Number(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 1000));
}
function normalizeTriple(values = [], suggested = "") {
  const arr = Array.isArray(values) ? values.slice(0, 3).map((v) => text(v)) : [];
  while (arr.length < 3) arr.push("");
  if (!arr.some(Boolean) && suggested) arr[1] = suggested;
  return arr;
}
function cloneContainer(value) {
  return Array.isArray(value) ? value.slice() : { ...(value || {}) };
}
function isNumericSegment(value) {
  return /^\d+$/.test(String(value || ""));
}
function getByPath(obj, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}
function setByPath(obj, path, value) {
  const parts = String(path || "").split(".").filter(Boolean);
  if (!parts.length) return obj;
  const root = cloneContainer(obj || {});
  let cur = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = isNumericSegment(parts[i]) ? Number(parts[i]) : parts[i];
    const nextSegment = parts[i + 1];
    const existing = cur[key];
    if (existing && typeof existing === "object") {
      cur[key] = cloneContainer(existing);
    } else {
      cur[key] = isNumericSegment(nextSegment) ? [] : {};
    }
    cur = cur[key];
  }
  const lastKey = isNumericSegment(parts[parts.length - 1])
    ? Number(parts[parts.length - 1])
    : parts[parts.length - 1];
  cur[lastKey] = value;
  return root;
}
function updateSchemeValue(form, axis, index, value) {
  const next = {
    ...(form.esquema || {}),
    alto: normalizeTriple(form.esquema?.alto || []),
    ancho: normalizeTriple(form.esquema?.ancho || []),
  };
  next[axis][index] = value;
  return { ...form, esquema: next };
}
function buildMapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
function getCurrentPositionAsync() {
  return new Promise((resolve, reject) => {
    if (!navigator?.geolocation) return reject(new Error("Geolocalización no disponible"));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
  });
}
function buildInitialForm(quote, current = {}) {
  const end = quote?.end_customer || {};
  const split = splitName(end);
  const suggestedAlto = extractBudgetDimensionMm(quote, "alto");
  const suggestedAncho = extractBudgetDimensionMm(quote, "ancho");
  return {
    ...current,
    fecha: text(current.fecha) || todayISO(),
    fecha_nota_pedido:
      text(current.fecha_nota_pedido) ||
      (quote?.confirmed_at ? String(quote.confirmed_at).slice(0, 10) : ""),
    nota_venta:
      text(current.nota_venta) ||
      text(
        quote?.final_sale_order_name ||
          quote?.odoo_sale_order_name ||
          quote?.quote_number,
      ),
    cliente_nombre: text(current.cliente_nombre) || split.first,
    cliente_apellido: text(current.cliente_apellido) || split.last,
    distribuidor:
      text(current.distribuidor) ||
      text(
        quote?.created_by_full_name ||
          quote?.created_by_username ||
          (quote?.created_by_role === "vendedor" ? "De Grandis Portones" : ""),
      ),
    esquema: {
      alto: normalizeTriple(current?.esquema?.alto || [], suggestedAlto),
      ancho: normalizeTriple(current?.esquema?.ancho || [], suggestedAncho),
    },
    alto_final_mm: text(current.alto_final_mm) || suggestedAlto,
    ancho_final_mm: text(current.ancho_final_mm) || suggestedAncho,
  };
}
function normalizeNameKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function buildBudgetSectionsContext(quote, catalog) {
  const sections = Array.isArray(catalog?.sections) ? catalog.sections.slice() : [];
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  const lineByProductId = new Map(lines.map((line) => [Number(line?.product_id), line]));
  const byId = {};
  const byName = {};
  for (const section of sections) {
    const item = { id: Number(section?.id), name: String(section?.name || ""), selected_products: [] };
    byId[item.id] = item;
    byName[normalizeNameKey(item.name)] = item;
  }
  for (const product of products) {
    const line = lineByProductId.get(Number(product?.id));
    if (!line) continue;
    const sectionIds = Array.isArray(product?.section_ids) ? product.section_ids : [];
    for (const sectionIdRaw of sectionIds) {
      const sectionId = Number(sectionIdRaw);
      if (!byId[sectionId]) byId[sectionId] = { id: sectionId, name: "", selected_products: [] };
      const displayName = String(line?.name || product?.display_name || product?.alias || product?.name || "").trim();
      byId[sectionId].selected_products.push({
        product_id: Number(product?.id),
        display_name: displayName,
        alias: String(product?.alias || "").trim(),
        raw_name: String(line?.raw_name || product?.name || displayName).trim(),
        code: String(line?.code || product?.code || "").trim(),
        qty: Number(line?.qty || 1) || 1,
      });
    }
  }
  return { by_id: byId, by_name: byName };
}
function buildBudgetContext(quote, catalog, user) {
  return {
    payload: quote?.payload || {},
    end_customer: quote?.end_customer || {},
    quote: {
      quote_number: quote?.quote_number || "",
      created_by_full_name: quote?.created_by_full_name || "",
      created_by_username: quote?.created_by_username || "",
      odoo_sale_order_name: quote?.odoo_sale_order_name || "",
      final_sale_order_name: quote?.final_sale_order_name || "",
      confirmed_at: quote?.confirmed_at || "",
    },
    current_user: {
      is_medidor: !!user?.is_medidor,
      is_rev_tecnica: !!user?.is_rev_tecnica,
      is_enc_comercial: !!user?.is_enc_comercial,
    },
    budget_sections: buildBudgetSectionsContext(quote, catalog),
  };
}
function buildBudgetSummaryItems(budgetContext, form) {
  const sectionsById = budgetContext?.budget_sections?.by_id || {};
  return Object.values(sectionsById)
    .filter((section) => Array.isArray(section?.selected_products) && section.selected_products.length)
    .map((section) => {
      const original = section.selected_products
        .map((product) => product.display_name || product.alias || product.raw_name || "")
        .filter(Boolean)
        .join(", ");
      const override = text(form?.__budget_section_override?.[section.id]?.value);
      return {
        key: `section-${section.id}`,
        sectionId: Number(section.id),
        sectionName: section.name || `Sección ${section.id}`,
        value: override || original,
      };
    })
    .sort((a, b) => Number(a.sectionId || 0) - Number(b.sectionId || 0));
}
function productDisplayLabel(product) {
  const alias = String(product?.alias || "").trim();
  const display = String(product?.display_name || product?.name || "").trim();
  const code = String(product?.code || "").trim();
  return `${alias || display}${code ? ` · ${code}` : ""}`.trim();
}
function resolveEditableSectionIds(budgetContext) {
  const byId = budgetContext?.budget_sections?.by_id || {};
  const ids = new Set();
  for (const sectionId of BASE_EDITABLE_SECTION_IDS) {
    if (byId[sectionId]?.selected_products?.length) ids.add(sectionId);
  }
  if (byId[39]?.selected_products?.length) ids.add(39);
  else if (byId[40]?.selected_products?.length) ids.add(40);
  return ids;
}
function customerMapsHref(endCustomer = {}) {
  const raw = text(endCustomer?.maps_url);
  return raw || null;
}
function customerFullAddress(endCustomer = {}) {
  const address = text(endCustomer?.address);
  const city = text(endCustomer?.city);
  if (address && city) return `${address} · ${city}`;
  return address || city || '';
}
function firstCatalogProductsForSection(sectionId, catalog) {
  return (Array.isArray(catalog?.products) ? catalog.products : []).filter((product) =>
    Array.isArray(product?.section_ids)
      ? product.section_ids.some((sid) => Number(sid) === Number(sectionId))
      : false,
  );
}
function Section({ title, children }) {
  return (
    <div className="card" style={{ background: "#fafafa", marginBottom: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ children }) {
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>;
}
function Field({ label, children }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div className="muted" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

export default function MedicionDetailPage() {
  const { id } = useParams();
  const quoteId = id ? String(id) : null;
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isTechnical = !!user?.is_rev_tecnica;
  const isMedidor = !!user?.is_medidor;

  const q = useQuery({
    queryKey: ["measurement", quoteId],
    queryFn: () => getMeasurement(quoteId),
    enabled: !!quoteId,
  });
  const dynamicFieldsQ = useQuery({
    queryKey: ["technicalMeasurementFieldsForMeasurement"],
    queryFn: adminGetTechnicalMeasurementFieldDefinitions,
    enabled: !!quoteId,
  });
  const catalogQ = useQuery({
    queryKey: ["catalogBootstrapForMeasurement", "porton"],
    queryFn: () => getCatalogBootstrap("porton"),
    enabled: !!quoteId,
  });

  const quote = q.data;
  const [form, setForm] = useState(null);
  const [lastMessage, setLastMessage] = useState("");
  const [technicalDimensionEditEnabled, setTechnicalDimensionEditEnabled] = useState({ alto: false, ancho: false });

  useEffect(() => {
    if (!quote) return;
    setForm(buildInitialForm(quote, quote.measurement_form || {}));
  }, [quote]);

  const configuredFieldDefinitions = useMemo(
    () => (Array.isArray(dynamicFieldsQ.data?.fields) ? dynamicFieldsQ.data.fields : []),
    [dynamicFieldsQ.data],
  );
  const allFields = useMemo(
    () => mergeMeasurementFields(configuredFieldDefinitions).filter((field) => field?.active !== false),
    [configuredFieldDefinitions],
  );
  const budgetContext = useMemo(
    () => buildBudgetContext(quote, catalogQ.data, user),
    [quote, catalogQ.data, user],
  );
  const budgetSummaryItems = useMemo(
    () => buildBudgetSummaryItems(budgetContext, form),
    [budgetContext, form],
  );
  const editableSectionIds = useMemo(
    () => resolveEditableSectionIds(budgetContext),
    [budgetContext],
  );

  const editableConfiguredFields = useMemo(() => {
    return allFields.filter((field) => {
      const sectionId = Number(field?.budget_section_id || 0);
      if (!editableSectionIds.has(sectionId)) return false;
      const bindingType = String(
        field?.odoo_binding_type ||
          (String(field?.type || "") === "odoo_product" ? "selected_measurement_product" : "none"),
      )
        .trim()
        .toLowerCase();
      return String(field?.type || "") === "odoo_product" || bindingType === "selected_measurement_product";
    });
  }, [allFields, editableSectionIds]);

  const fallbackSections = useMemo(() => {
    const byId = budgetContext?.budget_sections?.by_id || {};
    const configuredIds = new Set(editableConfiguredFields.map((field) => Number(field?.budget_section_id || 0)));
    return [...editableSectionIds]
      .filter((sectionId) => !configuredIds.has(sectionId))
      .map((sectionId) => ({
        id: sectionId,
        name: String(byId?.[sectionId]?.name || `Sección ${sectionId}`),
        currentProducts: Array.isArray(byId?.[sectionId]?.selected_products) ? byId[sectionId].selected_products : [],
        catalogProducts: firstCatalogProductsForSection(sectionId, catalogQ.data),
      }))
      .filter((section) => section.currentProducts.length > 0);
  }, [editableSectionIds, editableConfiguredFields, budgetContext, catalogQ.data]);

  useEffect(() => {
    if (!form) return;
    let next = form;
    let changed = false;

    for (const field of editableConfiguredFields) {
      const sectionId = Number(field?.budget_section_id || 0);
      const section = budgetContext?.budget_sections?.by_id?.[sectionId];
      const selectedProducts = Array.isArray(section?.selected_products) ? section.selected_products : [];
      const currentBinding = getByPath(next, `__budget_binding_products.${field.key}`);
      if (JSON.stringify(currentBinding || []) !== JSON.stringify(selectedProducts)) {
        next = setByPath(next, `__budget_binding_products.${field.key}`, selectedProducts);
        changed = true;
      }
      const currentSelected = getByPath(next, `__selected_binding_product.${field.key}`);
      if (!currentSelected?.product_id && selectedProducts[0]?.product_id) {
        next = setByPath(next, `__selected_binding_product.${field.key}`, selectedProducts[0]);
        next = setByPath(next, field.key, text(selectedProducts[0]?.alias || selectedProducts[0]?.display_name || selectedProducts[0]?.raw_name));
        next = setByPath(next, `__budget_section_override.${sectionId}.value`, text(selectedProducts[0]?.display_name || selectedProducts[0]?.alias || selectedProducts[0]?.raw_name));
        changed = true;
      }
    }

    for (const section of fallbackSections) {
      const currentBinding = getByPath(next, `__fallback_budget_binding_products.${section.id}`);
      if (JSON.stringify(currentBinding || []) !== JSON.stringify(section.currentProducts || [])) {
        next = setByPath(next, `__fallback_budget_binding_products.${section.id}`, section.currentProducts || []);
        changed = true;
      }
      const currentSelected = getByPath(next, `__fallback_selected_section_products.${section.id}`);
      if (!currentSelected?.product_id && section.currentProducts[0]?.product_id) {
        next = setByPath(next, `__fallback_selected_section_products.${section.id}`, section.currentProducts[0]);
        next = setByPath(next, `__budget_section_override.${section.id}.value`, text(section.currentProducts[0]?.display_name || section.currentProducts[0]?.alias || section.currentProducts[0]?.raw_name));
        changed = true;
      }
    }

    if (changed) setForm(next);
  }, [form, editableConfiguredFields, fallbackSections, budgetContext]);

  const baselineForm = useMemo(
    () => quote?.measurement_original_form || buildInitialForm(quote, quote?.measurement_form || {}),
    [quote],
  );

  const item18Changed = useMemo(() => {
    if (!form) return false;
    for (const field of editableConfiguredFields.filter((item) => Number(item?.budget_section_id || 0) === 18)) {
      const current = Number(getByPath(form, `__selected_binding_product.${field.key}.product_id`) || 0);
      const base = Number(getByPath(baselineForm, `__selected_binding_product.${field.key}.product_id`) || getByPath(form, `__budget_binding_products.${field.key}.0.product_id`) || 0);
      if (current && base && current !== base) return true;
    }
    const currentFallback = Number(getByPath(form, `__fallback_selected_section_products.18.product_id`) || 0);
    const baseFallback = Number(getByPath(baselineForm, `__fallback_selected_section_products.18.product_id`) || getByPath(form, `__fallback_budget_binding_products.18.0.product_id`) || 0);
    return !!(currentFallback && baseFallback && currentFallback !== baseFallback);
  }, [form, baselineForm, editableConfiguredFields]);


  function ensureTechnicalDimensionEditAllowed(axis) {
    if (!isTechnical) return true;
    const key = axis === "alto" ? "alto" : "ancho";
    if (technicalDimensionEditEnabled[key]) return true;
    const ok = window.confirm("¿Desea modificar el dato de alto y ancho finales?");
    if (ok) {
      setTechnicalDimensionEditEnabled((prev) => ({ ...prev, [key]: true }));
    }
    return ok;
  }

  const approveM = useMutation({
    mutationFn: async () => {
      await saveMeasurementDetailed(quoteId, {
        form,
        submit: false,
        returnToSeller: false,
        returnReason: "",
        endCustomer: quote?.end_customer || {},
        baselineForm,
      });
      return reviewMeasurement(quoteId, { action: "approve", notes: "" });
    },
    onSuccess: () => {
      setLastMessage("La planilla técnica fue aprobada y enviada a Odoo.");
      q.refetch();
    },
  });

  const saveM = useMutation({
    mutationFn: async ({ submit, returnToSeller = false, returnReason = "" }) => {
      let nextEndCustomer = { ...(quote?.end_customer || {}) };
      let shouldReturnToSeller = returnToSeller;
      let finalReason = returnReason;

      if (submit && isMedidor) {
        try {
          const pos = await getCurrentPositionAsync();
          const lat = pos?.coords?.latitude;
          const lng = pos?.coords?.longitude;
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            nextEndCustomer.maps_url = buildMapsUrl(lat, lng);
          }
        } catch {}
        if (item18Changed) {
          shouldReturnToSeller = true;
          finalReason = finalReason || DEFAULT_RETURN_REASON_ITEM_18;
        }
      }

      return saveMeasurementDetailed(quoteId, {
        form,
        submit: shouldReturnToSeller ? false : submit,
        returnToSeller: shouldReturnToSeller,
        returnReason: finalReason,
        endCustomer: nextEndCustomer,
        baselineForm,
      });
    },
    onSuccess: (response) => {
      if (response?.returned_to_seller) {
        setLastMessage("El portón fue devuelto al vendedor para rehacer el presupuesto.");
      } else {
        setLastMessage("Guardado.");
      }
      q.refetch();
    },
  });

  const rejectM = useMutation({
    mutationFn: async (notes) => {
      await saveMeasurementDetailed(quoteId, {
        form,
        submit: false,
        returnToSeller: false,
        returnReason: "",
        endCustomer: quote?.end_customer || {},
        baselineForm,
      });
      return reviewMeasurement(quoteId, { action: "reject", notes });
    },
    onSuccess: () => {
      setLastMessage("El portón fue devuelto al vendedor para rehacer el presupuesto.");
      q.refetch();
    },
  });

  if (q.isLoading) return <div className="container"><div className="card"><div className="muted">Cargando medición...</div></div></div>;
  if (q.isError) return <div className="container"><div className="card"><div style={{ color: "#d93025", fontSize: 13 }}>{q.error?.message || "No se pudo cargar la medición"}</div></div></div>;
  if (!quote || !form) return <div className="container"><div className="card"><div className="muted">Sin datos de medición.</div></div></div>;

  const returnPath = (typeof location.state?.from === "string" && location.state.from.trim()) || "/mediciones";

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Medición</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              Cliente: <b>{quote?.end_customer?.name || "—"}</b> · Estado: <b>{quote?.measurement_status || "pending"}</b>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="ghost" onClick={() => navigate(returnPath)}>Volver</Button>
            <Button variant="secondary" disabled={saveM.isPending || approveM.isPending || rejectM.isPending} onClick={() => saveM.mutate({ submit: false })}>
              {saveM.isPending ? "Guardando..." : isTechnical ? "Guardar cambios técnicos" : "Guardar"}
            </Button>

            {isTechnical ? (
              <>
                <Button disabled={approveM.isPending || saveM.isPending || rejectM.isPending} onClick={() => approveM.mutate()}>
                  {approveM.isPending ? "Aprobando..." : "Aprobar"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={rejectM.isPending || saveM.isPending || approveM.isPending}
                  onClick={() => {
                    const notes = window.prompt("Motivo de rechazo / devolución al vendedor:", "") || "";
                    if (!notes) return;
                    rejectM.mutate(notes);
                  }}
                >
                  {rejectM.isPending ? "Devolviendo..." : "Rechazar"}
                </Button>
              </>
            ) : (
              <Button disabled={saveM.isPending} onClick={() => saveM.mutate({ submit: true })}>
                {saveM.isPending ? "Procesando..." : item18Changed ? "Enviar al vendedor" : "Enviar al técnico"}
              </Button>
            )}
          </div>
        </div>

        <div className="spacer" />
        <Section title="Resumen del presupuesto">
          <Row>
            <Field label="Nota de venta"><div>{form.nota_venta || quote?.odoo_sale_order_name || quote?.quote_number || "—"}</div></Field>
            <Field label="Cliente"><div>{quote?.end_customer?.name || "—"}</div></Field>
            <Field label="Vendedor / Distribuidor"><div>{form.distribuidor || quote?.created_by_full_name || quote?.created_by_username || "—"}</div></Field>
          </Row>
          <div className="spacer" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {budgetSummaryItems.map((item) => (
              <div key={item.key} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                <b>{item.sectionName} · ID {item.sectionId}:</b> {item.value || "—"}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Datos del cliente">
          <Row>
            <Field label="Cliente"><div>{quote?.end_customer?.name || "—"}</div></Field>
            <Field label="Teléfono"><div>{quote?.end_customer?.phone || "—"}</div></Field>
            <Field label="Email"><div>{quote?.end_customer?.email || "—"}</div></Field>
          </Row>
          <div className="spacer" />
          <Row>
            <Field label="Dirección"><div>{customerFullAddress(quote?.end_customer) || "—"}</div></Field>
            <Field label="Google Maps">
              <div>
                {customerMapsHref(quote?.end_customer) ? (
                  <a href={customerMapsHref(quote?.end_customer)} target="_blank" rel="noreferrer">
                    Abrir ubicación del cliente
                  </a>
                ) : "—"}
              </div>
            </Field>
          </Row>
        </Section>

        <Section title="Esquema de medidas">
          <Row>
            <Field label="Alto final (mm)"><Input value={form.alto_final_mm || ""} onChange={(v) => { if (!ensureTechnicalDimensionEditAllowed("alto")) return; setForm((prev) => ({ ...prev, alto_final_mm: v })); }} style={{ width: "100%" }} /></Field>
            <Field label="Ancho final (mm)"><Input value={form.ancho_final_mm || ""} onChange={(v) => { if (!ensureTechnicalDimensionEditAllowed("ancho")) return; setForm((prev) => ({ ...prev, ancho_final_mm: v })); }} style={{ width: "100%" }} /></Field>
          </Row>
          <div className="spacer" />
          <Row>
            {[0, 1, 2].map((idx) => (
              <Field key={`alto-${idx}`} label={`Alto ${idx + 1} (mm)`}>
                <Input value={form.esquema?.alto?.[idx] || ""} onChange={(v) => setForm((prev) => updateSchemeValue(prev, "alto", idx, v))} style={{ width: "100%" }} />
              </Field>
            ))}
          </Row>
          <div className="spacer" />
          <Row>
            {[0, 1, 2].map((idx) => (
              <Field key={`ancho-${idx}`} label={`Ancho ${idx + 1} (mm)`}>
                <Input value={form.esquema?.ancho?.[idx] || ""} onChange={(v) => setForm((prev) => updateSchemeValue(prev, "ancho", idx, v))} style={{ width: "100%" }} />
              </Field>
            ))}
          </Row>
          <div className="spacer" />
          <div style={{ position: "relative", width: "100%", maxWidth: 780, margin: "0 auto" }}>
            <img src="/measurement_scheme.png" alt="Esquema de medición" style={{ width: "100%", height: "auto", display: "block" }} />
            {SCHEME_RECT_PCTS.alto.map((rect, idx) => (
              <div key={`overlay-alto-${idx}`} style={{ ...schemeOverlayBaseStyle, left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` }}>
                {form.esquema?.alto?.[idx] || ""}
              </div>
            ))}
            {SCHEME_RECT_PCTS.ancho.map((rect, idx) => (
              <div key={`overlay-ancho-${idx}`} style={{ ...schemeOverlayBaseStyle, left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` }}>
                {form.esquema?.ancho?.[idx] || ""}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Productos que puede cambiar el medidor">
          {editableConfiguredFields.map((field) => {
            const sectionId = Number(field?.budget_section_id || 0);
            const sectionName = text(field?.budget_section_name) || `Sección ${sectionId}`;
            const sectionCatalogProducts = firstCatalogProductsForSection(sectionId, catalogQ.data);
            const selectedProductId = String(getByPath(form, `__selected_binding_product.${field.key}.product_id`) || "");
            return (
              <div key={field.key} style={{ marginBottom: 12 }}>
                <Field label={`${sectionName} · ID ${sectionId}`}>
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      const product = sectionCatalogProducts.find((item) => String(item.id) === String(e.target.value));
                      setForm((prev) => {
                        let next = prev;
                        if (!product) return next;
                        next = setByPath(next, field.key, text(product.alias || product.display_name || product.name));
                        next = setByPath(next, `__selected_binding_product.${field.key}`, {
                          product_id: Number(product.id),
                          display_name: text(product.display_name || product.alias || product.name),
                          alias: text(product.alias),
                          raw_name: text(product.name),
                          code: text(product.code),
                          qty: 1,
                        });
                        next = setByPath(next, `__budget_section_override.${sectionId}.value`, text(product.display_name || product.alias || product.name));
                        return next;
                      });
                    }}
                    disabled={isTechnical}
                    style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    <option value="">Seleccione producto…</option>
                    {sectionCatalogProducts.map((product) => (
                      <option key={product.id} value={product.id}>{productDisplayLabel(product)}</option>
                    ))}
                  </select>
                </Field>
              </div>
            );
          })}

          {fallbackSections.map((section) => {
            const selectedProductId = String(getByPath(form, `__fallback_selected_section_products.${section.id}.product_id`) || "");
            return (
              <div key={`fallback-${section.id}`} style={{ marginBottom: 12 }}>
                <Field label={`${section.name} · ID ${section.id}`}>
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      const product = section.catalogProducts.find((item) => String(item.id) === String(e.target.value));
                      setForm((prev) => {
                        let next = prev;
                        if (!product) return next;
                        next = setByPath(next, `__fallback_selected_section_products.${section.id}`, {
                          product_id: Number(product.id),
                          display_name: text(product.display_name || product.alias || product.name),
                          alias: text(product.alias),
                          raw_name: text(product.name),
                          code: text(product.code),
                          qty: 1,
                        });
                        next = setByPath(next, `__budget_section_override.${section.id}.value`, text(product.display_name || product.alias || product.name));
                        return next;
                      });
                    }}
                    disabled={isTechnical}
                    style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    <option value="">Seleccione producto…</option>
                    {section.catalogProducts.map((product) => (
                      <option key={product.id} value={product.id}>{productDisplayLabel(product)}</option>
                    ))}
                  </select>
                </Field>
              </div>
            );
          })}

          {!editableConfiguredFields.length && !fallbackSections.length ? (
            <div className="muted">No se encontraron productos editables para las secciones 18, 23 y 39 o 40.</div>
          ) : null}

          {item18Changed ? (
            <div
              style={{
                marginTop: 14,
                border: "2px solid #b71c1c",
                background: "#ffebee",
                color: "#7f0000",
                borderRadius: 12,
                padding: 14,
                boxShadow: "0 0 0 2px rgba(183,28,28,0.08)",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 6 }}>ATENCIÓN: CAMBIO CON COSTOS ADICIONALES</div>
              <div style={{ fontWeight: 700, lineHeight: 1.45 }}>
                Cambiaste un producto de la sección 18. Este cambio puede ocasionar costos adicionales.
                No lo envíes a técnica: debe enviarse al vendedor para revisión y actualización del presupuesto.
              </div>
            </div>
          ) : null}
        </Section>

        {saveM.isError ? (<><div className="spacer" /><div style={{ color: "#d93025", fontSize: 13 }}>{saveM.error?.message || "No se pudo guardar la medición"}</div></>) : null}
        {lastMessage ? (<><div className="spacer" /><div className="muted">{lastMessage}</div></>) : null}
      </div>
    </div>
  );
}
