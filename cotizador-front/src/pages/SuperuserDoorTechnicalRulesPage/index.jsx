import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { adminGetDoorTechnicalRules, adminSaveDoorTechnicalRules } from "../../api/admin.js";

function numberValue(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function Select({ value, onChange, options }) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function Field({ label, children, help }) {
  return <div style={{ flex: 1, minWidth: 260 }}><div className="muted" style={{ marginBottom: 6 }}>{label}</div>{children}{help ? <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{help}</div> : null}</div>;
}

export default function SuperuserDoorTechnicalRulesPage() {
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState(null);
  const q = useQuery({ queryKey: ["admin", "door-technical-rules"], queryFn: adminGetDoorTechnicalRules, enabled: !!user?.is_superuser });

  useEffect(() => {
    if (!q.data) return;
    setForm({
      ipanel_width_subtract_mm: q.data.ipanel_width_subtract_mm ?? 0,
      ipanel_height_subtract_mm: q.data.ipanel_height_subtract_mm ?? 0,
      structure_width_extra_mm: q.data.structure_width_extra_mm ?? 0,
      structure_height_extra_mm: q.data.structure_height_extra_mm ?? 0,
      auto_update_ipanel_dimensions: q.data.auto_update_ipanel_dimensions !== false,
      ipanel_fulfillment_mode: q.data.ipanel_fulfillment_mode || "acopio",
      structure_fulfillment_mode: q.data.structure_fulfillment_mode || "acopio",
    });
  }, [q.data]);

  const saveM = useMutation({
    mutationFn: async () => adminSaveDoorTechnicalRules({
      ...form,
      ipanel_width_subtract_mm: numberValue(form?.ipanel_width_subtract_mm),
      ipanel_height_subtract_mm: numberValue(form?.ipanel_height_subtract_mm),
      structure_width_extra_mm: numberValue(form?.structure_width_extra_mm),
      structure_height_extra_mm: numberValue(form?.structure_height_extra_mm),
    }),
    onSuccess: async () => { toast.success("Reglas tecnicas de puertas guardadas."); await q.refetch(); },
    onError: (e) => toast.error(e?.message || "No se pudieron guardar las reglas"),
  });

  if (!user?.is_superuser) return <div className="container"><div className="card">No autorizado.</div></div>;

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Reglas Tecnicas puertas</h2>
        <div className="muted">Estas reglas calculan automaticamente las medidas del Ipanel de revestimiento y de la estructura vinculada a cada puerta.</div>
      </div>
      <div className="spacer" />
      <div className="card">
        {q.isLoading && <div className="muted">Cargando...</div>}
        {q.isError && <div style={{ color: "#d93025" }}>{q.error.message}</div>}
        {form ? (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Field label="Descuento ancho Ipanel (mm)" help="ancho_ipanel = ancho_puerta - este valor">
                <Input value={String(form.ipanel_width_subtract_mm ?? "")} onChange={(v) => setForm({ ...form, ipanel_width_subtract_mm: v })} style={{ width: "100%" }} />
              </Field>
              <Field label="Descuento alto Ipanel (mm)" help="alto_ipanel = alto_puerta - este valor">
                <Input value={String(form.ipanel_height_subtract_mm ?? "")} onChange={(v) => setForm({ ...form, ipanel_height_subtract_mm: v })} style={{ width: "100%" }} />
              </Field>
            </div>
            <div className="spacer" />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Field label="Extra ancho estructura (mm)" help="ancho_estructura = ancho_puerta + este valor">
                <Input value={String(form.structure_width_extra_mm ?? "")} onChange={(v) => setForm({ ...form, structure_width_extra_mm: v })} style={{ width: "100%" }} />
              </Field>
              <Field label="Extra alto estructura (mm)" help="alto_estructura = alto_puerta + este valor">
                <Input value={String(form.structure_height_extra_mm ?? "")} onChange={(v) => setForm({ ...form, structure_height_extra_mm: v })} style={{ width: "100%" }} />
              </Field>
            </div>
            <div className="spacer" />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Field label="Destino por defecto estructura">
                <Select value={form.structure_fulfillment_mode} onChange={(v) => setForm({ ...form, structure_fulfillment_mode: v })} options={[{ value: "acopio", label: "Acopio" }, { value: "produccion", label: "Produccion" }]} />
              </Field>
              <Field label="Destino por defecto Ipanel">
                <Select value={form.ipanel_fulfillment_mode} onChange={(v) => setForm({ ...form, ipanel_fulfillment_mode: v })} options={[{ value: "acopio", label: "Acopio" }, { value: "produccion", label: "Produccion" }]} />
              </Field>
            </div>
            <div className="spacer" />
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.auto_update_ipanel_dimensions !== false} onChange={(e) => setForm({ ...form, auto_update_ipanel_dimensions: e.target.checked })} />
              <span>Actualizar automaticamente las medidas del Ipanel al guardar la puerta</span>
            </label>
            <div className="spacer" />
            <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>{saveM.isPending ? "Guardando..." : "Guardar reglas"}</Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
