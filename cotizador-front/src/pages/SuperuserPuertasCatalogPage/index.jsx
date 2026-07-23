import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import {
  adminCreateSection,
  adminDeleteSection,
  adminGetCatalog,
  adminGetProductPdfNames,
  adminRefreshCatalog,
  adminSetProductAlias,
  adminSetProductPdfName,
  adminSetProductVisibility,
  adminSetTagSection,
  adminUpdateSection,
} from "../../api/admin.js";

const KIND = "puerta";

function norm(value) {
  return String(value || "").trim().toLowerCase();
}
function productSearchText(product = {}) {
  return [
    product?.id,
    product?.odoo_id,
    product?.odoo_template_id,
    product?.odoo_variant_id,
    product?.code,
    product?.name,
    product?.display_name,
    product?.alias,
    product?.internal_alias,
    product?.client_display_name,
    product?.raw_name,
    ...(Array.isArray(product?.tags) ? product.tags : []),
    ...(Array.isArray(product?.sections) ? product.sections : []),
  ].join(" ").toLowerCase();
}
function pdfSearchText(item = {}) {
  return [item.product_id, item.odoo_id, item.odoo_name, item.presupuestador_name, item.alias, item.pdf_name].join(" ").toLowerCase();
}
function productLabel(product = {}) {
  return product.display_name || product.alias || product.internal_alias || product.name || `Producto ${product.id}`;
}
function odooLabel(product = {}) {
  return product.client_display_name || product.raw_name || product.original_name || product.name || "—";
}
function visibilityFromProduct(product = {}) {
  if (product.disable_for_vendedor && product.disable_for_distribuidor) return "both";
  if (product.disable_for_vendedor) return "vendedor";
  if (product.disable_for_distribuidor) return "distribuidor";
  return "none";
}
function visibilityPayload(mode) {
  const value = String(mode || "none");
  return {
    disable_for_vendedor: value === "vendedor" || value === "both",
    disable_for_distribuidor: value === "distribuidor" || value === "both",
  };
}
function SectionTitle({ title, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {children}
    </div>
  );
}

export default function SuperuserPuertasCatalogPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [tab, setTab] = useState("tags");
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionUseSurface, setNewSectionUseSurface] = useState(true);
  const [productQuery, setProductQuery] = useState("");
  const [pdfQuery, setPdfQuery] = useState("");
  const [pdfDrafts, setPdfDrafts] = useState({});

  const catalogQ = useQuery({
    queryKey: ["adminCatalog", KIND],
    queryFn: () => adminGetCatalog(KIND),
    enabled: !!user?.is_superuser,
  });

  const pdfNamesQ = useQuery({
    queryKey: ["adminProductPdfNames", KIND],
    queryFn: () => adminGetProductPdfNames(KIND),
    enabled: !!user?.is_superuser && tab === "pdf",
  });

  const sections = Array.isArray(catalogQ.data?.sections) ? catalogQ.data.sections : [];
  const tags = Array.isArray(catalogQ.data?.tags) ? catalogQ.data.tags : [];
  const products = Array.isArray(catalogQ.data?.products) ? catalogQ.data.products : [];

  useEffect(() => {
    const next = {};
    for (const item of (pdfNamesQ.data || [])) next[String(item.product_id)] = String(item.pdf_name || "");
    setPdfDrafts(next);
  }, [pdfNamesQ.data]);

  const sortedTags = useMemo(() => {
    return [...tags].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" }));
  }, [tags]);

  const filteredProducts = useMemo(() => {
    const needle = norm(productQuery);
    if (!needle) return products;
    return products.filter((product) => productSearchText(product).includes(needle));
  }, [products, productQuery]);

  const filteredPdfItems = useMemo(() => {
    const source = Array.isArray(pdfNamesQ.data) ? pdfNamesQ.data : [];
    const needle = norm(pdfQuery);
    if (!needle) return source;
    return source.filter((item) => pdfSearchText(item).includes(needle));
  }, [pdfNamesQ.data, pdfQuery]);

  const refreshM = useMutation({
    mutationFn: async () => {
      await adminRefreshCatalog(KIND);
      await qc.invalidateQueries({ queryKey: ["adminCatalog", KIND] });
      await qc.invalidateQueries({ queryKey: ["adminProductPdfNames", KIND] });
    },
    onSuccess: () => toast.success("Catálogo de puertas actualizado."),
    onError: (e) => toast.error(e?.message || "No se pudo actualizar el catálogo"),
  });

  const createSectionM = useMutation({
    mutationFn: async () => adminCreateSection(KIND, {
      name: newSectionName,
      position: sections.length + 1,
      use_surface_qty: newSectionUseSurface,
    }),
    onSuccess: async () => {
      setNewSectionName("");
      setNewSectionUseSurface(true);
      await qc.invalidateQueries({ queryKey: ["adminCatalog", KIND] });
      toast.success("Sección de puertas creada.");
    },
    onError: (e) => toast.error(e?.message || "No se pudo crear la sección"),
  });

  const savePdfM = useMutation({
    mutationFn: async ({ productId, pdfName }) => adminSetProductPdfName(KIND, productId, pdfName),
    onSuccess: async (_saved, variables) => {
      await qc.invalidateQueries({ queryKey: ["adminProductPdfNames", KIND] });
      toast.success(`Nombre PDF guardado para producto ${variables.productId}`);
    },
    onError: (e) => toast.error(e?.message || "No se pudo guardar el nombre PDF"),
  });

  if (!user?.is_superuser) {
    return (
      <div className="container">
        <div className="spacer" />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Catálogo Puertas</h2>
          <div className="muted">No tenés permisos. Esta pantalla es solo para superusuario.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: "100%", width: "100%" }}>
      <div className="spacer" />
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Dashboard · Catálogo Puertas</h2>
          <div className="muted" style={{ marginTop: 6 }}>
            Configurá el catálogo del presupuestador de puertas usando secciones, etiquetas y productos de Odoo.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => refreshM.mutate()} disabled={refreshM.isPending || catalogQ.isFetching}>
            {refreshM.isPending || catalogQ.isFetching ? "Actualizando..." : "Generar / refrescar catálogo"}
          </Button>
        </div>
      </div>

      <div className="spacer" />
      <div className="card" style={{ background: "#f8fafc", border: "1px solid #dbeafe" }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Cómo se arma el catálogo de puertas</div>
        <div className="muted">
          Primero creá secciones. Después asigná las etiquetas de Odoo a esas secciones. Todo producto que tenga una etiqueta asignada queda disponible en el Presupuestador Puertas. Si la sección tiene <b>Cantidad = superficie</b>, el producto se calcula por ancho × alto de la puerta.
        </div>
      </div>

      <div className="spacer" />
      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className={tab === "tags" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("tags")}>Secciones y etiquetas</button>
        <button className={tab === "products" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("products")}>Alias y visibilidad</button>
        <button className={tab === "pdf" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("pdf")}>Nombres PDF</button>
        <button className={tab === "preview" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("preview")}>Vista previa</button>
      </div>

      <div className="spacer" />
      {catalogQ.isLoading ? <div className="card"><div className="muted">Cargando catálogo...</div></div> : null}
      {catalogQ.isError ? <div className="card"><div style={{ color: "#d93025" }}>{catalogQ.error.message}</div></div> : null}

      {!catalogQ.isLoading && !catalogQ.isError && tab === "tags" ? (
        <div className="row">
          <div className="card" style={{ flex: 1, minWidth: 340 }}>
            <SectionTitle title="Secciones de Puertas" />
            <div className="spacer" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Input value={newSectionName} onChange={setNewSectionName} placeholder="Nueva sección..." style={{ flex: 1, minWidth: 180 }} />
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={newSectionUseSurface} onChange={(e) => setNewSectionUseSurface(e.target.checked)} />
                <span className="muted">Cantidad = superficie</span>
              </label>
              <Button variant="primary" disabled={!newSectionName.trim() || createSectionM.isPending} onClick={() => createSectionM.mutate()}>
                Crear
              </Button>
            </div>
            <div className="spacer" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sections.map((section) => (
                <EditableSectionRow key={section.id} section={section} qc={qc} />
              ))}
              {!sections.length ? <div className="muted">Todavía no hay secciones de puertas.</div> : null}
            </div>
          </div>

          <div className="card" style={{ flex: 2, minWidth: 520 }}>
            <SectionTitle title="Etiquetas de Odoo → Sección Puertas" />
            <div className="spacer" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sortedTags.map((tag) => (
                <div key={tag.id} style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 10, alignItems: "center", border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{tag.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>ID etiqueta Odoo: {tag.id}</div>
                  </div>
                  <select
                    value={tag.section_id || ""}
                    onChange={async (e) => {
                      const value = e.target.value ? Number(e.target.value) : null;
                      try {
                        await adminSetTagSection(KIND, tag.id, value);
                        await qc.invalidateQueries({ queryKey: ["adminCatalog", KIND] });
                        await qc.invalidateQueries({ queryKey: ["adminProductPdfNames", KIND] });
                        toast.success("Etiqueta actualizada.");
                      } catch (err) {
                        toast.error(err?.message || "No se pudo asignar la etiqueta");
                      }
                    }}
                    style={{ padding: 9, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}
                  >
                    <option value="">(no usar en puertas)</option>
                    {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {!catalogQ.isLoading && !catalogQ.isError && tab === "products" ? (
        <div className="card">
          <SectionTitle title="Alias y visibilidad de productos Puertas">
            <div className="muted">{filteredProducts.length} producto(s)</div>
          </SectionTitle>
          <div className="spacer" />
          <Input value={productQuery} onChange={setProductQuery} placeholder="Buscar por ID, nombre, código, tag o sección..." style={{ width: "100%" }} />
          <div className="spacer" />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={thStyle}>ID</th>
                  <th style={thStyle}>Producto Odoo</th>
                  <th style={thStyle}>Alias presupuestador</th>
                  <th style={thStyle}>Secciones / tags</th>
                  <th style={thStyle}>Visibilidad</th>
                  <th style={thStyle}>Sin stock permanente</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <ProductConfigRow key={product.id} product={product} qc={qc} />
                ))}
              </tbody>
            </table>
            {!filteredProducts.length ? <div className="muted">No hay productos. Asigná etiquetas a secciones en la pestaña anterior.</div> : null}
          </div>
        </div>
      ) : null}

      {!catalogQ.isLoading && !catalogQ.isError && tab === "pdf" ? (
        <div className="card">
          <SectionTitle title="Nombres PDF para productos Puertas">
            <div className="muted">{filteredPdfItems.length} producto(s)</div>
          </SectionTitle>
          <div className="spacer" />
          <Input value={pdfQuery} onChange={setPdfQuery} placeholder="Buscar por ID, nombre Odoo, alias o nombre PDF..." style={{ width: "100%" }} />
          <div className="spacer" />
          {pdfNamesQ.isLoading ? <div className="muted">Cargando nombres PDF...</div> : null}
          {pdfNamesQ.isError ? <div style={{ color: "#d93025" }}>{pdfNamesQ.error.message}</div> : null}
          {!pdfNamesQ.isLoading && !pdfNamesQ.isError ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>ID</th>
                    <th style={thStyle}>Nombre Odoo</th>
                    <th style={thStyle}>Nombre presupuestador</th>
                    <th style={thStyle}>Nombre PDF</th>
                    <th style={thStyle}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPdfItems.map((item) => {
                    const productId = String(item.product_id);
                    const draft = pdfDrafts[productId] ?? "";
                    return (
                      <tr key={`pdf-${productId}`}>
                        <td style={tdStyle}>{item.product_id}</td>
                        <td style={tdStyle}>{item.odoo_name || "—"}</td>
                        <td style={tdStyle}>{item.presupuestador_name || "—"}{item.alias ? <div className="muted" style={{ fontSize: 12 }}>Alias: {item.alias}</div> : null}</td>
                        <td style={tdStyle}>
                          <Input value={draft} onChange={(value) => setPdfDrafts((prev) => ({ ...prev, [productId]: value }))} placeholder={item.odoo_name || "Nombre PDF"} style={{ width: "100%" }} />
                        </td>
                        <td style={tdStyle}>
                          <Button variant="primary" disabled={savePdfM.isPending} onClick={() => savePdfM.mutate({ productId: item.product_id, pdfName: draft })}>Guardar</Button>
                          <div style={{ height: 8 }} />
                          <Button variant="ghost" disabled={savePdfM.isPending} onClick={() => { setPdfDrafts((prev) => ({ ...prev, [productId]: "" })); savePdfM.mutate({ productId: item.product_id, pdfName: "" }); }}>Usar Odoo</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!filteredPdfItems.length ? <div className="muted">No hay productos para configurar. Primero asigná etiquetas a secciones.</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {!catalogQ.isLoading && !catalogQ.isError && tab === "preview" ? (
        <div className="card">
          <SectionTitle title="Vista previa del catálogo Puertas">
            <div className="muted">{sections.length} sección(es) · {products.length} producto(s)</div>
          </SectionTitle>
          <div className="spacer" />
          {sections.map((section) => {
            const sectionProducts = products.filter((product) => Array.isArray(product.section_ids) && product.section_ids.map(Number).includes(Number(section.id)));
            return (
              <div key={`preview-${section.id}`} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 900 }}>{section.name}</div>
                <div className="muted" style={{ marginBottom: 8 }}>{section.use_surface_qty ? "Cantidad = superficie de puerta" : "Cantidad fija/manual"} · {sectionProducts.length} producto(s)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
                  {sectionProducts.map((product) => (
                    <div key={`${section.id}-${product.id}`} style={{ border: "1px solid #f1f5f9", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontWeight: 800 }}>{productLabel(product)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{odooLabel(product)}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {!sections.length ? <div className="muted">Todavía no hay secciones configuradas.</div> : null}
        </div>
      ) : null}
    </div>
  );
}

const thStyle = { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee", verticalAlign: "top" };
const tdStyle = { padding: "10px 8px", borderBottom: "1px solid #f3f3f3", verticalAlign: "top" };

function EditableSectionRow({ section, qc }) {
  const [name, setName] = useState(section.name || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => setName(section.name || ""), [section.id, section.name]);

  async function savePatch(patch) {
    setSaving(true);
    try {
      await adminUpdateSection(KIND, section.id, patch);
      await qc.invalidateQueries({ queryKey: ["adminCatalog", KIND] });
      toast.success("Sección actualizada.");
    } catch (e) {
      toast.error(e?.message || "No se pudo actualizar la sección");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
        <div>
          <div className="muted" style={{ marginBottom: 6 }}>Sección ID {section.id}</div>
          <Input value={name} onChange={setName} style={{ width: "100%" }} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="primary" disabled={saving || !name.trim() || String(name).trim() === String(section.name || "").trim()} onClick={() => savePatch({ name: name.trim() })}>Guardar</Button>
          <Button variant="ghost" disabled={saving} onClick={async () => {
            if (!window.confirm(`¿Borrar sección "${section.name}"?`)) return;
            try {
              await adminDeleteSection(KIND, section.id);
              await qc.invalidateQueries({ queryKey: ["adminCatalog", KIND] });
              toast.success("Sección borrada.");
            } catch (e) {
              toast.error(e?.message || "No se pudo borrar la sección");
            }
          }}>Borrar</Button>
        </div>
      </div>
      <div className="spacer" />
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={!!section.use_surface_qty} disabled={saving} onChange={(e) => savePatch({ use_surface_qty: e.target.checked })} />
        <span className="muted">Cantidad = superficie (ancho × alto)</span>
      </label>
    </div>
  );
}

function ProductConfigRow({ product, qc }) {
  const [alias, setAlias] = useState(product.alias || product.internal_alias || "");
  const [visibility, setVisibility] = useState(visibilityFromProduct(product));
  const [noPermanentStock, setNoPermanentStock] = useState(!!product.no_permanent_stock);
  const [savingAlias, setSavingAlias] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);

  useEffect(() => {
    setAlias(product.alias || product.internal_alias || "");
    setVisibility(visibilityFromProduct(product));
    setNoPermanentStock(!!product.no_permanent_stock);
  }, [product.id, product.alias, product.internal_alias, product.disable_for_vendedor, product.disable_for_distribuidor, product.no_permanent_stock]);

  return (
    <tr>
      <td style={tdStyle}>
        <div style={{ fontWeight: 800 }}>{product.id}</div>
        <div className="muted" style={{ fontSize: 12 }}>Odoo: {product.odoo_id || product.odoo_template_id || product.odoo_variant_id || "—"}</div>
      </td>
      <td style={tdStyle}>
        <div style={{ fontWeight: 800 }}>{odooLabel(product)}</div>
        <div className="muted" style={{ fontSize: 12 }}>Actual: {productLabel(product)}</div>
      </td>
      <td style={tdStyle}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Input value={alias} onChange={setAlias} placeholder="Alias interno" style={{ minWidth: 220, flex: 1 }} />
          <Button variant="primary" disabled={savingAlias} onClick={async () => {
            setSavingAlias(true);
            try {
              await adminSetProductAlias(KIND, product.id, alias);
              await qc.invalidateQueries({ queryKey: ["adminCatalog", KIND] });
              toast.success("Alias guardado.");
            } catch (e) {
              toast.error(e?.message || "No se pudo guardar el alias");
            } finally {
              setSavingAlias(false);
            }
          }}>Guardar</Button>
        </div>
      </td>
      <td style={tdStyle}>
        <div>{Array.isArray(product.sections) && product.sections.length ? product.sections.join(", ") : "—"}</div>
        <div className="muted" style={{ fontSize: 12 }}>{Array.isArray(product.tags) && product.tags.length ? product.tags.join(", ") : "Sin tags"}</div>
      </td>
      <td style={tdStyle}>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", minWidth: 180 }}>
          <option value="none">Visible para todos</option>
          <option value="vendedor">Ocultar vendedor</option>
          <option value="distribuidor">Ocultar distribuidor</option>
          <option value="both">Ocultar vendedor y distribuidor</option>
        </select>
        <div style={{ height: 8 }} />
        <Button variant="secondary" disabled={savingVisibility} onClick={async () => {
          setSavingVisibility(true);
          try {
            await adminSetProductVisibility(KIND, product.id, { ...visibilityPayload(visibility), no_permanent_stock: noPermanentStock });
            await qc.invalidateQueries({ queryKey: ["adminCatalog", KIND] });
            toast.success("Visibilidad guardada.");
          } catch (e) {
            toast.error(e?.message || "No se pudo guardar la visibilidad");
          } finally {
            setSavingVisibility(false);
          }
        }}>Guardar visibilidad</Button>
      </td>
      <td style={tdStyle}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={noPermanentStock} onChange={(e) => setNoPermanentStock(e.target.checked)} />
          <span className="muted" style={{ fontSize: 12 }}>Sin stock permanente</span>
        </label>
      </td>
    </tr>
  );
}
