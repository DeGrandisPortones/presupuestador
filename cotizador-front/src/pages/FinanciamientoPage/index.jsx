import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { PAYMENT_METHODS } from "../../domain/quote/portonConstants.js";
import { getFinancingSettings, saveFinancingSettings } from "../../api/financingSettings.js";

const DEFAULT_FINANCING_METHODS = PAYMENT_METHODS;

function normalizePercent(value) {
  const raw = String(value ?? "").replace(",", ".").trim();
  if (!raw || raw === "-" || raw === "." || raw === "-.") return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Math.round(n * 10000) / 10000);
}
function sanitizePercentInput(value) {
  const rawInput = String(value ?? "").replace(",", ".");
  const hasNegativeSign = rawInput.trim().startsWith("-");
  const unsigned = rawInput.replace(/-/g, "").replace(/[^0-9.]/g, "");
  const parts = unsigned.split(".");
  const normalizedUnsigned = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("")}` : parts[0];
  return `${hasNegativeSign ? "-" : ""}${normalizedUnsigned}`;
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

function cleanMethodName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

const DEFAULT_METHOD_KEYS = new Set(DEFAULT_FINANCING_METHODS.map(methodKey));
const DEFAULT_METHOD_INDEX = new Map(DEFAULT_FINANCING_METHODS.map((method, index) => [methodKey(method), index]));

function rowFromApiItem(item, fallbackName = "") {
  const paymentMethod = String(item?.payment_method || fallbackName || "").trim();
  const key = methodKey(paymentMethod);
  const inputPercent = item?.saved_percent ?? item?.percent ?? item?.odoo_percent ?? 0;
  return {
    payment_method: paymentMethod,
    payment_method_key: key,
    percent: normalizePercent(inputPercent),
    active: item?.active !== false,
    odoo_percent: Number(item?.odoo_percent || 0) || 0,
    saved_percent: item?.saved_percent,
    source: item?.source || (item?.has_override ? "config" : "odoo"),
    has_override: !!item?.has_override,
    is_custom: !DEFAULT_METHOD_KEYS.has(key),
    is_new: false,
  };
}

function asRows(data) {
  const fromApi = Array.isArray(data) ? data : [];
  const byKey = new Map();

  for (const method of DEFAULT_FINANCING_METHODS) {
    const key = methodKey(method);
    byKey.set(key, {
      payment_method: method,
      payment_method_key: key,
      percent: "0",
      active: true,
      odoo_percent: 0,
      saved_percent: null,
      source: "odoo",
      has_override: false,
      is_custom: false,
      is_new: false,
    });
  }

  for (const item of fromApi) {
    const key = methodKey(item?.payment_method);
    if (!key) continue;
    byKey.set(key, rowFromApiItem(item));
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const aDefault = DEFAULT_METHOD_INDEX.has(a.payment_method_key);
    const bDefault = DEFAULT_METHOD_INDEX.has(b.payment_method_key);
    if (aDefault && bDefault) return DEFAULT_METHOD_INDEX.get(a.payment_method_key) - DEFAULT_METHOD_INDEX.get(b.payment_method_key);
    if (aDefault) return -1;
    if (bDefault) return 1;
    return String(a.payment_method).localeCompare(String(b.payment_method), "es");
  });
}

function findDuplicateKeys(rows) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    const key = methodKey(row.payment_method);
    if (!key) continue;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return duplicates;
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

  const duplicateKeys = useMemo(() => findDuplicateKeys(rows), [rows]);
  const invalidRows = useMemo(() => rows.filter((row) => {
    const key = methodKey(row.payment_method);
    const n = Number(String(row.percent || "").replace(",", "."));
    return !key || duplicateKeys.has(key) || row.percent !== "" && (!Number.isFinite(n) || n < -100);
  }), [rows, duplicateKeys]);

  const saveM = useMutation({
    mutationFn: () => saveFinancingSettings(rows
      .filter((row) => methodKey(row.payment_method))
      .map((row) => ({
        payment_method: cleanMethodName(row.payment_method),
        percent: Number(String(row.percent || "0").replace(",", ".")) || 0,
        active: row.active !== false,
      }))),
    onSuccess: (saved) => {
      setRows(asRows(saved));
      qc.invalidateQueries({ queryKey: ["financing-settings"] });
      qc.invalidateQueries({ queryKey: ["financing-payment-methods"] });
      qc.invalidateQueries({ queryKey: ["financing-preview"] });
      qc.invalidateQueries({ queryKey: ["financing-preview-lines"] });
      toast.success("Financiamiento guardado.");
    },
    onError: (e) => toast.error(e?.message || "No se pudo guardar el financiamiento"),
  });

  function updateRow(index, patch) {
    setRows((prev) => prev.map((row, idx) => idx === index ? { ...row, ...patch } : row));
  }

  function addCustomRow() {
    setRows((prev) => ([
      ...prev,
      {
        payment_method: "",
        payment_method_key: "",
        percent: "0",
        active: true,
        odoo_percent: 0,
        saved_percent: null,
        source: "config",
        has_override: true,
        is_custom: true,
        is_new: true,
      },
    ]));
  }

  function removeNewRow(index) {
    setRows((prev) => prev.filter((_, idx) => idx !== index));
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
          Configurá el porcentaje de recargo o descuento por forma de pago. Usá valores negativos para descuentos, por ejemplo -5 para efectivo / transferencia.
        </div>
      </div>

      <div className="spacer" />
      <div className="card">
        {q.isLoading ? <div className="muted">Cargando configuración...</div> : null}
        {q.isError ? <div style={{ color: "#d93025", fontSize: 13 }}>{q.error?.message || "No se pudo cargar"}</div> : null}

        {!!rows.length ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <div className="muted">Las formas agregadas manualmente quedan disponibles en el selector de Forma de pago. Para descuentos, cargá porcentaje negativo.</div>
              <Button variant="secondary" onClick={addCustomRow} disabled={saveM.isPending}>Agregar tipo de financiamiento</Button>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Forma de pago</th>
                  <th className="right">Recargo / descuento (%)</th>
                  <th>Activo</th>
                  <th className="right">Referencia Odoo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const key = methodKey(row.payment_method);
                  const hasDuplicate = !!key && duplicateKeys.has(key);
                  const missingName = !key;
                  const percentNumber = Number(String(row.percent || "").replace(",", "."));
                  const invalidPercent = row.percent !== "" && (!Number.isFinite(percentNumber) || percentNumber < -100);
                  return (
                    <tr key={`${row.payment_method_key || "new"}-${index}`}>
                      <td>
                        {row.is_new ? (
                          <Input
                            value={row.payment_method}
                            onChange={(v) => updateRow(index, { payment_method: v, payment_method_key: methodKey(v) })}
                            onBlur={(e) => updateRow(index, { payment_method: cleanMethodName(e?.target?.value), payment_method_key: methodKey(e?.target?.value) })}
                            placeholder="Ej: VISA 9 CUOTAS"
                            style={{ width: "100%", borderColor: missingName || hasDuplicate ? "#d93025" : undefined }}
                          />
                        ) : (
                          <div style={{ fontWeight: 800 }}>{row.payment_method}</div>
                        )}
                        <div className="muted">
                          {row.is_new ? "Nuevo tipo manual" : row.is_custom ? "Agregado manualmente" : row.source === "config" ? "Configurado en Presupuestador" : "Tomado desde Odoo hasta que se guarde acá"}
                          {hasDuplicate ? " · Nombre duplicado" : ""}
                          {missingName ? " · Completá el nombre" : ""}
                        </div>
                      </td>
                      <td className="right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={String(row.percent ?? "")}
                          onChange={(v) => updateRow(index, { percent: sanitizePercentInput(v) })}
                          onBlur={(e) => updateRow(index, { percent: normalizePercent(e?.target?.value) })}
                          style={{ width: 120, textAlign: "right", borderColor: invalidPercent ? "#d93025" : undefined }}
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
                      <td className="right">
                        {row.is_new ? <Button variant="ghost" onClick={() => removeNewRow(index)} disabled={saveM.isPending}>Quitar</Button> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="spacer" />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <Button variant="ghost" onClick={() => setRows(asRows(q.data || []))} disabled={saveM.isPending}>Deshacer cambios</Button>
              <Button onClick={() => saveM.mutate()} disabled={saveM.isPending || !!invalidRows.length}>
                {saveM.isPending ? "Guardando..." : "Guardar financiamiento"}
              </Button>
            </div>
            {!!invalidRows.length ? <div style={{ color: "#d93025", fontSize: 13, marginTop: 10 }}>Revisá nombres duplicados, nombres vacíos o porcentajes inválidos antes de guardar. El descuento máximo permitido es -100%.</div> : null}
          </>
        ) : (!q.isLoading ? (
          <>
            <div className="muted">Sin formas de pago configurables.</div>
            <div className="spacer" />
            <Button variant="secondary" onClick={addCustomRow}>Agregar tipo de financiamiento</Button>
          </>
        ) : null)}
      </div>
    </div>
  );
}
