export const STATUS_COLORS = {
  green:  { bg: "#e8f5e9", text: "#1b5e20", border: "#a5d6a7" },
  teal:   { bg: "#e0f2f1", text: "#004d40", border: "#80cbc4" },
  blue:   { bg: "#e3f2fd", text: "#0d47a1", border: "#90caf9" },
  yellow: { bg: "#fffde7", text: "#f57f17", border: "#fff176" },
  orange: { bg: "#fff3e0", text: "#bf360c", border: "#ffcc80" },
  red:    { bg: "#ffebee", text: "#b71c1c", border: "#ef9a9a" },
  gray:   { bg: "#f5f5f5", text: "#424242", border: "#e0e0e0" },
};

export const COLOR_GROUPS = [
  { key: "all",    label: "Todos" },
  { key: "red",    label: "Rechazados" },
  { key: "orange", label: "Pendientes" },
  { key: "yellow", label: "Esperando cliente" },
  { key: "teal",   label: "Acopio / Producción" },
  { key: "green",  label: "Completos" },
  { key: "blue",   label: "Sincronizando" },
];

export function computeStatusInfo(q) {
  if (q.final_technical_decision === "rejected")
    return { label: "Rechazado en revisión técnica final", color: "red" };
  if (q.final_logistics_decision === "rejected")
    return { label: "Rechazado en logística", color: "red" };

  if (q.status === "draft") {
    if (q.technical_decision === "rejected")
      return { label: "Rechazado en revisión técnica", color: "red" };
    if (q.commercial_decision === "rejected")
      return { label: "Rechazado comercialmente", color: "red" };
    return { label: "Borrador", color: "gray" };
  }

  if (q.status === "pending_approvals") {
    if (q.technical_decision === "rejected")
      return { label: "Rechazado en revisión técnica", color: "red" };
    if (q.commercial_decision === "rejected")
      return { label: "Rechazado comercialmente", color: "red" };
    if (q.technical_decision === "pending" && q.commercial_decision === "pending")
      return { label: "Esperando aprobación técnica y comercial", color: "orange" };
    if (q.technical_decision === "approved" && q.commercial_decision === "pending")
      return { label: "Aprobado técnicamente, esperando aprobación comercial", color: "yellow" };
    if (q.technical_decision === "pending" && q.commercial_decision === "approved")
      return { label: "Aprobado comercialmente, esperando aprobación técnica", color: "yellow" };
  }

  if (q.status === "syncing_odoo")
    return { label: "Procesando en Odoo...", color: "blue" };

  if (q.status === "synced_odoo") {
    if (q.fulfillment_mode === "acopio") {
      if (q.acopio_to_produccion_status === "pending")
        return { label: "Solicitado pase a producción, pendiente de aprobación técnica", color: "orange" };
      if (q.final_copy_id) {
        if (q.final_copy_status === "synced_odoo")
          return { label: "Completo — orden de producción generada", color: "green" };
        if (q.final_copy_status === "syncing_odoo")
          return { label: "Aprobado — sincronizando con Odoo...", color: "blue" };
        return { label: "Pase a producción aprobado, en proceso", color: "teal" };
      }
      return { label: "En Acopio", color: "teal" };
    }

    if (q.fulfillment_mode === "produccion") {
      if (!q.requires_measurement || q.measurement_status === "none") {
        if (q.final_status === "synced_odoo")
          return { label: "Completo — orden de producción generada", color: "green" };
        if (q.final_status === "syncing_odoo")
          return { label: "Sincronizando con Odoo...", color: "blue" };
        if (q.final_technical_decision === "approved" && q.final_logistics_decision === "approved")
          return { label: "Aprobado — pendiente de envío a Odoo", color: "teal" };
        if (q.final_technical_decision === "approved")
          return { label: "Aprobado técnicamente — esperando aprobación de logística", color: "yellow" };
        return { label: "Esperando aprobación técnica final", color: "orange" };
      }

      if (q.measurement_status === "pending")
        return { label: "Medición pendiente", color: "yellow" };
      if (q.measurement_status === "submitted") {
        return { label: "Medición entregada, esperando revisión técnica", color: "orange" };
      }
      if (q.measurement_status === "needs_fix")
        return { label: "Medición requiere correcciones", color: "red" };
      if (q.measurement_status === "approved") {
        if (q.measurement_commercial_review_required && q.measurement_commercial_review_status !== "approved")
          return { label: "Medición aprobada — esperando revisión comercial", color: "orange" };
        // La NV se crea junto con la aprobación técnica final; el link se genera DESPUÉS de la NV.
        const nvReady = q.final_copy_status === "synced_odoo" || q.final_status === "synced_odoo";
        const nvSyncing = q.final_copy_status === "syncing_odoo" || q.final_status === "syncing_odoo";
        // Chequear aceptación por timestamp O por el objeto en payload (portones viejos pueden tener solo el payload)
        const clientAccepted = !!(q.measurement_client_accepted_at || q.measurement_client_acceptance?.accepted_at);
        if (nvSyncing)
          return { label: "Generando orden de producción en Odoo...", color: "blue" };
        if (nvReady && clientAccepted)
          return { label: "Completo — cliente aceptó, en producción", color: "green" };
        if (nvReady && q.measurement_share_enabled_at && !clientAccepted)
          return { label: "Link enviado — esperando aceptación del cliente", color: "yellow" };
        if (nvReady)
          return { label: "Completo — orden de producción generada", color: "green" };
        // Cliente aceptó pero NV no fue creada (finalizacion falló previamente — requiere revisión)
        if (q.measurement_share_enabled_at && clientAccepted)
          return { label: "Cliente aceptó — NV pendiente de generación", color: "orange" };
        if (q.final_technical_decision === "approved" && q.final_logistics_decision === "approved")
          return { label: "Aprobado — pendiente de envío a Odoo", color: "teal" };
        if (q.final_technical_decision === "approved")
          return { label: "Aprobado técnicamente — esperando aprobación de logística", color: "yellow" };
        return { label: "Esperando aprobación técnica final", color: "orange" };
      }
      return { label: "En producción", color: "teal" };
    }

    return { label: "Confirmado en Odoo", color: "teal" };
  }

  return { label: "Estado desconocido", color: "gray" };
}
