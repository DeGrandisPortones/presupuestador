import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  cancelMeetBooking,
  createMeetRecurringRule,
  createMeetSlot,
  deleteMeetRecurringRule,
  deleteMeetSlot,
  getMeetSchedulingSettings,
  listMeetRecurringRules,
  listMeetSlots,
  updateMeetRecurringRule,
  updateMeetSchedulingSettings,
} from "../../api/meetScheduling.js";
import { markMeetBookingsSeenNow } from "../../utils/meetBookingNotifications.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

const DURATION_OPTIONS = [15, 30, 45, 60];
// Tolerancia de union: si una reunion reservada pasa este tiempo desde su horario sin
// que se haya cancelado, se la marca como "posible ausencia" en la lista. Es solo un
// aviso basado en el reloj - la app no tiene forma de saber si el cliente realmente
// entro a la videollamada de Google Meet (eso ocurre fuera del sistema).
const MEETING_JOIN_TOLERANCE_MINUTES = 5;
const WARNING_RED = "#d93025";
const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAY_LABELS_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Paleta institucional (misma que src/styles.css :root) - se repite aca en JS porque
// necesitamos mezclar el color con alpha (ej. fondos tenues de iconos) en estilos
// inline, algo que un var(--dg-teal) de CSS no permite hacer directo en JS.
const TEAL = "#01A39F";
const PETROL = "#005060";
const GOLD = "#CDA800";
const GRAY = "#515859";

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
const LinkIcon = (props) => (
  <Icon {...props}>
    <path d="M9 17H7a5 5 0 0 1 0-10h2" />
    <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </Icon>
);
const SettingsIcon = (props) => (
  <Icon {...props}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <circle cx="14" cy="6" r="2" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <circle cx="8" cy="12" r="2" />
    <line x1="4" y1="18" x2="20" y2="18" />
    <circle cx="16" cy="18" r="2" />
  </Icon>
);
const RepeatIcon = (props) => (
  <Icon {...props}>
    <path d="M17 1l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 23l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </Icon>
);
const PlusCircleIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </Icon>
);
const ClockIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </Icon>
);
const UserIcon = (props) => (
  <Icon {...props}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
);
const InboxIcon = (props) => (
  <Icon {...props}>
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </Icon>
);
const ChevronLeftIcon = (props) => (
  <Icon {...props}><polyline points="15 18 9 12 15 6" /></Icon>
);
const ChevronRightIcon = (props) => (
  <Icon {...props}><polyline points="9 18 15 12 9 6" /></Icon>
);
const ListIcon = (props) => (
  <Icon {...props}>
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </Icon>
);
const AlertTriangleIcon = (props) => (
  <Icon {...props}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </Icon>
);

function SectionCard({ icon, accent = TEAL, title, subtitle, children }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {(icon || title) ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: subtitle ? 4 : 12 }}>
          {icon ? (
            <div
              style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                background: `${accent}1A`, color: accent,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {icon}
            </div>
          ) : null}
          <div style={{ fontWeight: 900, fontSize: 15, color: PETROL }}>{title}</div>
        </div>
      ) : null}
      {subtitle ? <div className="muted" style={{ marginBottom: 12 }}>{subtitle}</div> : null}
      {children}
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 0", color: GRAY, opacity: 0.7 }}>
      {icon}
      <div style={{ fontSize: 13 }}>{text}</div>
    </div>
  );
}

function publicBookingUrl() {
  return `${window.location.origin}/agendar-meet-tecnico`;
}

function todayDateInputValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

// "YYYY-MM-DD" en el huso horario del navegador (misma referencia que usa
// toLocaleDateString mas abajo) - sirve para matchear entre la tarjeta de "Reuniones
// pendientes", el query param ?dia= y las celdas del calendario mensual.
function dayKeyLocal(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function groupSlotsByDay(slots) {
  const groups = new Map();
  for (const slot of slots) {
    const ymd = dayKeyLocal(slot.start_at);
    if (!groups.has(ymd)) {
      groups.set(ymd, {
        ymd,
        label: new Date(slot.start_at).toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }),
        slots: [],
      });
    }
    groups.get(ymd).slots.push(slot);
  }
  return Array.from(groups.values()).sort((a, b) => a.ymd.localeCompare(b.ymd));
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function weekdaysLabel(weekdays) {
  const sorted = [...(weekdays || [])].sort();
  return sorted.map((d) => WEEKDAY_LABELS_LONG[d]).join(", ");
}

