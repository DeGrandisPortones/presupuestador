import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../domain/auth/store.js";
import { PORTON_TYPES } from "../../domain/quote/portonConstants.js";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

import {
  adminGetCatalog,
  adminCreateSection,
  adminDeleteSection,
  adminSetTagSection,
  adminSetProductAlias,
  adminSetTypeSections,
  adminRefreshCatalog,
  adminGetQuotes,
  adminGetFinalSettings,
  adminSaveFinalSettings,
} from "../../api/admin.js";

function norm(x) {
  return (x || "").toString().trim().toLowerCase();
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [tab, setTab] = useState("tags");
  const [catalogKind, setCatalogKind] = useState("porton");

  const catalogQ = useQuery({
    queryKey: ["adminCatalog", catalogKind],
    queryFn: () => adminGetCatalog(catalogKind),
    enabled: !!user?.is_enc_comercial,
  });

  const quotesQ = useQuery({
    queryKey: ["adminQuotes", catalogKind],
    queryFn: () => adminGetQuotes(catalogKind, 200),
    enabled: !!user?.is_enc_comercial && tab === "data",
  });

  const finalSettingsQ = useQuery({
    queryKey: ["adminFinalSettings"],
    queryFn: adminGetFinalSettings,
    enabled: !!user?.is_enc_comercial,
  });

  const [tolerancePercent, setTolerancePercent] = useState("0");
  const [savingTolerance, setSavingTolerance] = useState(false);

  useEffect(() => {
    if (!finalSettingsQ.data) return;
    setTolerancePercent(String(finalSettingsQ.data.tolerance_percent ?? 0));
  }, [finalSettingsQ.data]);

  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionPos, setNewSectionPos] = useState("100");
  const [productQuery, setProductQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");

  const catalog = catalogQ.data;
  const sections = Array.isArray(catalog?.sections) ? catalog.sections : [];
  const tags = Array.isArray(catalog?.tags) ? catalog.tags : [];
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const typeSections = catalog?.type_sections || {};

  const productById = useMemo(() => new Map(products.map((p) => [Number(p.id), p])), [products]);
  const tagById = useMemo(() => new Map(tags.map((t) => [Number(t.id), t])), [tags]);

  const filteredProductsByQuery = useMemo(() => {
    const q = norm(productQuery);
    if (!q) return products;
    return products.filter((p) => {
      const dn = norm(p.display_name || p.name);
      const raw = norm(p.name);
      const code = norm(p.code);
      return dn.includes(q) || raw.includes(q) || code.includes(q);
    });
  }, [products, productQuery]);

  const computedQuotes = useMemo(() => {
    const arr = Array.isArray(quotesQ.data) ? quotesQ.data : [];
    return arr.map((q) => {
      const lines = Array.isArray(q.lines) ? q.lines : [];
      const pids = [...new Set(lines.map((l) => Number(l.product_id)).filter(Boolean))];
      const tagIds = [...new Set(pids.flatMap((pid) => productById.get(pid)?.tag_ids || []))];
      const tagNames = tagIds.map((tid) => tagById.get(tid)?.name).filter(Boolean);
      return { ...q, tag_ids: tagIds, tags: tagNames };
    });
  }, [quotesQ.data, productById, tagById]);

  const filteredQuotes = useMemo(() => {
    let arr = computedQuotes;
    if (sectionFilter !== "all") {
      const sid = Number(sectionFilter);
      arr = arr.filter((q) => Array.isArray(q.section_ids) && q.section_ids.includes(sid));
    }
    if (tagFilter !== "all") {
      const tid = Number(tagFilter);
      arr = arr.filter((q) => Array.isArray(q.tag_ids) && q.tag_ids.includes(tid));
    }
    return arr;
  }, [computedQuotes, sectionFilter, tagFilter]);

  const filteredProductsForData = useMemo(() => {
    let arr = products;
    if (sectionFilter !== "all") {
      const sid = Number(sectionFilter);
      arr = arr.filter((p) => Array.isArray(p.section_ids) && p.section_ids.includes(sid));
    }
    if (tagFilter !== "all") {
      const tid = Number(tagFilter);
      arr = arr.filter((p) => Array.isArray(p.tag_ids) && p.tag_ids.includes(tid));
    }
    return arr;
  }, [products, sectionFilter, tagFilter]);

  if (!user?.is_enc_comercial) {
    return (
      <div className="container">
        <div className="spacer" />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Dashboard</h2>
          <div className="muted">No tenés permisos (solo Encargado Comercial).</div>
        </div>
      </div>
    );
  }

  const onRefresh = async () => {
    await adminRefreshCatalog();
    qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] });
  };

  const onCreateSection = async () => {
    await adminCreateSection(catalogKind, { name: newSectionName, position: Number(newSectionPos || 100) });
    setNewSectionName("");
    qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] });
  };

  const onSaveTolerance = async () => {
    setSavingTolerance(true);
    try {
      const saved = await adminSaveFinalSettings({ tolerance_percent: tolerancePercent });
      setTolerancePercent(String(saved.tolerance_percent ?? 0));
      qc.invalidateQueries({ queryKey: ["adminFinalSettings"] });
    } finally {
      setSavingTolerance(false);
    }
  };

  return (
    <div className="container">
      <div className="spacer" />

      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Dashboard del Presupuestador</h2>
          <div className="muted">Secciones por etiqueta + alias visibles + data</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={catalogKind === "porton" ? "primary" : "ghost"} onClick={() => setCatalogKind("porton")}>Portones</Button>
          <Button variant={catalogKind === "ipanel" ? "primary" : "ghost"} onClick={() => setCatalogKind("ipanel")}>Ipanel</Button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="ghost" onClick={onRefresh} disabled={catalogQ.isLoading}>Refrescar catálogo</Button>
        </div>
      </div>

      <div className="spacer" />

      <div className="card" style={{ background: "#fafafa" }}>
        <h3 style={{ marginTop: 0 }}>Tolerancia comercial para cotización final</h3>
        <div className="muted" style={{ marginBottom: 10 }}>
          Si la diferencia entre el presupuesto detallado final y la seña ya enviada es menor o igual a este porcentaje,
          el sistema descuenta lo necesario para que la nueva cotización en Odoo quede en <b>$0</b>.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 220 }}>
            <div className="muted">Tolerancia %</div>
            <Input value={tolerancePercent} onChange={setTolerancePercent} placeholder="0" style={{ width: "100%" }} />
          </div>
          <Button variant="primary" onClick={onSaveTolerance} disabled={savingTolerance || finalSettingsQ.isLoading}>
            {savingTolerance ? "Guardando..." : "Guardar tolerancia"}
          </Button>
          {finalSettingsQ.isError ? <div style={{ color: "#d93025" }}>{finalSettingsQ.error.message}</div> : null}
        </div>
      </div>

      <div className="spacer" />

      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className={tab === "tags" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("tags")}>Etiquetas → Secciones</button>
        <button className={tab === "aliases" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("aliases")}>Alias de productos</button>
        <button className={tab === "types" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("types")}>Tipos → Secciones</button>
        <button className={tab === "data" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("data")}>Data</button>
      </div>

      <div className="spacer" />
      {catalogQ.isLoading && <div className="muted">Cargando…</div>}
      {catalogQ.isError && <div style={{ color: "#d93025" }}>{catalogQ.error.message}</div>}

      {!catalogQ.isLoading && !catalogQ.isError && (
        <>
          {tab === "tags" && (
            <div className="row">
              <div className="card" style={{ flex: 1, minWidth: 320 }}>
                <h3 style={{ marginTop: 0 }}>Secciones</h3>
                <div className="muted">Ordená por <b>posición</b> (menor = más arriba)</div>
                <div className="spacer" />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Input value={newSectionName} onChange={setNewSectionName} placeholder="Nueva sección…" style={{ flex: 1, minWidth: 180 }} />
                  <Input value={newSectionPos} onChange={setNewSectionPos} placeholder="Posición" style={{ width: 110 }} />
                  <Button variant="primary" disabled={!newSectionName.trim()} onClick={onCreateSection}>Crear</Button>
                </div>
                <div className="spacer" />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sections.map((s) => (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, border: "1px solid #eee", padding: 10, borderRadius: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800 }}>{s.name}</div>
                        <div className="muted">Posición: {s.position}</div>
                      </div>
                      <Button variant="ghost" onClick={async () => {
                        if (!confirm(`Borrar sección "${s.name}"?`)) return;
                        await adminDeleteSection(catalogKind, s.id);
                        qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] });
                      }}>🗑</Button>
                    </div>
                  ))}
                  {!sections.length && <div className="muted">Todavía no hay secciones.</div>}
                </div>
              </div>

              <div className="card" style={{ flex: 2, minWidth: 520 }}>
                <h3 style={{ marginTop: 0 }}>Asignar sección por etiqueta</h3>
                <div className="muted">Ej: <b>Motor</b> → <b>Automatización</b>. Un producto puede aparecer en varias secciones si tiene varios tags.</div>
                <div className="spacer" />
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 560, overflow: "auto", paddingRight: 6 }}>
                  {tags.map((t) => (
                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, border: "1px solid #eee", padding: 10, borderRadius: 10, alignItems: "center" }}>
                      <div style={{ fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                      <select
                        value={t.section_id || ""}
                        onChange={async (e) => {
                          const v = e.target.value ? Number(e.target.value) : null;
                          await adminSetTagSection(catalogKind, t.id, v);
                          qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] });
                        }}
                        style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", minWidth: 220 }}
                      >
                        <option value="">(sin sección)</option>
                        {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  ))}
                  {!tags.length && <div className="muted">No hay etiquetas en Odoo (o no hay productos taggeados).</div>}
                </div>
              </div>
            </div>
          )}

          {tab === "aliases" && (
            <div className="row">
              <div className="card" style={{ flex: 1, minWidth: 320 }}>
                <h3 style={{ marginTop: 0 }}>Alias visibles</h3>
                <div className="muted">Esto <b>no cambia Odoo</b>: sólo cambia lo que ve el usuario en el cotizador.</div>
                <div className="spacer" />
                <Input value={productQuery} onChange={setProductQuery} placeholder="Buscar producto…" style={{ width: "100%" }} />
                <div className="spacer" />
                <div className="muted">Resultados: {filteredProductsByQuery.length}</div>
              </div>

              <div className="card" style={{ flex: 2, minWidth: 520 }}>
                <h3 style={{ marginTop: 0 }}>Productos</h3>
                <div className="spacer" />
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 620, overflow: "auto", paddingRight: 6 }}>
                  {filteredProductsByQuery.slice(0, 400).map((p) => (
                    <AliasRow key={p.id} product={p} onSave={async (alias) => {
                      await adminSetProductAlias(catalogKind, p.id, alias);
                      qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] });
                    }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "types" && (
            <div className="row">
              <TypesSectionsCard
                catalogKind={catalogKind}
                sections={sections}
                typeSections={typeSections}
                onSave={async (typeKey, sectionIds) => {
                  await adminSetTypeSections(catalogKind, typeKey, sectionIds);
                  qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] });
                }}
              />
            </div>
          )}

          {tab === "data" && (
            <div className="row">
              <div className="card" style={{ flex: 1, minWidth: 320 }}>
                <h3 style={{ marginTop: 0 }}>Filtros</h3>
                <div className="muted">Sección</div>
                <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}>
                  <option value="all">(todas)</option>
                  {sections.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
                <div className="spacer" />
                <div className="muted">Etiqueta</div>
                <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}>
                  <option value="all">(todas)</option>
                  {tags.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                </select>
                <div className="spacer" />
                <Button onClick={() => qc.invalidateQueries({ queryKey: ["adminQuotes", catalogKind] })} disabled={quotesQ.isLoading}>
                  {quotesQ.isLoading ? "Cargando…" : "Refrescar"}
                </Button>
                <div className="spacer" />
                <div className="muted">Cotizaciones: <b>{filteredQuotes.length}</b></div>
                <div className="muted">Productos (catálogo): <b>{filteredProductsForData.length}</b></div>
              </div>

              <div style={{ flex: 2, minWidth: 520, display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="card">
                  <h3 style={{ marginTop: 0 }}>Últimas cotizaciones</h3>
                  {quotesQ.isError && <div style={{ color: "#d93025" }}>{quotesQ.error.message}</div>}
                  <div className="spacer" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto", paddingRight: 6 }}>
                    {filteredQuotes.map((q) => (
                      <div key={q.id} style={{ border: "1px solid #eee", padding: 10, borderRadius: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontWeight: 800 }}>#{String(q.id).slice(0, 8)}</div>
                          <div className="muted">{q.final_status || q.status}</div>
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>{q.created_at ? new Date(q.created_at).toLocaleString() : ""} · {q.created_by_role}</div>
                        {q.final_sale_order_name ? <div className="muted" style={{ marginTop: 6 }}>Odoo final: <b>{q.final_sale_order_name}</b></div> : null}
                        {typeof q.final_difference_amount === "number" ? <div className="muted" style={{ marginTop: 6 }}>Diferencia final: <b>${q.final_difference_amount.toFixed(2)}</b>{q.final_absorbed_by_company ? " · absorbida" : ""}</div> : null}
                        {!!(q.tags || []).length && <div className="muted" style={{ marginTop: 6 }}>Tags: {(q.tags || []).slice(0, 12).join(", ")}{(q.tags || []).length > 12 ? "…" : ""}</div>}
                      </div>
                    ))}
                    {!filteredQuotes.length && <div className="muted">Sin resultados.</div>}
                  </div>
                </div>

                <div className="card">
                  <h3 style={{ marginTop: 0 }}>Productos del catálogo</h3>
                  <div className="muted" style={{ marginBottom: 10 }}>
                    Esto es para validar el mapeo <b>Etiqueta → Sección</b>.
                  </div>
                  <div className="muted">Mostrando: <b>{filteredProductsForData.length}</b></div>
                  <div className="spacer" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto", paddingRight: 6 }}>
                    {filteredProductsForData.map((p) => (
                      <div key={p.id} style={{ border: "1px solid #eee", padding: 10, borderRadius: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                          <div style={{ fontWeight: 800, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.display_name || p.name}</div>
                          <div className="muted" style={{ whiteSpace: "nowrap" }}>{typeof p.price === "number" ? `$${p.price.toFixed(2)}` : ""}</div>
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>ID: {p.id}{p.code ? ` · ${p.code}` : ""}{p.alias ? ` · alias: ${p.alias}` : ""}</div>
                      </div>
                    ))}
                    {!filteredProductsForData.length && <div className="muted">Sin resultados.</div>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TypesSectionsCard({ catalogKind, sections, typeSections, onSave }) {
  const [selectedType, setSelectedType] = useState(PORTON_TYPES?.[0]?.key || "");
  const [selectedSectionIds, setSelectedSectionIds] = useState([]);
  const canUse = (catalogKind || "porton") === "porton";

  useEffect(() => {
    const arr = canUse && selectedType ? (typeSections?.[selectedType] || []) : [];
    setSelectedSectionIds((arr || []).map((x) => Number(x)));
  }, [selectedType, catalogKind, canUse, typeSections]);

  if (!canUse) {
    return <div className="card" style={{ flex: 1 }}><h3 style={{ marginTop: 0 }}>Tipos → Secciones</h3><div className="muted">Esto aplica solo a Portones (I-PANEL va aparte).</div></div>;
  }

  const sectionSet = new Set(selectedSectionIds.map((x) => Number(x)));
  return (
    <>
      <div className="card" style={{ flex: 1, minWidth: 320 }}>
        <h3 style={{ marginTop: 0 }}>Tipos / Sistemas</h3>
        <div className="muted">Seleccioná un tipo y marcá qué secciones deben aparecer.</div>
        <div className="spacer" />
        <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}>
          {PORTON_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <div className="spacer" />
        <Button variant="primary" onClick={async () => onSave(selectedType, selectedSectionIds)}>Guardar asignación</Button>
      </div>

      <div className="card" style={{ flex: 2, minWidth: 520 }}>
        <h3 style={{ marginTop: 0 }}>Secciones visibles</h3>
        <div className="spacer" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 620, overflow: "auto", paddingRight: 6 }}>
          {sections.map((s) => {
            const sid = Number(s.id);
            const checked = sectionSet.has(sid);
            return (
              <label key={sid} style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid #eee", padding: 10, borderRadius: 10 }}>
                <input type="checkbox" checked={checked} onChange={(e) => {
                  const next = new Set(sectionSet);
                  if (e.target.checked) next.add(sid); else next.delete(sid);
                  setSelectedSectionIds([...next]);
                }} />
                <div style={{ fontWeight: 700 }}>{s.name}</div>
                <div className="muted" style={{ marginLeft: "auto" }}>Pos: {s.position}</div>
              </label>
            );
          })}
        </div>
      </div>
    </>
  );
}

function AliasRow({ product, onSave }) {
  const [value, setValue] = useState(product.alias || "");
  const [saving, setSaving] = useState(false);
  const changed = value.trim() !== (product.alias || "");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 260px 90px", gap: 10, border: "1px solid #eee", padding: 10, borderRadius: 10, alignItems: "center" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.name}</div>
        <div className="muted" style={{ fontSize: 12 }}>ID: {product.id}{product.code ? ` · ${product.code}` : ""}</div>
      </div>
      <Input value={value} onChange={setValue} placeholder="Nombre visible…" style={{ width: "100%" }} />
      <Button variant="primary" disabled={!changed || saving} onClick={async () => {
        setSaving(true);
        try { await onSave(value); } finally { setSaving(false); }
      }}>{saving ? "…" : "Guardar"}</Button>
    </div>
  );
}
