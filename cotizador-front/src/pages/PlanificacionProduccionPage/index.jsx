import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import { adminGetProductionPlanning, adminSaveProductionPlanning } from "../../api/admin.js";
import { useAuthStore } from "../../domain/auth/store.js";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR");
}

export default function PlanificacionProduccionPage() {
  const user = useAuthStore((s) => s.user);
  const allowed = !!(user?.is_superuser || user?.is_enc_comercial);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, idx) => String(currentYear - 1 + idx));
  const [planningYear, setPlanningYear] = useState(String(currentYear));
  const [planningDraft, setPlanningDraft] = useState([]);

  const planningQ = useQuery({
    queryKey: ["production-planning-page", planningYear],
    queryFn: () => adminGetProductionPlanning(Number(planningYear || currentYear)),
    enabled: allowed,
    staleTime: 0,
  });

  const planningSaveM = useMutation({
    mutationFn: async () => {
      return adminSaveProductionPlanning({
        year: Number(planningYear || currentYear),
        weeks: planningDraft.map((row) => ({
          week_number: Number(row.week_number || row.week || 0),
          capacity: Math.max(0, Number(String(row.capacity_input ?? row.capacity ?? 0).replace(",", ".")) || 0),
        })),
      });
    },
    onSuccess: (planning) => {
      setPlanningDraft(
        (planning?.weeks || []).map((row) => ({
          ...row,
          capacity_input: String(row.capacity ?? 0),
        })),
      );
      toast.success("Planificación guardada.");
      planningQ.refetch();
    },
    onError: (e) => toast.error(e?.message || "No se pudo guardar la planificación."),
  });

  useEffect(() => {
    if (!planningQ.data?.weeks) return;
    setPlanningDraft(
      planningQ.data.weeks.map((row) => ({
        ...row,
        capacity_input: String(row.capacity ?? 0),
      })),
    );
  }, [planningQ.data]);

  const summary = useMemo(() => {
    const totalCapacity = planningDraft.reduce((acc, row) => acc + Math.max(0, Number(String(row.capacity_input ?? row.capacity ?? 0).replace(",", ".")) || 0), 0);
    const totalCommitted = planningDraft.reduce((acc, row) => acc + Math.max(0, Number(row.committed_count || 0)), 0);
    return { totalCapacity, totalCommitted, totalAvailable: Math.max(0, totalCapacity - totalCommitted) };
  }, [planningDraft]);

  if (!allowed) {
    return <div className="container"><div className="spacer" /><div className="card">No autorizado. Esta pantalla es solo para Superusuario o Enc. Comercial.</div></div>;
  }

  return (
    <div className="container">
      <div className="spacer" />
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Planificación de producción</h2>
            <div className="muted">Cargá cuántos portones se pueden fabricar por semana. Las semanas comienzan siempre en lunes.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div className="muted">Año</div>
            <select
              value={planningYear}
              onChange={(e) => setPlanningYear(String(e.target.value || currentYear))}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", outline: "none", background: "#fff" }}
            >
              {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <Button variant="ghost" onClick={() => planningQ.refetch()} disabled={planningQ.isLoading || planningQ.isFetching}>Recargar</Button>
            <Button onClick={() => planningSaveM.mutate()} disabled={planningSaveM.isPending || planningQ.isLoading}>
              {planningSaveM.isPending ? "Guardando..." : "Guardar planificación"}
            </Button>
          </div>
        </div>
      </div>

      <div className="spacer" />
      <div className="card" style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div><div className="muted">Capacidad total</div><div style={{ fontWeight: 900, fontSize: 24 }}>{summary.totalCapacity}</div></div>
        <div><div className="muted">Comprometidos</div><div style={{ fontWeight: 900, fontSize: 24 }}>{summary.totalCommitted}</div></div>
        <div><div className="muted">Disponible</div><div style={{ fontWeight: 900, fontSize: 24 }}>{summary.totalAvailable}</div></div>
      </div>

      <div className="spacer" />
      <div className="card">
        {planningQ.isLoading && <div className="muted">Cargando planificación...</div>}
        {planningQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{planningQ.error.message}</div>}
        {!planningQ.isLoading && !planningDraft.length && <div className="muted">Sin semanas cargadas para este año.</div>}

        {!planningQ.isLoading && !!planningDraft.length && (
          <table>
            <thead>
              <tr>
                <th>Semana</th>
                <th>Desde</th>
                <th>Hasta</th>
                <th className="right">Capacidad</th>
                <th className="right">Comprometidos</th>
                <th className="right">Disponible</th>
              </tr>
            </thead>
            <tbody>
              {planningDraft.map((row) => {
                const week = Number(row.week_number || row.week || 0);
                const capacity = Math.max(0, Number(String(row.capacity_input ?? row.capacity ?? 0).replace(",", ".")) || 0);
                const committed = Math.max(0, Number(row.committed_count || 0));
                const available = Math.max(0, Number(row.available ?? (capacity - committed)) || 0);
                return (
                  <tr key={`${planningYear}-${week}`}>
                    <td>Semana {week}</td>
                    <td>{fmtDate(row.start_date)}</td>
                    <td>{fmtDate(row.end_date)}</td>
                    <td className="right">
                      <input
                        type="number"
                        min="0"
                        value={row.capacity_input ?? row.capacity ?? 0}
                        onChange={(e) => {
                          const nextValue = String(e.target.value || "0");
                          setPlanningDraft((prev) => prev.map((item) => Number(item.week_number || item.week || 0) === week ? { ...item, capacity_input: nextValue } : item));
                        }}
                        style={{ width: 110, textAlign: "right", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", outline: "none" }}
                      />
                    </td>
                    <td className="right">{committed}</td>
                    <td className="right">{available}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
