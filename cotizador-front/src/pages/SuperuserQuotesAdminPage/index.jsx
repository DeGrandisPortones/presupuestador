import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Button from "../../ui/Button.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { adminDeleteQuote, adminGetQuotes, adminResyncPortonMeasurements, adminSetQuoteTechnicalFormula } from "../../api/admin.js";

const PAGE_SIZE = 25;

const TABS = [
  { key: "budgets", label: "Presupuestos", help: "Registros internos sin NP/NV generada. Se pueden eliminar definitivamente." },
  { key: "portones", label: "NP/NV Portones", help: "Solo consulta. No se permite eliminar registros con Odoo generado." },
  { key: "ipanels", label: "INP/INV Ipanels", help: "Solo consulta. No se permite eliminar registros con Odoo generado." },
  { key: "puertas", label: "PNP/PNV Puertas", help: "Solo consulta. No se permite eliminar registros con Odoo generado." },
  { key: "plegados", label: "PLNP/PLNV Plegados", help: "Solo consulta. No se permite eliminar registros con Odoo generado." },
  { key: "otros", label: "ONP/ONV Otros", help: "Solo consulta. No se permite eliminar registros con Odoo generado." },
  { key: "all", label: "Todos", help: "Consulta general de todos los presupuestos y órdenes." },
];

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function catalogLabel(kind) {
  const k = String(kind || "porton").toLowerCase();
  if (k === "ipanel") return "Ipanel";
  if (k === "puerta") return "Puerta";
  if (k === "plegados") return "Plegados";
  if (k === "otros") return "Otros";
  return "Portón";
}

function customerName(row) {
  const c = row?.end_customer || {};
  const first = String(c.first_name || "").trim();
  const last = String(c.last_name || "").trim();
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined || String(c.name || "").trim() || "—";
}

function customerDetails(row) {
  const c = row?.end_customer || {};
  return [c.phone, c.email, c.address, c.city].filter(Boolean).join(" · ");
}

function displayQuoteNumber(row) {
  if (row?.quote_number !== null && row?.quote_number !== undefined && String(row.quote_number).trim()) return `#${row.quote_number}`;
  return String(row?.id || "").slice(0, 8) || "—";
}

function displayOdooReference(row) {
  return row?.production_sale_order_name || row?.final_sale_order_name || row?.final_copy_sale_order_name || row?.odoo_sale_order_name || "—";
}

function statusText(row) {
  return [row?.status, row?.final_status].filter(Boolean).join(" / ") || "—";
}

function roleText(row) {
  const role = String(row?.created_by_role || "").trim();
  const user = String(row?.created_by_full_name || row?.created_by_username || "").trim();
  return [role, user].filter(Boolean).join(" · ") || "—";
}

