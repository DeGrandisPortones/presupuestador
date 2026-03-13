import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { createStandaloneDoor, listDoors } from "../../api/doors.js";

const PAGE_SIZE = 25;

export default function PuertasPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["doors", "mine"],
    queryFn: () => listDoors({ scope: "mine" }),
    enabled: !!user?.is_vendedor,
  });

  const createM = useMutation({
    mutationFn: () => createStandaloneDoor(),
    onSuccess: (door) => {
      toast.success("Puerta creada.");
      navigate(`/puertas/${door.id}`);
    },
    onError: (e) => toast.error(e?.message || "No se pudo crear la puerta"),
  });

  const rows = useMemo(() => q.data || [], [q.data]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [rows.length, page]);

  const visibleRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

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
          <div className="muted">Puertas aisladas o vinculadas a un presupuesto de portón.</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => createM.mutate()} disabled={createM.isPending}>
            {createM.isPending ? "Creando..." : "Nueva puerta"}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/menu")}>Volver</Button>
        </div>
      </div>

      <div className="spacer" />

      <div className="card">
        {q.isLoading && <div className="muted">Cargando...</div>}
        {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}
        {!q.isLoading && !rows.length && <div className="muted">No tenés puertas cargadas.</div>}

        {!!rows.length && (
          <>
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>Vinculada a portón</th>
                  <th>Estado</th>
                  <th>Venta</th>
                  <th>Compra</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div style={{ fontWeight: 800 }}>{d.door_code}</div>
                      <div className="muted">#{d.id}</div>
                    </td>
                    <td>{d.record?.end_customer?.name || d.record?.obra_cliente || "—"}</td>
                    <td>{d.linked_quote_odoo_name || d.record?.asociado_porton || "—"}</td>
                    <td>{d.status}</td>
                    <td>{d.sale_amount ? `$ ${Number(d.sale_amount).toLocaleString("es-AR")}` : "—"}</td>
                    <td>{d.purchase_amount ? `$ ${Number(d.purchase_amount).toLocaleString("es-AR")}` : "—"}</td>
                    <td className="right">
                      <Button onClick={() => navigate(`/puertas/${d.id}`)}>Abrir</Button>
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
          </>
        )}
      </div>
    </div>
  );
}
