import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getMeetSchedulingSettings, listMeetSlots } from "../api/meetScheduling.js";
import { hasReminderFired, markReminderFired } from "../utils/meetReminders.js";
import Button from "../ui/Button.jsx";

const TEAL = "#01A39F";
const PETROL = "#005060";
const GOLD = "#CDA800";
// Se avisa en estos umbrales (minutos antes de la reunion), de mayor a menor.
const REMINDER_THRESHOLDS_MIN = [10, 5];
const TOAST_AUTO_DISMISS_MS = 30000;

function dayKeyLocal(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function BellIcon({ size = 16, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function ReminderToast({ toast, onDismiss, onGoTo }) {
  return (
    <div
      style={{
        width: 320,
        background: "#fff",
        border: `1px solid ${GOLD}`,
        borderLeft: `5px solid ${GOLD}`,
        borderRadius: 12,
        boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ width: 26, height: 26, borderRadius: 999, background: `${GOLD}22`, color: GOLD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <BellIcon size={14} />
        </div>
        <div style={{ fontWeight: 900, color: PETROL, fontSize: 14 }}>
          En {toast.minutes} min: reunión de Meet
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{toast.clientName}</div>
      {toast.clientPhone ? <div className="muted" style={{ fontSize: 12 }}>Tel: {toast.clientPhone}</div> : null}
      {toast.referenceNumber ? <div className="muted" style={{ fontSize: 12 }}>Ref: {toast.referenceNumber}</div> : null}
      {toast.meetLink ? (
        <div style={{ marginTop: 8 }}>
          <a href={toast.meetLink} target="_blank" rel="noreferrer" style={{ color: TEAL, fontWeight: 700, fontSize: 13 }}>
            Abrir Google Meet
          </a>
        </div>
      ) : null}
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={onGoTo}>Ver en calendario</Button>
        <Button variant="ghost" onClick={onDismiss}>Cerrar</Button>
      </div>
    </div>
  );
}

// Vigila las reuniones ya agendadas y avisa al tecnico 10 y 5 minutos antes de cada
// una, con los datos del cliente y el link de Meet para poder unirse. Doble canal:
// notificacion nativa del navegador (si el tecnico dio el permiso) + un toast dentro
// de la propia app (funciona siempre, sin depender de ese permiso). No manda nada al
// cliente - eso quedo pendiente de definir un canal (email/WhatsApp) mas adelante.
export default function MeetMeetingReminderWatcher() {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 20000);
    return () => clearInterval(id);
  }, []);

  const slotsQ = useQuery({ queryKey: ["meetSlots"], queryFn: () => listMeetSlots({}), refetchInterval: 20000 });
  const settingsQ = useQuery({ queryKey: ["meetSchedulingSettings"], queryFn: getMeetSchedulingSettings });

  useEffect(() => {
    const slots = slotsQ.data || [];
    if (!slots.length) return;
    const meetLink = settingsQ.data?.meet_link || null;

    const newToasts = [];
    for (const slot of slots) {
      if (slot.status !== "booked") continue;
      const minutesUntil = (new Date(slot.start_at).getTime() - nowMs) / 60000;
      if (minutesUntil < 0) continue;

      for (const threshold of REMINDER_THRESHOLDS_MIN) {
        if (minutesUntil > threshold) continue;
        if (hasReminderFired(slot.id, threshold)) continue;
        markReminderFired(slot.id, threshold);

        const dayKey = dayKeyLocal(slot.start_at);
        const toast = {
          id: `${slot.id}-${threshold}`,
          minutes: threshold,
          clientName: slot.client_name,
          clientPhone: slot.client_phone,
          referenceNumber: slot.reference_number,
          meetLink,
          dayKey,
        };
        newToasts.push(toast);

        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            const body = [slot.client_name, slot.client_phone].filter(Boolean).join(" · ");
            const notif = new Notification(`En ${threshold} minutos tenés una reunión de Meet`, { body });
            notif.onclick = () => {
              window.focus();
              navigate(`/servicio-tecnico/calendario-meet?dia=${dayKey}`);
            };
          } catch {
            // Notification puede fallar en contextos sin soporte real (ej. ciertas
            // vistas previas embebidas) - el toast en pantalla sigue funcionando igual.
          }
        }
      }
    }

    // El setState se difiere a un callback (en vez de llamarse sincronicamente en el
    // cuerpo del efecto) para no disparar renders en cascada durante el propio commit.
    if (newToasts.length) {
      window.setTimeout(() => {
        setToasts((prev) => [...prev, ...newToasts]);
        for (const toast of newToasts) {
          window.setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== toast.id));
          }, TOAST_AUTO_DISMISS_MS);
        }
      }, 0);
    }
  }, [slotsQ.data, settingsQ.data, nowMs, navigate]);

  if (!toasts.length) return null;

  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 6000, display: "flex", flexDirection: "column", gap: 10 }}>
      {toasts.map((toast) => (
        <ReminderToast
          key={toast.id}
          toast={toast}
          onDismiss={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
          onGoTo={() => {
            navigate(`/servicio-tecnico/calendario-meet?dia=${toast.dayKey}`);
            setToasts((prev) => prev.filter((t) => t.id !== toast.id));
          }}
        />
      ))}
    </div>
  );
}
