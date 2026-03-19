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
  ].filter(Boolean).join(" ").toLowerCase();
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
  record.fulfillment_mode = String(record.fulfillment_mode || "").trim();
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
    payload: { payment_method: "", condition_mode: "", condition_text: "" },
    note: `Ipanel vinculado a puerta ${door?.door_code || door?.id || ""}\nVendedor: ${user?.full_name || user?.username || ""}`.trim(),
  };
}

function labelDoorStatus(d) {
  const record = d?.record || {};
  const marcoReady = !!String(record?.end_customer?.name || "").trim()
    && !!String(record?.end_customer?.phone || "").trim()
    && !!String(record?.end_customer?.address || "").trim()
    && !!String(record?.supplier_odoo_partner_id || "").trim()
    && Number(record?.sale_amount || 0) > 0
    && Number(record?.purchase_amount || 0) > 0;
  const ipanelReady = !!String(record?.ipanel_quote_id || "").trim();
  if (String(d?.status || "").toLowerCase() !== "draft") return d?.status || "—";
  if (!marcoReady && !ipanelReady) return "Falta completar Marco e Ipanel";
  if (!marcoReady) return "Falta completar Marco";
  if (!ipanelReady) return "Falta completar Ipanel";
  return "Completa / pendiente destino";
}

export default function PuertasPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);

  const q = useQuery({ queryKey: ["doors", "mine"], queryFn: () => listDoors({ scope: "mine" }), enabled: !!user?.is_vendedor });

  const createBundleM = useMutation({
    mutationFn: async () => {
      const door = await createStandaloneDoor();
      const recordSeed = buildStandaloneDoorRecordSeed(door?.record, user);
      const ipanelQuote = await createQuote(buildDoorBundleQuotePayload({ door, record: recordSeed, user }));
      const nextRecord = { ...recordSeed, ipanel_quote_id: ipanelQuote.id, ipanel_quote_label: ipanelQuote.quote_number || ipanelQuote.id };
      const savedDoor = await updateDoor(door.id, { record: nextRecord });
      return { savedDoor };
    },
    onSuccess: ({ savedDoor }) => {
      toast.success("Puerta creada. Ahora elegí Marco o Ipanel.");
      navigate(`/puertas/${savedDoor.id}`);
    },
    onError: (e) => toast.error(e?.message || "No se pudo crear la puerta"),
  });

  const rows = useMemo(() => (q.data || []).filter((d) => matchesSearch(d, searchText)), [q.data, searchText]);
  useEffect(() => { setPage(1); }, [searchText]);
  useEffect(() => { const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)); if (page > totalPages) setPage(totalPages); }, [rows.length, page]);
  const visibleRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);
  const busy = createBundleM.isPending;

  if (!user?.is_vendedor) return <div className="container"><div className="card">No autorizado (solo Vendedor).</div></div>;

  return (
    <div className="container">
      <div className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Puertas</h2>
          <div className="muted">Cada puerta se compone de <b>marco de puerta</b> + <b>Ipanel</b>. El panel de puerta te deja completar una parte y volver luego a la otra.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => createBundleM.mutate()} disabled={busy}>{busy ? "Creando..." : "Nueva puerta"}</Button>
          <Button variant="ghost" onClick={() => navigate("/menu")}>Volver</Button>
        </div>
      </div>
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
                    <td>{labelDoorStatus(d)}</td>
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
