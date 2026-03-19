import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { createStandaloneDoor, listDoors, updateDoor } from "../../api/doors.js";
import { createQuote } from "../../api/quotes.js";

const PAGE_SIZE = 25;

function matchesSearch(d, searchText) {
  const s = String(searchText || "").trim().toLowerCase();
  if (!s) return true;
  const haystack = [
    d?.door_code,
    d?.record?.end_customer?.name,
    d?.record?.obra_cliente,
    d?.linked_quote_odoo_name,
    d?.record?.asociado_porton,
    d?.record?.ipanel_quote_id,
    d?.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(s);
}

function buildStandaloneDoorRecordSeed(baseRecord = {}, user) {
  const record = baseRecord && typeof baseRecord === "object" ? { ...baseRecord } : {};
  const currentCustomer = record.end_customer && typeof record.end_customer === "object" ? record.end_customer : {};
  record.end_customer = {
    ...currentCustomer,
    name: String(currentCustomer.name || "").trim(),
    phone: String(currentCustomer.phone || "").trim(),
    email: String(currentCustomer.email || "").trim(),
    address: String(currentCustomer.address || "").trim(),
    city: String(currentCustomer.city || "").trim(),
    maps_url: String(currentCustomer.maps_url || user?.default_maps_url || "").trim(),
  };
  record.obra_cliente = String(record.end_customer.name || record.obra_cliente || "").trim();
  return record;
}

function buildDoorBundleQuotePayload({ door, record, user }) {
  return {
    created_by_role: "vendedor",
    catalog_kind: "ipanel",
    fulfillment_mode: "acopio",
    pricelist_id: 1,
    end_customer: { ...(record?.end_customer || {}) },
    lines: [],
    payload: {
      payment_method: "",
      condition_mode: "",
      condition_text: "",
    },
    note: `Ipanel vinculado a puerta ${door?.door_code || door?.id || ""}\nVendedor: ${user?.full_name || user?.username || ""}`.trim(),
  };
}

export default function PuertasPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [createChoiceOpen, setCreateChoiceOpen] = useState(false);

  const q = useQuery({
    queryKey: ["doors", "mine"],
    queryFn: () => listDoors({ scope: "mine" }),
    enabled: !!user?.is_vendedor,
  });

  const createBundleM = useMutation({
    mutationFn: async ({ startWith }) => {
      const door = await createStandaloneDoor();
      const recordSeed = buildStandaloneDoorRecordSeed(door?.record, user);
      const ipanelQuote = await createQuote(buildDoorBundleQuotePayload({ door, record: recordSeed, user }));
      const nextRecord = {
        ...recordSeed,
        ipanel_quote_id: ipanelQuote.id,
        ipanel_quote_label: ipanelQuote.quote_number || ipanelQuote.id,
      };
      const savedDoor = await updateDoor(door.id, { record: nextRecord });
      return { savedDoor, ipanelQuote, startWith };
    },
    onSuccess: ({ savedDoor, ipanelQuote, startWith }) => {
      setCreateChoiceOpen(false);
      toast.success("Puerta creada. Ahora completá marco e Ipanel.");
      if (startWith === "ipanel") {
        navigate(`/cotizador/ipanel/${ipanelQuote.id}?door_workflow=1&workflow_stage=ipanel_first&door_id=${encodeURIComponent(savedDoor.id)}`);
        return;
      }
      navigate(`/puertas/${savedDoor.id}?door_workflow=1&workflow_stage=door_first&ipanel_quote_id=${encodeURIComponent(ipanelQuote.id)}`);
    },
    onError: (e) => toast.error(e?.message || "No se pudo crear la puerta"),
  });

  const rows = useMemo(() => (q.data || []).filter((d) => matchesSearch(d, searchText)), [q.data, searchText]);

  useEffect(() => {
    setPage(1);
  }, [searchText]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [rows.length, page]);

  const visibleRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);
  const busy = createBundleM.isPending;

  if (!user?.is_vendedor) {
    return (
      <div className="container">
        <div className="card">No autorizado (solo Vendedor).</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Puertas</h2>
          <div className="muted">Cada puerta se compone de <b>marco de puerta</b> + <b>Ipanel</b>. Los Ipaneles también pueden venderse solos desde su propio cotizador.</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => setCreateChoiceOpen(true)} disabled={busy}>{busy ? "Creando..." : "Nueva puerta"}</Button>
          <Button variant="ghost" onClick={() => navigate("/menu")}>Volver</Button>
        </div>
      </div>

      {createChoiceOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }} onClick={() => { if (!busy) setCreateChoiceOpen(false); }}>
          <div className="card" style={{ width: "100%", maxWidth: 760, background: "#fff", border: "1px solid #ddd", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 22, marginBottom: 6 }}>Nueva puerta</div>
            <div className="muted" style={{ marginBottom: 18 }}>Se va a crear <b>un único presupuesto de puerta</b> compuesto por dos partes: <b>Marco</b> + <b>Ipanel</b>. Elegí con cuál querés empezar.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              <div style={{ border: "1px solid #f2d3bf", background: "#fff8f3", borderRadius: 14, padding: 16 }}>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Empezar por Marco</div>
                <div className="muted" style={{ marginBottom: 14 }}>Primero completás la ficha del marco de puerta y después seguís con el Ipanel.</div>
                <Button variant="primary" onClick={() => createBundleM.mutate({ startWith: "marco" })} disabled={busy}>{busy ? "Creando..." : "Abrir Marco"}</Button>
              </div>
              <div style={{ border: "1px solid #d9e5f7", background: "#f7fbff", borderRadius: 14, padding: 16 }}>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Empezar por Ipanel</div>
                <div className="muted" style={{ marginBottom: 14 }}>Primero cargás el revestimiento Ipanel y después seguís con el marco.</div>
                <Button onClick={() => createBundleM.mutate({ startWith: "ipanel" })} disabled={busy}>{busy ? "Creando..." : "Abrir Ipanel"}</Button>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setCreateChoiceOpen(false)} disabled={busy}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      <div className="spacer" />

      <div className="card">
        <Input value={searchText} onChange={setSearchText} placeholder="Buscar por código, cliente, portón vinculado, Ipanel o estado…" style={{ width: "100%" }} />
        <div className="spacer" />

        {q.isLoading && <div className="muted">Cargando...</div>}
        {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}
        {!q.isLoading && !rows.length && <div className="muted">No tenés puertas cargadas.</div>}

        {!!rows.length && (
          <>
            <table>
              <thead><tr><th>Código</th><th>Cliente</th><th>Vinculada a portón</th><th>Ipanel</th><th>Estado</th><th>Venta</th><th>Compra</th><th></th></tr></thead>
              <tbody>
                {visibleRows.map((d) => (
                  <tr key={d.id}>
                    <td><div style={{ fontWeight: 800 }}>{d.door_code}</div><div className="muted">#{d.id}</div></td>
                    <td>{d.record?.end_customer?.name || d.record?.obra_cliente || "—"}</td>
                    <td>{d.linked_quote_odoo_name || d.record?.asociado_porton || "—"}</td>
                    <td>{d.record?.ipanel_quote_id ? `#${d.record.ipanel_quote_id}` : "—"}</td>
                    <td>{d.status}</td>
                    <td>{d.sale_amount ? `$ ${Number(d.sale_amount).toLocaleString("es-AR")}` : "—"}</td>
                    <td>{d.purchase_amount ? `$ ${Number(d.purchase_amount).toLocaleString("es-AR")}` : "—"}</td>
                    <td className="right"><Button onClick={() => navigate(`/puertas/${d.id}`)}>Abrir puerta</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls page={page} totalItems={rows.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