// Confirmacion en la misma pantalla en vez de window.confirm(): en algunos entornos
// embebidos (ej. una vista previa dentro de un editor) los dialogos nativos del
// navegador quedan bloqueados o se auto-cierran sin que el usuario pueda tocar
// "Aceptar", y el click termina sin hacer nada (sin ningun error visible tampoco).
function ConfirmInline({ text, onConfirm, onCancel, pending }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{text}</span>
      <Button variant="secondary" disabled={pending} onClick={onConfirm}>
        {pending ? "..." : "Sí"}
      </Button>
      <Button variant="ghost" disabled={pending} onClick={onCancel}>No</Button>
    </div>
  );
}

function WeekdayToggle({ selected, onToggle }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {WEEKDAY_LABELS.map((label, idx) => {
        const active = selected.includes(idx);
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onToggle(idx)}
            style={{
              width: 46,
              padding: "9px 0",
              borderRadius: 999,
              border: active ? `1px solid ${TEAL}` : "1px solid var(--dg-border)",
              background: active ? TEAL : "#fff",
              color: active ? "#fff" : GRAY,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 13,
              transition: "all 120ms ease",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// Fila de un horario (disponible o reservado), con sus acciones de confirmar-eliminar /
// confirmar-cancelar. Se reusa tanto en la vista de Lista (agrupada por dia) como en el
// detalle del dia seleccionado dentro de la vista de Calendario - misma UI, misma logica,
// una sola vez.
function SlotRow({ slot, nowMs, confirmDeleteSlotId, confirmCancelSlotId, setConfirmDeleteSlotId, setConfirmCancelSlotId, deleteSlotM, cancelBookingM }) {
  const isBooked = slot.status === "booked";
  const isOverdue = isBooked && new Date(slot.start_at).getTime() + MEETING_JOIN_TOLERANCE_MINUTES * 60000 < nowMs;
  const accent = isOverdue ? WARNING_RED : isBooked ? GOLD : TEAL;
  return (
    <div
      style={{
        border: "1px solid var(--dg-border)",
        borderLeft: `4px solid ${accent}`,
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        background: isOverdue ? "#fdecea" : "#fff",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <ClockIcon size={15} color={accent} />
          <b style={{ fontSize: 15 }}>{formatTime(slot.start_at)}</b>
          <span className="muted">({slot.duration_minutes} min)</span>
          {slot.source_rule_id ? (
            <span className="muted" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 3 }}>
              <RepeatIcon size={11} /> automático
            </span>
          ) : null}
          <span
            style={{
              fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3,
              color: accent, background: `${accent}1A`, padding: "2px 8px", borderRadius: 999,
            }}
          >
            {isBooked ? "Reservado" : "Disponible"}
          </span>
          {isOverdue ? (
            <span
              style={{
                fontSize: 11, fontWeight: 800, color: WARNING_RED, background: `${WARNING_RED}1A`,
                padding: "2px 8px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 4,
              }}
              title="Pasó el horario + tolerancia. Esto es un aviso por reloj, no una confirmación real de que el cliente no se unió (la app no tiene forma de saber si entró a Meet)."
            >
              <AlertTriangleIcon size={11} />
              Pasaron los {MEETING_JOIN_TOLERANCE_MINUTES} min de tolerancia
            </span>
          ) : null}
        </div>
        {isBooked ? (
          <div style={{ fontSize: 13, marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
              <UserIcon size={13} color={GRAY} />
              {slot.client_name}
            </div>
            {slot.client_phone ? <div className="muted">Tel: {slot.client_phone}</div> : null}
            {slot.client_email ? <div className="muted">Email: {slot.client_email}</div> : null}
            {slot.reference_number ? <div className="muted">Ref: {slot.reference_number}</div> : null}
            {slot.booking_notes ? <div className="muted">Nota: {slot.booking_notes}</div> : null}
          </div>
        ) : null}
      </div>
      <div>
        {isBooked ? (
          confirmCancelSlotId === slot.id ? (
            <ConfirmInline
              text="¿Cancelar esta reserva?"
              pending={cancelBookingM.isPending}
              onConfirm={() => cancelBookingM.mutate(slot.booking_id)}
              onCancel={() => setConfirmCancelSlotId(null)}
            />
          ) : (
            <Button variant="secondary" onClick={() => setConfirmCancelSlotId(slot.id)}>
              Cancelar reserva
            </Button>
          )
        ) : confirmDeleteSlotId === slot.id ? (
          <ConfirmInline
            text="¿Eliminar este horario?"
            pending={deleteSlotM.isPending}
            onConfirm={() => deleteSlotM.mutate(slot.id)}
            onCancel={() => setConfirmDeleteSlotId(null)}
          />
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDeleteSlotId(slot.id)}>
            Eliminar
          </Button>
        )}
      </div>
    </div>
  );
}

// Vista de calendario mensual: rejilla de dias con la cantidad de reuniones marcada en
// cada uno. Tocar un dia con reuniones lo selecciona (el detalle se muestra afuera, en
// el componente padre, reusando SlotRow) - este componente no conoce los horarios en si,
// solo cuenta y arma la grilla.
function CalendarMonthGrid({ slots, selectedDay, onSelectDay, initialMonthKey }) {
  const [monthDate, setMonthDate] = useState(() => {
    if (initialMonthKey) {
      const [y, m] = initialMonthKey.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const countsByDay = useMemo(() => {
    const map = new Map();
    for (const s of slots) {
      if (s.status !== "booked") continue;
      const key = dayKeyLocal(s.start_at);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [slots]);

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dayKeyLocal(new Date().toISOString());

  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  const monthLabel = monthDate.toLocaleDateString("es-AR", { month: "long", year: "numeric" });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
        <button
          type="button"
          onClick={() => setMonthDate(new Date(year, month - 1, 1))}
          style={{ border: "1px solid var(--dg-border)", background: "#fff", borderRadius: 8, padding: 6, cursor: "pointer", display: "flex" }}
          aria-label="Mes anterior"
        >
          <ChevronLeftIcon size={16} color={PETROL} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 900, textTransform: "capitalize", color: PETROL, fontSize: 15 }}>{monthLabel}</div>
          {todayKey.slice(0, 7) !== `${year}-${String(month + 1).padStart(2, "0")}` ? (
            <button
              type="button"
              onClick={() => setMonthDate(new Date(todayKey.split("-")[0], Number(todayKey.split("-")[1]) - 1, 1))}
              style={{ border: `1px solid ${TEAL}`, color: TEAL, background: "#fff", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
            >
              Hoy
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setMonthDate(new Date(year, month + 1, 1))}
          style={{ border: "1px solid var(--dg-border)", background: "#fff", borderRadius: 8, padding: 6, cursor: "pointer", display: "flex" }}
          aria-label="Mes siguiente"
        >
          <ChevronRightIcon size={16} color={PETROL} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: GRAY, padding: "4px 0" }}>
            {label}
          </div>
        ))}
        {cells.map((dayNum, idx) => {
          if (dayNum === null) return <div key={`blank-${idx}`} />;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
          const count = countsByDay.get(key) || 0;
          const isToday = key === todayKey;
          const isSelected = key === selectedDay;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(key)}
              title={count ? `${count} reunión(es) agendada(s)` : "Cargar un horario puntual este día"}
              style={{
                aspectRatio: "1 / 1",
                borderRadius: 10,
                border: isSelected ? `2px solid ${TEAL}` : isToday ? `1.5px solid ${PETROL}` : "1px solid var(--dg-border)",
                background: isSelected ? `${TEAL}1A` : "#fff",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                padding: 2,
                position: "relative",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: isToday ? 900 : 600, color: isToday ? PETROL : "#333" }}>{dayNum}</span>
              {count ? (
                <span
                  style={{
                    fontSize: 10, fontWeight: 800, color: "#fff", background: GOLD,
                    borderRadius: 999, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
                  }}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 11.5, color: GRAY }}>
        <span style={{ width: 14, height: 14, borderRadius: 999, background: GOLD, color: "#fff", fontWeight: 800, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
          1
        </span>
        <span>cantidad de reuniones agendadas ese día · tocá cualquier día para ver el detalle o cargar un horario</span>
      </div>
    </div>
  );
}

function RecurringRulesCard() {
  const queryClient = useQueryClient();
  const [selectedWeekdays, setSelectedWeekdays] = useState([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [duration, setDuration] = useState(30);
  const [confirmDeleteRuleId, setConfirmDeleteRuleId] = useState(null);

  const rulesQ = useQuery({ queryKey: ["meetRecurringRules"], queryFn: listMeetRecurringRules });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["meetRecurringRules"] });
    queryClient.invalidateQueries({ queryKey: ["meetSlots"] });
  };

  const createRuleM = useMutation({
    mutationFn: () => createMeetRecurringRule({ weekdays: selectedWeekdays, start_time: startTime, end_time: endTime, slot_duration_minutes: Number(duration) }),
    onSuccess: () => {
      setSelectedWeekdays([]);
      setStartTime("");
      setEndTime("");
      invalidateAll();
    },
  });

  const toggleActiveM = useMutation({
    mutationFn: ({ id, active }) => updateMeetRecurringRule(id, { active }),
    onSuccess: invalidateAll,
  });

  const deleteRuleM = useMutation({
    mutationFn: (id) => deleteMeetRecurringRule(id),
    onSuccess: () => {
      setConfirmDeleteRuleId(null);
      invalidateAll();
    },
  });

  const rules = rulesQ.data || [];

  return (
    <SectionCard
      icon={<RepeatIcon size={18} />}
      accent={TEAL}
      title="Horarios recurrentes"
      subtitle={'Definí una regla (ej. "martes y jueves de 14 a 18") y se generan automáticamente los horarios disponibles para los próximos 30 días. Podés crear varias, pausarlas o borrarlas cuando quieras — no afecta los horarios puntuales que cargues a mano.'}
    >
      <div style={{ marginBottom: 14 }}>
        <div className="muted" style={{ marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Días</div>
        <WeekdayToggle
          selected={selectedWeekdays}
          onToggle={(idx) => setSelectedWeekdays((prev) => (prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]))}
        />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div className="muted" style={{ marginBottom: 6 }}>Desde</div>
          <Input type="time" value={startTime} onChange={setStartTime} />
        </div>
        <div>
          <div className="muted" style={{ marginBottom: 6 }}>Hasta</div>
          <Input type="time" value={endTime} onChange={setEndTime} />
        </div>
        <div>
          <div className="muted" style={{ marginBottom: 6 }}>Duración por turno</div>
          <select value={duration} onChange={(e) => setDuration(e.target.value)} className="input" style={{ padding: "10px 12px" }}>
            {DURATION_OPTIONS.map((d) => (
              <option key={d} value={d}>{d} min</option>
            ))}
          </select>
        </div>
        <Button
          disabled={!selectedWeekdays.length || !startTime || !endTime || createRuleM.isPending}
          onClick={() => createRuleM.mutate()}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <PlusCircleIcon size={15} />
            {createRuleM.isPending ? "Agregando..." : "Agregar regla"}
          </span>
        </Button>
      </div>
      {createRuleM.error ? (
        <div style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>{createRuleM.error.message}</div>
      ) : null}

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
        {rulesQ.isLoading ? <div className="muted">Cargando reglas...</div> : null}
        {!rulesQ.isLoading && !rules.length ? (
          <EmptyState icon={<RepeatIcon size={22} color={GRAY} />} text="Todavía no hay reglas recurrentes." />
        ) : null}
        {rules.map((rule) => (
          <div
            key={rule.id}
            style={{
              border: "1px solid var(--dg-border)",
              borderLeft: `4px solid ${rule.active ? TEAL : "var(--dg-border)"}`,
              borderRadius: 10,
              padding: "10px 12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              opacity: rule.active ? 1 : 0.6,
              background: "#fff",
            }}
          >
            <div>
              <b style={{ textTransform: "capitalize" }}>{weekdaysLabel(rule.weekdays)}</b>{" "}
              <span className="muted">
                de {rule.start_time.slice(0, 5)} a {rule.end_time.slice(0, 5)}, turnos de {rule.slot_duration_minutes} min
              </span>
              {!rule.active ? (
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: GOLD, textTransform: "uppercase", letterSpacing: 0.3 }}>
                  Pausada
                </span>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="secondary"
                disabled={toggleActiveM.isPending}
                onClick={() => toggleActiveM.mutate({ id: rule.id, active: !rule.active })}
              >
                {rule.active ? "Pausar" : "Reactivar"}
              </Button>
              {confirmDeleteRuleId === rule.id ? (
                <ConfirmInline
                  text="¿Eliminar esta regla?"
                  pending={deleteRuleM.isPending}
                  onConfirm={() => deleteRuleM.mutate(rule.id)}
                  onCancel={() => setConfirmDeleteRuleId(null)}
                />
              ) : (
                <Button variant="ghost" onClick={() => setConfirmDeleteRuleId(rule.id)}>
                  Eliminar
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      {deleteRuleM.error ? (
        <div style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>{deleteRuleM.error.message}</div>
      ) : null}
    </SectionCard>
  );
}

export default function MeetSchedulingPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [linkForm, setLinkForm] = useState(null);
  const [newDate, setNewDate] = useState(todayDateInputValue());
  const [newTime, setNewTime] = useState("");
  const [newDuration, setNewDuration] = useState(30);
  const [copied, setCopied] = useState(false);
  const [confirmDeleteSlotId, setConfirmDeleteSlotId] = useState(null);
  const [confirmCancelSlotId, setConfirmCancelSlotId] = useState(null);
  // Para el aviso de "pasaron los X min de tolerancia" en SlotRow - se guarda en estado
  // (no se llama Date.now() directo en el render) y se refresca cada 30s.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Dos formas de llegar desde afuera (ej. la tarjeta de "Reuniones pendientes" en
  // Consultas Tecnicas): ?vista=calendario abre directo la vista de calendario mensual;
  // ?dia=YYYY-MM-DD (en la vista de lista) hace scroll y resalta ese dia puntual.
  const [viewMode, setViewMode] = useState(() => (searchParams.get("vista") === "calendario" ? "calendario" : "lista"));
  const diaParam = searchParams.get("dia");
  const [selectedDay, setSelectedDay] = useState(null);
  const [highlightedDay, setHighlightedDay] = useState(diaParam || null);
  const dayRefs = useRef({});

  useEffect(() => {
    markMeetBookingsSeenNow();
    queryClient.invalidateQueries({ queryKey: ["meetBookingsCountSince"] });
  }, [queryClient]);

  const settingsQ = useQuery({ queryKey: ["meetSchedulingSettings"], queryFn: getMeetSchedulingSettings });
  const slotsQ = useQuery({ queryKey: ["meetSlots"], queryFn: () => listMeetSlots({}), refetchInterval: 20000 });

  const settings = settingsQ.data || {};
  const meetLinkValue = linkForm?.meet_link ?? settings.meet_link ?? "";
  const technicianNameValue = linkForm?.technician_name ?? settings.technician_name ?? "";

  const saveSettingsM = useMutation({
    mutationFn: () => updateMeetSchedulingSettings({ meet_link: meetLinkValue, technician_name: technicianNameValue }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["meetSchedulingSettings"], saved);
      setLinkForm(null);
    },
  });

  const createSlotM = useMutation({
    mutationFn: () => {
      const startAtLocal = new Date(`${newDate}T${newTime}:00`);
      return createMeetSlot({ start_at: startAtLocal.toISOString(), duration_minutes: Number(newDuration) });
    },
    onSuccess: () => {
      setNewTime("");
      queryClient.invalidateQueries({ queryKey: ["meetSlots"] });
    },
  });

  const deleteSlotM = useMutation({
    mutationFn: (id) => deleteMeetSlot(id),
    onSuccess: () => {
      setConfirmDeleteSlotId(null);
      queryClient.invalidateQueries({ queryKey: ["meetSlots"] });
    },
  });

  const cancelBookingM = useMutation({
    mutationFn: (bookingId) => cancelMeetBooking(bookingId),
    onSuccess: () => {
      setConfirmCancelSlotId(null);
      queryClient.invalidateQueries({ queryKey: ["meetSlots"] });
    },
  });

  const groupedSlots = useMemo(() => groupSlotsByDay(slotsQ.data || []), [slotsQ.data]);
  const shareUrl = publicBookingUrl();
  const bookedCount = (slotsQ.data || []).filter((s) => s.status === "booked").length;
  const availableCount = (slotsQ.data || []).filter((s) => s.status === "available").length;

  useEffect(() => {
    if (!diaParam || viewMode !== "lista" || !groupedSlots.length) return;
    const el = dayRefs.current[diaParam];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timeout = window.setTimeout(() => setHighlightedDay(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [diaParam, viewMode, groupedSlots.length]);

  const selectedDaySlots = useMemo(() => {
    if (!selectedDay) return [];
    return (slotsQ.data || []).filter((s) => dayKeyLocal(s.start_at) === selectedDay).sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  }, [slotsQ.data, selectedDay]);

  return (
    <div className="container" style={{ maxWidth: 900, margin: "0 auto", padding: "24px 12px" }}>
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
          flexWrap: "wrap",
        }}
      >
        <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <CalendarIcon size={28} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ margin: 0, fontSize: 21 }}>Calendario de Meet · Servicio Técnico</h2>
          <div style={{ opacity: 0.9, fontSize: 13, marginTop: 4 }}>
            Definí los horarios disponibles para que los clientes agenden su reunión por Google Meet con el encargado técnico.
          </div>
        </div>
        {slotsQ.data ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ background: "rgba(255,255,255,0.16)", borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{availableCount}</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>Disponibles</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.16)", borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{bookedCount}</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>Reservados</div>
            </div>
          </div>
        ) : null}
      </div>

      <SectionCard icon={<LinkIcon size={18} />} accent={PETROL} title="Link para compartir con clientes">
        <div className="muted" style={{ marginBottom: 8 }}>
          Enviá este link a un cliente (WhatsApp, mail, etc.) para que agende su horario:
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <code style={{ background: "var(--dg-bg)", padding: "8px 10px", borderRadius: 8, fontSize: 13, border: "1px solid var(--dg-border)" }}>
            {shareUrl}
          </code>
          <Button
            variant="secondary"
            onClick={() => {
              navigator.clipboard?.writeText(shareUrl);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <LinkIcon size={14} />
              {copied ? "¡Copiado!" : "Copiar link"}
            </span>
          </Button>
        </div>
      </SectionCard>

      <SectionCard icon={<SettingsIcon size={18} />} accent={GRAY} title="Configuración">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="muted" style={{ marginBottom: 6 }}>Link fijo de Google Meet</div>
            <Input
              value={meetLinkValue}
              onChange={(v) => setLinkForm({ meet_link: v, technician_name: technicianNameValue })}
              placeholder="https://meet.google.com/xxx-xxxx-xxx"
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="muted" style={{ marginBottom: 6 }}>Nombre del encargado técnico</div>
            <Input
              value={technicianNameValue}
              onChange={(v) => setLinkForm({ meet_link: meetLinkValue, technician_name: v })}
              placeholder="Ej: Juan Pérez"
              style={{ width: "100%" }}
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Button disabled={saveSettingsM.isPending} onClick={() => saveSettingsM.mutate()}>
            {saveSettingsM.isPending ? "Guardando..." : "Guardar configuración"}
          </Button>
          {saveSettingsM.error ? (
            <div style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>{saveSettingsM.error.message}</div>
          ) : null}
        </div>
      </SectionCard>

      <RecurringRulesCard />

      <SectionCard
        icon={<PlusCircleIcon size={18} />}
        accent={TEAL}
        title="Agregar horario puntual"
        subtitle="Para un horario suelto (una excepción), sin crear una regla recurrente."
      >
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Fecha</div>
            <Input type="date" value={newDate} onChange={setNewDate} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Hora</div>
            <Input type="time" value={newTime} onChange={setNewTime} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Duración</div>
            <select
              value={newDuration}
              onChange={(e) => setNewDuration(e.target.value)}
              className="input"
              style={{ padding: "10px 12px" }}
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </select>
          </div>
          <Button
            disabled={!newDate || !newTime || createSlotM.isPending}
            onClick={() => createSlotM.mutate()}
          >
            {createSlotM.isPending ? "Agregando..." : "Agregar horario"}
          </Button>
        </div>
        {createSlotM.error ? (
          <div style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>{createSlotM.error.message}</div>
        ) : null}
      </SectionCard>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: `${PETROL}1A`, color: PETROL, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CalendarIcon size={18} />
            </div>
            <div style={{ fontWeight: 900, fontSize: 15, color: PETROL }}>Horarios</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Button variant={viewMode === "lista" ? "primary" : "secondary"} onClick={() => setViewMode("lista")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ListIcon size={14} />Lista</span>
            </Button>
            <Button variant={viewMode === "calendario" ? "primary" : "secondary"} onClick={() => setViewMode("calendario")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><CalendarIcon size={14} />Ver como calendario</span>
            </Button>
          </div>
        </div>

        {deleteSlotM.error ? (
          <div style={{ color: "#d93025", fontSize: 13, marginBottom: 10 }}>{deleteSlotM.error.message}</div>
        ) : null}
        {cancelBookingM.error ? (
          <div style={{ color: "#d93025", fontSize: 13, marginBottom: 10 }}>{cancelBookingM.error.message}</div>
        ) : null}
        {slotsQ.isLoading ? <div className="muted">Cargando...</div> : null}
        {!slotsQ.isLoading && !groupedSlots.length ? (
          <EmptyState icon={<InboxIcon size={26} color={GRAY} />} text="Todavía no hay horarios cargados." />
        ) : null}

        {viewMode === "lista" ? (
          groupedSlots.map((group) => (
            <div
              key={group.ymd}
              ref={(el) => { dayRefs.current[group.ymd] = el; }}
              style={{
                marginBottom: 18, borderRadius: 12, transition: "background 400ms ease, box-shadow 400ms ease",
                background: highlightedDay === group.ymd ? `${TEAL}14` : "transparent",
                boxShadow: highlightedDay === group.ymd ? `0 0 0 2px ${TEAL}` : "none",
                padding: highlightedDay === group.ymd ? 10 : 0,
              }}
            >
              <div
                style={{
                  fontWeight: 800, marginBottom: 10, textTransform: "capitalize",
                  color: PETROL, fontSize: 13.5,
                  display: "flex", alignItems: "center", gap: 8,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 999, background: PETROL, display: "inline-block" }} />
                {group.label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {group.slots.map((slot) => (
                  <SlotRow
                    key={slot.id}
                    slot={slot}
                    nowMs={nowMs}
                    confirmDeleteSlotId={confirmDeleteSlotId}
                    confirmCancelSlotId={confirmCancelSlotId}
                    setConfirmDeleteSlotId={setConfirmDeleteSlotId}
                    setConfirmCancelSlotId={setConfirmCancelSlotId}
                    deleteSlotM={deleteSlotM}
                    cancelBookingM={cancelBookingM}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          <>
            <CalendarMonthGrid
              slots={slotsQ.data || []}
              selectedDay={selectedDay}
              onSelectDay={(key) => {
                setSelectedDay(key);
                setNewDate(key);
              }}
              initialMonthKey={diaParam}
            />
            <div style={{ marginTop: 18 }}>
              {!selectedDay ? (
                <div className="muted" style={{ fontSize: 13, textAlign: "center", padding: "10px 0" }}>
                  Tocá un día marcado para ver el detalle de sus reuniones.
                </div>
              ) : !selectedDaySlots.length ? (
                <div className="muted" style={{ fontSize: 13, textAlign: "center", padding: "10px 0" }}>
                  Ese día no tiene reuniones agendadas.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedDaySlots.map((slot) => (
                    <SlotRow
                      key={slot.id}
                      slot={slot}
                      nowMs={nowMs}
                      confirmDeleteSlotId={confirmDeleteSlotId}
                      confirmCancelSlotId={confirmCancelSlotId}
                      setConfirmDeleteSlotId={setConfirmDeleteSlotId}
                      setConfirmCancelSlotId={setConfirmCancelSlotId}
                      deleteSlotM={deleteSlotM}
                      cancelBookingM={cancelBookingM}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
