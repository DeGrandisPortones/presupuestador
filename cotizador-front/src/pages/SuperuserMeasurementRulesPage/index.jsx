import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { adminGetCatalog, adminGetTechnicalMeasurementRules, adminSaveTechnicalMeasurementRules } from "../../api/admin.js";
import { TECHNICAL_MEASUREMENT_FIELD_OPTIONS, TECHNICAL_RULE_OPERATORS } from "../../domain/measurement/technicalMeasurementRuleFields.js";

function emptyRule(index = 1) {
  return {
    id: `rule_${Date.now()}_${index}`,
    name: "",
    active: true,
    source_key: "",
    operator: "=",
    compare_value: "",
    target_type: "form",
    target_field: "",
    target_value: "",
    apply_to_odoo: false,
    product_id: "",
    product_label: "",
    sort_order: index,
  };
}
function productLabel(product) {
  return `${product.display_name || product.name}${product.code ? ` · ${product.code}` : ""}`;
}

export default function SuperuserMeasurementRulesPage() {
  const user = useAuthStore((s) => s.user);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ rules: [] });
  const rulesQ = useQuery({ queryKey: ["technicalMeasurementRules"], queryFn: adminGetTechnicalMeasurementRules, enabled: !!user?.is_superuser });
  const catalogQ = useQuery({ queryKey: ["adminCatalogRulesProducts"], queryFn: () => adminGetCatalog("porton"), enabled: !!user?.is_superuser });

  useEffect(() => {
    if (rulesQ.data) setDraft(rulesQ.data);
  }, [rulesQ.data]);

  const products = Array.isArray(catalogQ.data?.products) ? catalogQ.data.products : [];
  const targetFieldOptions = TECHNICAL_MEASUREMENT_FIELD_OPTIONS.filter((item) => !["surface_m2", "budget_width_m", "budget_height_m"].includes(item.key));
  const rules = Array.isArray(draft?.rules) ? draft.rules : [];

  if (!user?.is_superuser) {
    return <div className="container"><div className="card"><h2 style={{ marginTop: 0 }}>Reglas técnicas</h2><div className="muted">Solo disponible para superusuario.</div></div></div>;
  }

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Dashboard exclusivo de reglas técnicas</h2>
        <div className="muted">Configurá reglas sobre todos los campos técnicos. Cada regla puede completar la planilla, pegar a Odoo o ambas cosas.</div>
        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => setDraft((prev) => ({ rules: [...(prev.rules || []), emptyRule((prev.rules || []).length + 1)] }))}>+ Agregar regla</Button>
          <Button variant="primary" disabled={saving} onClick={async () => {
            setSaving(true);
            try {
              const payload = { rules: rules.map((rule, index) => ({ ...rule, sort_order: index + 1 })) };
              const saved = await adminSaveTechnicalMeasurementRules(payload);
              setDraft(saved);
              window.alert("Reglas guardadas.");
            } finally {
              setSaving(false);
            }
          }}>{saving ? "Guardando..." : "Guardar reglas"}</Button>
        </div>
      </div>

      <div className="spacer" />
      <div className="card">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {rules.map((rule, index) => (
            <div key={rule.id || index} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <div style={{ fontWeight: 800 }}>Regla #{index + 1}</div>
                <Button variant="ghost" onClick={() => setDraft((prev) => ({ rules: (prev.rules || []).filter((_, i) => i !== index) }))}>✕</Button>
              </div>
              <div className="spacer" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>Nombre</div>
                  <Input value={rule.name || ""} onChange={(v) => setDraft((prev) => {
                    const next = [...(prev.rules || [])];
                    next[index] = { ...next[index], name: v };
                    return { rules: next };
                  })} style={{ width: "100%" }} />
                </div>
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>Campo origen</div>
                  <select value={rule.source_key || ""} onChange={(e) => setDraft((prev) => {
                    const next = [...(prev.rules || [])];
                    next[index] = { ...next[index], source_key: e.target.value };
                    return { rules: next };
                  })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                    <option value="">Seleccione campo…</option>
                    {TECHNICAL_MEASUREMENT_FIELD_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                </div>
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>Operador</div>
                  <select value={rule.operator || "="} onChange={(e) => setDraft((prev) => {
                    const next = [...(prev.rules || [])];
                    next[index] = { ...next[index], operator: e.target.value };
                    return { rules: next };
                  })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                    {TECHNICAL_RULE_OPERATORS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>Comparar contra</div>
                  <Input value={rule.compare_value ?? ""} onChange={(v) => setDraft((prev) => {
                    const next = [...(prev.rules || [])];
                    next[index] = { ...next[index], compare_value: v };
                    return { rules: next };
                  })} style={{ width: "100%" }} />
                </div>
              </div>

              <div className="spacer" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>Aplicación</div>
                  <select value={rule.target_type || "form"} onChange={(e) => setDraft((prev) => {
                    const next = [...(prev.rules || [])];
                    next[index] = { ...next[index], target_type: e.target.value };
                    return { rules: next };
                  })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                    <option value="form">Solo planilla</option>
                    <option value="odoo">Solo Odoo</option>
                    <option value="both">Planilla y Odoo</option>
                  </select>
                </div>
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>Campo destino</div>
                  <select value={rule.target_field || ""} onChange={(e) => setDraft((prev) => {
                    const next = [...(prev.rules || [])];
                    next[index] = { ...next[index], target_field: e.target.value };
                    return { rules: next };
                  })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                    <option value="">(sin completar campo)</option>
                    {targetFieldOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                </div>
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>Valor destino</div>
                  <Input value={rule.target_value ?? ""} onChange={(v) => setDraft((prev) => {
                    const next = [...(prev.rules || [])];
                    next[index] = { ...next[index], target_value: v };
                    return { rules: next };
                  })} style={{ width: "100%" }} />
                </div>
              </div>

              <div className="spacer" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <div>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={rule.apply_to_odoo === true} onChange={(e) => setDraft((prev) => {
                      const next = [...(prev.rules || [])];
                      next[index] = { ...next[index], apply_to_odoo: e.target.checked };
                      return { rules: next };
                    })} />
                    <span className="muted">Pegarlo a Odoo</span>
                  </label>
                </div>
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>Producto Odoo</div>
                  <select value={rule.product_id || ""} onChange={(e) => setDraft((prev) => {
                    const next = [...(prev.rules || [])];
                    const product = products.find((item) => Number(item.id) === Number(e.target.value));
                    next[index] = { ...next[index], product_id: e.target.value ? Number(e.target.value) : "", product_label: product ? productLabel(product) : "" };
                    return { rules: next };
                  })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                    <option value="">(sin producto)</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{productLabel(product)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={rule.active !== false} onChange={(e) => setDraft((prev) => {
                      const next = [...(prev.rules || [])];
                      next[index] = { ...next[index], active: e.target.checked };
                      return { rules: next };
                    })} />
                    <span className="muted">Regla activa</span>
                  </label>
                </div>
              </div>
            </div>
          ))}
          {!rules.length && <div className="muted">Todavía no hay reglas técnicas configuradas.</div>}
        </div>
      </div>
    </div>
  );
}