export default function SuperuserQuotesAdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("budgets");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const activeMeta = useMemo(() => TABS.find((item) => item.key === activeTab) || TABS[0], [activeTab]);

  const quotesQ = useQuery({
    queryKey: ["admin-quotes", activeTab, search],
    queryFn: () => adminGetQuotes({ bucket: activeTab, q: search, limit: 500 }),
    keepPreviousData: true,
  });

  const deleteM = useMutation({
    mutationFn: (id) => adminDeleteQuote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-quotes"] }),
  });

  const technicalFormulaM = useMutation({
    mutationFn: ({ id, enabled }) => adminSetQuoteTechnicalFormula(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-quotes"] }),
    onError: (e) => window.alert(e?.message || "No se pudo actualizar el presupuesto"),
  });

  const [resyncIdentifier, setResyncIdentifier] = useState("");
  const [resyncResult, setResyncResult] = useState(null);
  const resyncM = useMutation({
    mutationFn: ({ identifier, force }) => adminResyncPortonMeasurements(identifier, { force }),
    onSuccess: (data) => {
      if (data?.ok === false && data?.blocked_reason === "client_already_accepted") {
        setResyncResult({ blocked: true, identifier: resyncIdentifier.trim(), error: data.error });
        return;
      }
      setResyncResult({ ok: true, data });
      qc.invalidateQueries({ queryKey: ["admin-quotes"] });
    },
    onError: (e) => setResyncResult({ ok: false, error: e?.message || "No se pudo resincronizar" }),
  });

  function runResync(e) {
    e?.preventDefault?.();
    const identifier = resyncIdentifier.trim();
    if (!identifier || resyncM.isPending) return;
    setResyncResult(null);
    resyncM.mutate({ identifier, force: false });
  }

  function forceResync() {
    const identifier = String(resyncResult?.identifier || "").trim();
    if (!identifier || resyncM.isPending) return;
    const ok = window.confirm(
      `El cliente ya aceptó el link de "${identifier}". Vas a modificar datos que ya se le mostraron y aceptó.\n\nEsta es la ÚNICA vía permitida para hacerlo — quedará registrado quién y cuándo lo forzó.\n\n¿Confirmás que igual querés continuar?`,
    );
    if (!ok) return;
    resyncM.mutate({ identifier, force: true });
  }

  const rows = Array.isArray(quotesQ.data) ? quotesQ.data : [];
  const canShowDelete = activeTab === "budgets" || activeTab === "all";

  useEffect(() => { setPage(1); }, [activeTab, search]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  function applySearch(e) {
    e?.preventDefault?.();
    setSearch(searchDraft.trim());
  }

  async function deleteQuote(row) {
    if (!row?.id || !row?.can_delete || deleteM.isPending) return;
    const label = `${displayQuoteNumber(row)} · ${customerName(row)}`;
    const ok = window.confirm(`Esto elimina definitivamente el presupuesto ${label} de la base de datos.\n\nSolo debe usarse si querés que sea como si nunca existió.\n\n¿Continuar?`);
    if (!ok) return;
    try {
      await deleteM.mutateAsync(row.id);
    } catch (e) {
      window.alert(e?.message || "No se pudo eliminar el presupuesto");
    }
  }

  return (
    <div className="container">
      <div className="spacer" />
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Admin presupuestos y órdenes</h2>
            <div className="muted" style={{ marginTop: 6 }}>Vista superusuario: muestra todos los registros, sin filtrar por vendedor ni distribuidor.</div>
          </div>
          <Button variant="ghost" onClick={() => navigate("/menu")}>Volver</Button>
        </div>
      </div>

      <div className="spacer" />
      <div className="card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TABS.map((tab) => (
            <Button key={tab.key} variant={activeTab === tab.key ? "primary" : "secondary"} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </Button>
          ))}
        </div>
        <div className="muted" style={{ marginTop: 10 }}>{activeMeta.help}</div>

        <form onSubmit={applySearch} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Buscar cliente, teléfono, mail, dirección, presupuesto, NP/NV/INP/INV..."
            style={{ flex: "1 1 360px", padding: "9px 11px", borderRadius: 8, border: "1px solid #ddd", outline: "none" }}
          />
          <Button type="submit">Buscar</Button>
          {search ? <Button type="button" variant="ghost" onClick={() => { setSearchDraft(""); setSearch(""); }}>Limpiar</Button> : null}
        </form>
      </div>

      <div className="spacer" />
      <div className="card">
        <div style={{ fontWeight: 900 }}>Resync medidas de paso (portones)</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Recalcula ancho/alto de portón y medidas de paso/hoja con la fórmula oficial, usando la medición final
          cargada, y refresca preproducción_valores. No toca la NV en Odoo. Si el cliente ya aceptó el link, no
          modifica nada.
        </div>
        <form onSubmit={runResync} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          <input
            value={resyncIdentifier}
            onChange={(e) => setResyncIdentifier(e.target.value)}
            placeholder="Número de NP o NV, ej: NV4307"
            style={{ flex: "1 1 260px", padding: "9px 11px", borderRadius: 8, border: "1px solid #ddd", outline: "none" }}
          />
          <Button type="submit" disabled={resyncM.isPending || !resyncIdentifier.trim()}>
            {resyncM.isPending ? "Resincronizando..." : "Resync"}
          </Button>
        </form>
        {resyncResult?.blocked ? (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "#fff8e1", border: "1px solid #f5c518" }}>
            <div style={{ color: "#7a5b00", fontWeight: 700 }}>{resyncResult.error}</div>
            <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
              Esta es la única vía habilitada para tocar medidas después de la aceptación del cliente. Se registra quién y cuándo lo fuerza.
            </div>
            <div style={{ marginTop: 8 }}>
              <Button variant="danger" disabled={resyncM.isPending} onClick={forceResync}>
                {resyncM.isPending ? "Forzando..." : "Forzar de todos modos"}
              </Button>
            </div>
          </div>
        ) : null}
        {resyncResult?.ok === false ? (
          <div style={{ color: "#d93025", marginTop: 10 }}>{resyncResult.error}</div>
        ) : null}
        {resyncResult?.ok === true ? (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <div style={{ color: "#188038", fontWeight: 700 }}>
              Actualizado: presupuesto #{resyncResult.data.quote_number} ({resyncResult.data.odoo_sale_order_name || "—"} / {resyncResult.data.final_sale_order_name || "—"})
              {resyncResult.data.forced_after_client_acceptance ? " · forzado tras aceptación del cliente" : ""}
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              Medidas de paso: {resyncResult.data.before?.medidas_paso_text || "—"} → {resyncResult.data.after?.medidas_paso_text || "—"}
            </div>
            <div className="muted">
              Copia sincronizada: {resyncResult.data.copy_updated ? "sí" : "no había copia"} · preproducción_valores: {resyncResult.data.preproduccion_valores?.updated ? "actualizado" : `sin actualizar (${resyncResult.data.preproduccion_valores?.reason || "-"})`}
            </div>
          </div>
        ) : null}
      </div>

      <div className="spacer" />
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 900 }}>{activeMeta.label}</div>
          <div className="muted">{quotesQ.isFetching ? "Actualizando..." : `${rows.length} registros`}</div>
        </div>

        {quotesQ.isLoading ? <div className="muted" style={{ marginTop: 12 }}>Cargando...</div> : null}
        {quotesQ.isError ? <div style={{ color: "#d93025", marginTop: 12 }}>{quotesQ.error?.message || "No se pudo cargar"}</div> : null}
        {!quotesQ.isLoading && !rows.length ? <div className="muted" style={{ marginTop: 12 }}>Sin registros.</div> : null}

        {!!rows.length ? (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Presupuesto</th>
                  <th>Cliente</th>
                  <th>Usuario</th>
                  <th>Estado</th>
                  <th>Destino</th>
                  <th>Odoo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.created_at)}</td>
                    <td>{catalogLabel(row.catalog_kind)}</td>
                    <td style={{ fontWeight: 800 }}>{displayQuoteNumber(row)}</td>
                    <td>
                      <div style={{ fontWeight: 800 }}>{customerName(row)}</div>
                      <div className="muted" style={{ maxWidth: 340 }}>{customerDetails(row)}</div>
                    </td>
                    <td>{roleText(row)}</td>
                    <td>{statusText(row)}</td>
                    <td>{row.fulfillment_mode === "acopio" ? "Acopio" : "Producción"}</td>
                    <td style={{ fontWeight: row.has_generated_odoo ? 800 : 400 }}>{displayOdooReference(row)}</td>
                    <td className="right">
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <Button variant="ghost" onClick={() => navigate(`/presupuestos/${row.id}`)}>Ver</Button>
                        {String(row.catalog_kind || "porton").toLowerCase() === "porton" ? (
                          <Button
                            variant={row.payload?.use_new_technical_formula ? "primary" : "secondary"}
                            disabled={technicalFormulaM.isPending}
                            title="Medidas de paso/hoja: usar la fórmula oficial (backend) en vez del cálculo local obsoleto para este presupuesto puntual"
                            onClick={() => technicalFormulaM.mutate({ id: row.id, enabled: !row.payload?.use_new_technical_formula })}
                          >
                            {row.payload?.use_new_technical_formula ? "Fórmula nueva ✓" : "Usar fórmula nueva"}
                          </Button>
                        ) : null}
                        {canShowDelete && row.can_delete ? (
                          <Button variant="danger" disabled={deleteM.isPending} onClick={() => deleteQuote(row)}>
                            Eliminar
                          </Button>
                        ) : null}
                        {canShowDelete && !row.can_delete ? <span className="muted" style={{ alignSelf: "center" }}>Solo consulta</span> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls
              page={page}
              totalItems={rows.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
