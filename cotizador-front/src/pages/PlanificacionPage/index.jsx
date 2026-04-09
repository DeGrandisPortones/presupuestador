import { useEffect, useState } from "react";
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

function rowCommentText(row) {
  return String(
    row?.comment_input ?? row?.comment ?? row?.comments ?? row?.notes ?? "",
  );
}

export default function PlanificacionPage() {
  const user = useAuthStore((s) => s.user);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, idx) => String(currentYear - 1 + idx));
  const [planningYear, setPlanningYear] = useState(String(currentYear));
  const [planningDraft, setPlanningDraft] = useState([]);

  const canAccess = !!(user?.is_superuser || user?.is_enc_comercial);

  const planningQ = useQuery({
    queryKey: ["admin", "production-planning", planningYear],
    queryFn: () => adminGetProductionPlanning(Number(planningYear || currentYear)),
    enabled: canAccess,
  });

  const planningSaveM = useMutation({
    mutationFn: async () => {
      return adminSaveProductionPlanning({
        year: Number(planningYear || currentYear),
        weeks: planningDraft.map((row) => ({
          week_number: Number(row.week_number || row.week || 0),
          capacity: Math.max(0, Number(String(row.capacity_input ?? row.capacity ?? 0).replace(",", ".")) || 0),
          comment: rowCommentText(row),
        })),
      });
    },
    onSuccess: (planning) => {
      setPlanningDraft(
        (planning?.weeks || []).map((row) => ({
          ...row,
          capacity_input: String(row.capacity ?? 0),
          comment_input: rowCommentText(row),
        })),
      );
      toast.success("Planificación guardada.");
      planningQ.refetch();
    },
    onError: (e) => {
      toast.error(e?.message || "No se pudo guardar la planificación.");
    },
  });

  useEffect(() => {
    if (!planningQ.data?.weeks) return;
    setPlanningDraft(
      planningQ.data.weeks.map((row) => ({
        ...row,
        capacity_input: String(row.capacity ?? 0),
        comment_input: rowCommentText(row),
      })),
    );
  }, [planningQ.data]);

  if (!canAccess) {
    return <div className="container"><div className="card">No autorizado.</div></div>;
  }

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>Planificación</h2>
        <div className="muted">Capacidad de producción por semana.</div>
      </div>

      <div className="spacer" />

      <div className="card">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
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
                <th>Comentarios</th>
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
                    <td>
                      <input
                        type="text"
                        value={rowCommentText(row)}
                        onChange={(e) => {
                          const nextValue = String(e.target.value || "");
                          setPlanningDraft((prev) => prev.map((item) => Number(item.week_number || item.week || 0) === week ? { ...item, comment_input: nextValue } : item));
                        }}
                        style={{ width: "100%", minWidth: 220, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", outline: "none" }}
                        placeholder="Comentario de la semana"
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
