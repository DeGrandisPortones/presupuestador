import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createPublicMeetBooking, getPublicMeetAvailability } from "../../api/meetScheduling.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

const TEAL = "#01A39F";
const PETROL = "#005060";

function Icon({ children, size = 18, color, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {children}
    </svg>
  );
}
const CalendarIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="18" rx="3" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </Icon>
);
const ClockIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </Icon>
);
const CheckCircleIcon = (props) => (
  <Icon {...props}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </Icon>
);

function Card({ title, icon, children }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {title ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          {icon ? (
            <div style={{ width: 32, height: 32, borderRadius: 9, background: `${TEAL}1A`, color: TEAL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {icon}
            </div>
          ) : null}
          <div style={{ fontWeight: 900, fontSize: 15, color: PETROL }}>{title}</div>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function groupSlotsByDay(slots) {
  const groups = new Map();
  for (const slot of slots) {
    const dayKey = new Date(slot.start_at).toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    if (!groups.has(dayKey)) groups.set(dayKey, []);
    groups.get(dayKey).push(slot);
  }
  return Array.from(groups.entries());
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function formatFullDateTime(iso) {
  return new Date(iso).toLocaleString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MeetPublicSchedulingPage() {
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");

  const availabilityQ = useQuery({ queryKey: ["publicMeetAvailability"], queryFn: getPublicMeetAvailability });

  const bookM = useMutation({
    mutationFn: () =>
      createPublicMeetBooking({
        slot_id: selectedSlotId,
        client_name: clientName,
        client_phone: clientPhone,
        client_email: clientEmail,
        reference_number: referenceNumber,
        notes,
      }),
  });

  const slots = availabilityQ.data?.slots || [];
  const technicianName = availabilityQ.data?.technicianName || "";
  const groupedSlots = useMemo(() => groupSlotsByDay(slots), [slots]);
  const selectedSlot = slots.find((s) => String(s.id) === String(selectedSlotId)) || null;

  if (bookM.isSuccess) {
    const booking = bookM.data;
    return (
      <div className="container" style={{ maxWidth: 600, margin: "0 auto", padding: "24px 12px" }}>
        <div className="card" style={{ textAlign: "center", padding: "32px 24px" }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: "#e6f7f5", color: TEAL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <CheckCircleIcon size={30} />
          </div>
          <h2 style={{ marginTop: 0, marginBottom: 10, color: PETROL }}>¡Reunión agendada!</h2>
          <div style={{ marginBottom: 16 }}>
            Tu reunión por Google Meet quedó confirmada para el{" "}
            <b>{formatFullDateTime(booking.start_at)} hs</b>.
          </div>
          {booking.meet_link ? (
            <div style={{ marginBottom: 12, background: "var(--dg-bg)", borderRadius: 10, padding: 14 }}>
              <div className="muted" style={{ marginBottom: 6 }}>Link de la reunión:</div>
              <a href={booking.meet_link} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: TEAL }}>
                {booking.meet_link}
              </a>
            </div>
          ) : (
            <div className="muted" style={{ marginBottom: 12 }}>
              En breve te vamos a compartir el link de la reunión por Google Meet.
            </div>
          )}
          <div className="muted" style={{ fontSize: 13 }}>
            Te recomendamos agendar este horario en tu calendario personal.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 700, margin: "0 auto", padding: "24px 12px" }}>
      <div
        className="card"
        style={{
          marginBottom: 16,
          background: `linear-gradient(135deg, ${PETROL} 0%, ${TEAL} 100%)`,
          color: "#fff",
          border: "none",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <CalendarIcon size={24} color="#fff" />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 19 }}>Agendá tu reunión por Google Meet</h2>
          <div style={{ opacity: 0.9, fontSize: 13, marginTop: 4 }}>
            Elegí un horario disponible para reunirte por videollamada con
            {technicianName ? ` ${technicianName}, del` : " el"} servicio técnico de De Grandis Portones.
          </div>
        </div>
      </div>

      {availabilityQ.isLoading ? (
        <Card><div className="muted">Cargando horarios disponibles...</div></Card>
      ) : null}

      {availabilityQ.isError ? (
        <Card><div style={{ color: "#d93025" }}>{availabilityQ.error?.message || "No se pudo cargar la disponibilidad"}</div></Card>
      ) : null}

      {!availabilityQ.isLoading && !slots.length ? (
        <Card><div className="muted">No hay horarios disponibles por el momento. Consultá con tu vendedor/a.</div></Card>
      ) : null}

      {!selectedSlotId && groupedSlots.length ? (
        <Card title="Horarios disponibles" icon={<ClockIcon size={16} />}>
          {groupedSlots.map(([dayLabel, daySlots]) => (
            <div key={dayLabel} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 800, marginBottom: 8, textTransform: "capitalize", color: PETROL, fontSize: 13.5 }}>{dayLabel}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {daySlots.map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedSlotId(slot.id)}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 999,
                      border: `1.5px solid ${TEAL}`,
                      background: "#fff",
                      color: PETROL,
                      cursor: "pointer",
                      fontWeight: 700,
                      transition: "all 120ms ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = TEAL; e.currentTarget.style.color = "#fff"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = PETROL; }}
                  >
                    {formatTime(slot.start_at)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Card>
      ) : null}

      {selectedSlotId && selectedSlot ? (
        <Card title="Confirmá tu reunión" icon={<CalendarIcon size={16} />}>
          <div style={{ marginBottom: 16, background: "var(--dg-bg)", borderRadius: 10, padding: "10px 14px" }}>
            Horario elegido: <b>{formatFullDateTime(selectedSlot.start_at)} hs</b>{" "}
            <button
              onClick={() => setSelectedSlotId(null)}
              style={{ background: "none", border: "none", color: TEAL, cursor: "pointer", textDecoration: "underline", fontWeight: 700 }}
            >
              cambiar
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Nombre y apellido *</div>
              <Input value={clientName} onChange={setClientName} style={{ width: "100%" }} />
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Teléfono</div>
                <Input value={clientPhone} onChange={setClientPhone} style={{ width: "100%" }} />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Email</div>
                <Input value={clientEmail} onChange={setClientEmail} style={{ width: "100%" }} />
              </div>
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>N° de pedido/presupuesto (opcional)</div>
              <Input value={referenceNumber} onChange={setReferenceNumber} style={{ width: "100%" }} />
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Motivo de la consulta (opcional)</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input"
                rows={3}
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>

            <div>
              <Button
                disabled={!clientName.trim() || bookM.isPending}
                onClick={() => bookM.mutate()}
              >
                {bookM.isPending ? "Confirmando..." : "Confirmar reunión"}
              </Button>
              {bookM.error ? (
                <div style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>{bookM.error.message}</div>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
