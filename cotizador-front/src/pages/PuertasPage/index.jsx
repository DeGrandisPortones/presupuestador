import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { createStandaloneDoor, listDoors } from "../../api/doors.js";

const PAGE_SIZE = 25;

function text(v) { return String(v || "").trim(); }
function matchesSearch(d, searchText) {
  const s = text(searchText).toLowerCase();
  if (!s) return true;
  const haystack = [
    d?.door_code,
    d?.record?.end_customer?.name,
    d?.record?.obra_cliente,
    d?.linked_quote_odoo_name,
    d?.linked_quote_number,
    d?.record?.asociado_porton,
    d?.record?.structure_quote_id,
    d?.record?.ipanel_quote_id,
    d?.status,
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(s);
}
function isCompleteQuoteId(v) { return !!text(v); }
function isBlankFailedDoor(d) {
  const r = d?.record || {};
  return text(d?.status).toLowerCase() === "draft"
    && !text(d?.linked_quote_id)
    && !text(d?.structure_quote_id || r?.structure_quote_id)
    && !text(r?.ipanel_quote_id)
    && !text(r?.end_customer?.name || r?.obra_cliente)
    && !text(r?.end_customer?.phone);
}
function labelDoorStatus(d) {
  const record = d?.record || {};
  const linkedReady = !!text(d?.linked_quote_id);
  const customerReady = !!text(record?.end_customer?.name || record?.obra_cliente) && !!text(record?.end_customer?.phone);
  const structureReady = isCompleteQuoteId(record?.structure_quote_id || d?.structure_quote_id);
  const ipanelReady = isCompleteQuoteId(record?.ipanel_quote_id);
  if (text(d?.status).toLowerCase() !== "draft") return d?.status || "-";
  const pending = [];
  if (!linkedReady) pending.push("porton");
  if (!customerReady) pending.push("cliente");
  if (!structureReady) pending.push("estructura");
  if (!ipanelReady) pending.push("Ipanel");
  return pending.length ? `Falta ${pending.join(", ")}` : "Completa / pendiente confirmar";
}

export default function PuertasPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);

  const q = useQuery({ queryKey: ["doors", "mine"], queryFn: () => listDoors({ scope: "mine" }), enabled: !!user?.is_vendedor });

  const createM = useMutation({
    mutationFn: async () => await createStandaloneDoor(),
    onSuccess: (door) => {
      toast.success("Puerta creada. Vinculala a un porton antes de confirmarla.");
      navigate(`/puertas/${door.id}`);
    },
    onError: (e) => toast.error(e?.message || "No se pudo crear la puerta"),
  });

  const rows = useMemo(() => (q.data || []).filter((d) => !isBlankFailedDoor(d)).filter((d) => matchesSearch(d, searchText)), [q.data, searchText]);
  useEffect(() => { setPage(1); }, [searchText]);
  useEffect(() => { const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)); if (page > totalPages) setPage(totalPages); }, [rows.length, page]);
  const visibleRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);

  if (!user?.is_vendedor) return <div className="container"><div className="card">No autorizado (solo Vendedor).</div></div>;

  return (
    <div className="container">
      <div className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Puertas</h2>
          <div className="muted">Cada puerta se compone de <b>Estructura</b> + <b>Ipanel</b>. Puede haber varias puertas vinculadas al mismo porton.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => createM.mutate()} disabled={createM.isPending}>{createM.isPending ? "Creando..." : "Nueva puerta"}</Button>
          <Button variant="ghost" onClick={() => navigate("/menu")}>Volver</Button>
        </div>
      </div>
      <div className="spacer" />
      <div className="card">
        <Input value={searchText} onChange={setSearchText} placeholder="Buscar por codigo, cliente, porton vinculado, estructura, Ipanel o estado..." style={{ width: "100%" }} />
        <div className="spacer" />
        {q.isLoading && <div className="muted">Cargando...</div>}
        {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}
        {!q.isLoading && !rows.length && <div className="muted">No tenes puertas cargadas.</div>}
        {!!rows.length && (
          <>
            <table>
              <thead><tr><th>Codigo</th><th>Cliente</th><th>Porton vinculado</th><th>Estructura</th><th>Ipanel</th><th>Estado</th><th>Venta Odoo</th><th></th></tr></thead>
              <tbody>
                {visibleRows.map((d) => (
                  <tr key={d.id}>
                    <td><div style={{ fontWeight: 800 }}>{d.door_code}</div><div className="muted">#{d.id}</div></td>
                    <td>{d.record?.end_customer?.name || d.record?.obra_cliente || "-"}</td>
                    <td>{d.linked_quote_odoo_name || d.linked_quote_number || d.record?.asociado_porton || "-"}</td>
                    <td>{d.record?.structure_quote_label || d.record?.structure_quote_id || d.structure_quote_id || "-"}</td>
                    <td>{d.record?.ipanel_quote_label || d.record?.ipanel_quote_id || "-"}</td>
                    <td>{labelDoorStatus(d)}</td>
                    <td>{d.odoo_sale_order_name || "-"}</td>
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
