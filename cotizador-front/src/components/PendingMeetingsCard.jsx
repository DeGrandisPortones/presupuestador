import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listMeetSlots } from "../api/meetScheduling.js";
import Button from "../ui/Button.jsx";

const TEAL = "#01A39F";
const PETROL = "#005060";
const GOLD = "#CDA800";

function CalendarIcon({ size = 16, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function formatMeetingDateTime(iso) {
  return new Date(iso).toLocaleString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Misma referencia de fecha local que usa MeetSchedulingPage (dayKeyLocal) para poder
// pasarle ?dia=YYYY-MM-DD y que esa pantalla haga scroll al dia correcto.
function dayKeyLocal(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Resumen compacto de reuniones de Meet ya agendadas, para que el tecnico las vea sin
// salir de la pantalla de Consultas Tecnicas. El detalle completo (crear horarios,
// cancelar, reglas recurrentes) sigue viviendo solo en /servicio-tecnico/calendario-meet -
// esta tarjeta es de solo lectura + acceso rapido, no duplica esa pantalla.
export default function PendingMeetingsCard() {
  const navigate = useNavigate();
  // "now" se guarda en estado (no se llama Date.now() directo en el render/memo, que
  // rompe la regla de pureza de React) y se refresca cada 30s, junto con el refetch de
  // slots, asi las reuniones que ya pasaron se sacan solas de la lista.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const slotsQ = useQuery({
    queryKey: ["meetSlots"],
    queryFn: () => listMeetSlots({}),
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const upcomingMeetings = useMemo(() => {
    const slots = slotsQ.data || [];
    return slots
      .filter((s) => s.status === "booked" && new Date(s.start_at).getTime() > nowMs)
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
      .slice(0, 5);
  }, [slotsQ.data, nowMs]);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `${TEAL}1A`, color: TEAL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <CalendarIcon size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15, color: "var(--dg-petrol)" }}>Reuniones pendientes (Meet)</div>
            <div className="muted" style={{ fontSize: 12 }}>Próximas reuniones agendadas por clientes</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => navigate("/servicio-tecnico/calendario-meet?vista=calendario")}>
            Ver como calendario
          </Button>
          <Button variant="secondary" onClick={() => navigate("/servicio-tecnico/calendario-meet")}>
            Abrir Calendario de Meet
          </Button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {slotsQ.isLoading ? <div className="muted" style={{ fontSize: 13 }}>Cargando…</div> : null}
        {!slotsQ.isLoading && !upcomingMeetings.length ? (
          <div className="muted" style={{ fontSize: 13 }}>No hay reuniones agendadas próximamente.</div>
        ) : null}
        {upcomingMeetings.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {upcomingMeetings.map((meeting) => (
              <button
                key={meeting.id}
                type="button"
                onClick={() => navigate(`/servicio-tecnico/calendario-meet?dia=${dayKeyLocal(meeting.start_at)}`)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap",
                  border: "1px solid var(--dg-border)", borderLeft: `4px solid ${GOLD}`, borderRadius: 8, padding: "8px 12px",
                  background: "var(--dg-card)", cursor: "pointer", width: "100%", textAlign: "left", font: "inherit",
                }}
                title="Ver este día en el calendario"
              >
                <div style={{ fontWeight: 700, fontSize: 13, textTransform: "capitalize" }}>{formatMeetingDateTime(meeting.start_at)} hs</div>
                <div className="muted" style={{ fontSize: 13 }}>{meeting.client_name}</div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
