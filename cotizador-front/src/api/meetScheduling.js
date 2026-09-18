import { http } from "./http.js";

// --- Staff (requiere sesion) ---

export async function getMeetSchedulingSettings() {
  const { data } = await http.get("/api/meet-scheduling/settings");
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar la configuración");
  return data.settings;
}

export async function updateMeetSchedulingSettings(payload = {}) {
  const { data } = await http.put("/api/meet-scheduling/settings", payload);
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar la configuración");
  return data.settings;
}

export async function listMeetSlots({ includePast = false } = {}) {
  const { data } = await http.get("/api/meet-scheduling/slots", { params: { include_past: includePast ? "true" : "false" } });
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar los horarios");
  return data.slots || [];
}

export async function createMeetSlot(payload = {}) {
  const { data } = await http.post("/api/meet-scheduling/slots", payload);
  if (!data?.ok) throw new Error(data?.error || "No se pudo crear el horario");
  return data.slot;
}

export async function deleteMeetSlot(id) {
  const { data } = await http.delete(`/api/meet-scheduling/slots/${encodeURIComponent(String(id))}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo eliminar el horario");
  return true;
}

export async function cancelMeetBooking(bookingId) {
  const { data } = await http.post(`/api/meet-scheduling/bookings/${encodeURIComponent(String(bookingId))}/cancel`, {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo cancelar la reserva");
  return true;
}

export async function countMeetBookingsSince(sinceIso) {
  const { data } = await http.get("/api/meet-scheduling/bookings/count-since", { params: { since: sinceIso } });
  if (!data?.ok) throw new Error(data?.error || "No se pudo consultar reservas nuevas");
  return Number(data.count || 0);
}

export async function listMeetRecurringRules() {
  const { data } = await http.get("/api/meet-scheduling/recurring-rules");
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las reglas recurrentes");
  return data.rules || [];
}

export async function createMeetRecurringRule(payload = {}) {
  const { data } = await http.post("/api/meet-scheduling/recurring-rules", payload);
  if (!data?.ok) throw new Error(data?.error || "No se pudo crear la regla recurrente");
  return data.rule;
}

export async function updateMeetRecurringRule(id, payload = {}) {
  const { data } = await http.put(`/api/meet-scheduling/recurring-rules/${encodeURIComponent(String(id))}`, payload);
  if (!data?.ok) throw new Error(data?.error || "No se pudo actualizar la regla recurrente");
  return data.rule;
}

export async function deleteMeetRecurringRule(id) {
  const { data } = await http.delete(`/api/meet-scheduling/recurring-rules/${encodeURIComponent(String(id))}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo eliminar la regla recurrente");
  return true;
}

// --- Publico (sin sesion) ---

export async function getPublicMeetAvailability() {
  const { data } = await http.get("/api/public/meet-scheduling");
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar la disponibilidad");
  return { slots: data.slots || [], technicianName: data.technician_name || null };
}

export async function createPublicMeetBooking(payload = {}) {
  const { data } = await http.post("/api/public/meet-scheduling/bookings", payload);
  if (!data?.ok) throw new Error(data?.error || "No se pudo reservar el horario");
  return data.booking;
}
