import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { getCatalogBootstrap } from "../api/catalog.js";

function textValue(value) {
  return String(value ?? "").trim();
}

function normalizeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function productSectionIds(product) {
  const ids = Array.isArray(product?.section_ids) ? product.section_ids : [];
  return ids
    .map((id) => normalizeNumber(id))
    .filter((id) => id > 0);
}

function findAptoKgTableRoot() {
  if (typeof document === "undefined") return null;
  const titleNode = Array.from(document.querySelectorAll("div"))
    .find((node) => textValue(node.textContent) === "Tabla kg/m² para apto para revestir");
  if (!titleNode) return null;

  let node = titleNode;
  for (let i = 0; i < 8 && node; i += 1) {
    const text = textValue(node.textContent);
    if (text.includes("Tabla kg/m² para apto para revestir") && text.includes("+ Agregar fila") && text.includes("Producto")) {
      return node;
    }
    node = node.parentElement;
  }
  return titleNode.parentElement?.parentElement?.parentElement || null;
}

function setOptionVisibility(option, visible) {
  option.hidden = !visible;
  option.disabled = !visible;
  option.style.display = visible ? "" : "none";
}

export default function AptoKgProductSectionFilterPatch() {
  const location = useLocation();
  const active = location.pathname === "/dashboard/reglas-tecnicas";
  const [catalog, setCatalog] = useState(null);
  const [selectedSectionId, setSelectedSectionId] = useState("");

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    getCatalogBootstrap("porton")
      .then((data) => {
        if (!cancelled) setCatalog(data || null);
      })
      .catch(() => {
        if (!cancelled) setCatalog(null);
      });
    return () => { cancelled = true; };
  }, [active]);

  const sections = useMemo(() => {
    const raw = Array.isArray(catalog?.sections) ? catalog.sections : [];
    return raw
      .map((section) => ({
        id: normalizeNumber(section?.id),
        name: textValue(section?.name || `Sección ${section?.id}`),
        position: Number(section?.position || 0) || 0,
      }))
      .filter((section) => section.id > 0)
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "es"));
  }, [catalog]);

  const productsById = useMemo(() => {
    const map = new Map();
    const raw = Array.isArray(catalog?.products) ? catalog.products : [];
    for (const product of raw) {
      const id = normalizeNumber(product?.id);
      if (id > 0) map.set(id, product);
    }
    return map;
  }, [catalog]);

  const allowedProductIds = useMemo(() => {
    const sectionId = normalizeNumber(selectedSectionId);
    if (!sectionId) return null;
    const out = new Set();
    for (const [id, product] of productsById.entries()) {
      if (productSectionIds(product).includes(sectionId)) out.add(id);
    }
    return out;
  }, [productsById, selectedSectionId]);

  useEffect(() => {
    if (!active) return undefined;

    function applyFilter() {
      const root = findAptoKgTableRoot();
      if (!root) return;
      const selects = Array.from(root.querySelectorAll("select"));
      for (const select of selects) {
        const currentValue = normalizeNumber(select.value);
        for (const option of Array.from(select.options)) {
          const optionValue = normalizeNumber(option.value);
          const isEmpty = !option.value;
          const keepCurrent = currentValue > 0 && optionValue === currentValue;
          const allowed = !allowedProductIds || isEmpty || keepCurrent || allowedProductIds.has(optionValue);
          setOptionVisibility(option, allowed);
        }
      }
    }

    applyFilter();
    const timer = window.setInterval(applyFilter, 400);
    const observer = new MutationObserver(applyFilter);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
    };
  }, [active, allowedProductIds]);

  useEffect(() => {
    if (!active) return;
    if (!selectedSectionId) return;
    const exists = sections.some((section) => String(section.id) === String(selectedSectionId));
    if (!exists) setSelectedSectionId("");
  }, [active, selectedSectionId, sections]);

  if (!active) return null;

  const selectedName = sections.find((section) => String(section.id) === String(selectedSectionId))?.name || "todas las secciones";
  const filteredCount = allowedProductIds ? allowedProductIds.size : productsById.size;

  return (
    <div className="container" style={{ paddingTop: 14 }}>
      <div className="card" style={{ border: "1px solid #dbeafe", background: "#f8fbff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <div>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Filtro de productos para kg/m² apto para revestir</div>
            <div className="muted">Este filtro afecta solamente los desplegables de la tabla kg/m² para apto para revestir.</div>
          </div>
          <div style={{ minWidth: 300 }}>
            <div className="muted" style={{ marginBottom: 6 }}>Sección</div>
            <select
              value={selectedSectionId}
              onChange={(event) => setSelectedSectionId(event.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
            >
              <option value="">Todas las secciones</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          Mostrando productos de <b>{selectedName}</b> ({filteredCount} producto{filteredCount === 1 ? "" : "s"}). Si una fila ya tenía un producto elegido fuera del filtro, se mantiene visible para no perder la selección.
        </div>
      </div>
    </div>
  );
}
