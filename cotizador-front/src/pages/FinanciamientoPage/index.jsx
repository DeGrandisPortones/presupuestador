import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { PAYMENT_METHODS } from "../../domain/quote/portonConstants.js";
import { getFinancingSettings, saveFinancingSettings } from "../../api/financingSettings.js";

function normalizePercent(value) {
  const raw = String(value ?? "").replace(",", ".").trim();
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Math.max(0, Math.round(n * 10000) / 10000));
}

function methodKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function asRows(data) {
  const fromApi = Array.isArray(data) ? data : [];
  const byKey = new Map(fromApi.map((item) => [methodKey(item.payment_method), item]));
  const rows = PAYMENT_METHODS
    .filter((method) => /(CORDOBESA|NARANJA|OTRAS TC BANC)/i.test(method))
    .map((method) => {
      const item = byKey.get(methodKey(method)) || {};
      const effective = item.percent ?? item.odoo_percent ?? 0;
      return {
        payment_method: method,
        percent: normalizePercent(effective),
        active: item.active !== false,
        odoo_percent: Number(item.odoo_percent || 0) || 0,
        saved_percent: item.saved_percent,
        source: item.source || (item.has_override ? "config" : "odoo"),
      };
    });
  return rows;
}

export default function FinanciamientoPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const canEdit = !!(user?.is_superuser || user?.is_enc_comercial);
  const [rows, setRows] = useState([]);

  const q = useQuery({
    queryKey: ["financing-settings"],
    queryFn: getFinancingSettings,
    enabled: canEdit,
  });

  useEffect(() => {
    if (!q.data) return;
    setRows(asRows(q.data));
  }, [q.data]);

  const saveM = useMutation({
    mutationFn: () => saveFinancingSettings(rows.map((row) => ({
      payment_method: row.payment_method,
      percent: Number(String(row.percent || "0").replace(",", ".")) || 0,
      active: row.active !== false,
    }))),
    onSuccess: (saved) => {
      setRows(asRows(saved));
      qc.invalidateQueries({ queryKey: ["financing-settings"] });
      qc.invalidateQueries({ queryKey: ["financing-preview"] });
      qc.invalidateQueries({ queryKey: ["financing-preview-lines"] });
      toast.success("Financiamiento guardado.");
    },
    onError: (e) => toast.error(e?.message || "No se pudo guardar el financiamiento"),
  });

  const invalidRows = useMemo(() => rows.filter((row) => {
    const n = Number(String(row.percent || "").replace(",", "."));
    return row.percent !== "" && (!Number.isFinite(n) || n < 0);
  }), [rows]);

  function updateRow(index, patch) {
    setRows((prev) => prev.map((row, idx) => idx === index ? { ...row, ...patch } : row));
  }

  if (!canEdit) {
    return (
      <div className="container">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Financiamiento</h2>
          <div className="muted">Solo disponible para superusuario o Enc. Comercial.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>Financiamiento</h2>
        <div className="muted" style={{ marginTop: 6 }}>
          Configurá el porcentaje de recargo por forma de pago. Estos porcentajes se aplican al total, subtotal y precios finales de cada ítem en el cotizador.
        </div>
      </div>

      <div className="spacer" />
      <div className="card">
        {q.isLoading ? <div className="muted">Cargando configuración...</div> : null}
        {q.isError ? <div style={{ color: "#d93025", fontSize: 13 }}>{q.error?.message || "No se pudo cargar"}</div> : null}

        {!!rows.length ? (
          <>
            <table>
              <thead>
                <tr>
                  <th>Forma de pago</th>
                  <th className="right">Recargo (%)</th>
                  <th>Activo</th>
                  <th className="right">Referencia Odoo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.payment_method}>
                    <td>
                      <div style={{ fontWeight: 800 }}>{row.payment_method}</div>
                      <div className="muted">{row.source === "config" ? "Configurado en Presupuestador" : "Tomado desde Odoo hasta que se guarde acá"}</div>
                    </td>
                    <td className="right">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={String(row.percent ?? "")}
                        onChange={(v) => updateRow(index, { percent: v.replace(/[^0-9.,]/g, "") })}
                        onBlur={(e) => updateRow(index, { percent: normalizePercent(e?.target?.value) })}
                        style={{ width: 120, textAlign: "right" }}
                      />
                    </td>
                    <td>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={row.active !== false}
                          onChange={(e) => updateRow(index, { active: e.target.checked })}
                        />
                        <span>{row.active !== false ? "Sí" : "No"}</span>
                      </label>
                    </td>
                    <td className="right">{Number(row.odoo_percent || 0).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="spacer" />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <Button variant="ghost" onClick={() => setRows(asRows(q.data || []))} disabled={saveM.isPending}>Deshacer cambios</Button>
              <Button onClick={() => saveM.mutate()} disabled={saveM.isPending || !!invalidRows.length}>
                {saveM.isPending ? "Guardando..." : "Guardar financiamiento"}
              </Button>
            </div>
            {!!invalidRows.length ? <div style={{ color: "#d93025", fontSize: 13, marginTop: 10 }}>Revisá los porcentajes inválidos antes de guardar.</div> : null}
          </>
        ) : (!q.isLoading ? <div className="muted">Sin formas de pago financiadas configurables.</div> : null)}
      </div>
    </div>
  );
}
