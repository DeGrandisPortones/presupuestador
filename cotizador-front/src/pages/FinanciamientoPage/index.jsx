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
  const stableKey = methodKey(item?.payment_method_key || paymentMethod);
  const inputPercent = item?.saved_percent ?? item?.percent ?? item?.odoo_percent ?? 0;
  return {
    payment_method: paymentMethod,
    payment_method_key: stableKey,
    original_payment_method_key: stableKey,
    percent: normalizePercent(inputPercent),
    active: item?.active !== false,
    odoo_percent: Number(item?.odoo_percent || 0) || 0,
    saved_percent: item?.saved_percent,
    source: item?.source || (item?.has_override ? "config" : "odoo"),
    has_override: !!item?.has_override,
    is_custom: item?.is_custom !== undefined ? !!item.is_custom : !DEFAULT_METHOD_KEYS.has(stableKey),
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
      original_payment_method_key: key,
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
    const row = rowFromApiItem(item);
    const key = row.payment_method_key;
    if (!key) continue;
    byKey.set(key, row);
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

function findDuplicateNames(rows) {
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

function findDuplicateStableKeys(rows) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    const key = methodKey(row.payment_method_key || row.payment_method);
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
  const canEditNames = !!user?.is_superuser;
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

  const duplicateNameKeys = useMemo(() => findDuplicateNames(rows), [rows]);
  const duplicateStableKeys = useMemo(() => findDuplicateStableKeys(rows), [rows]);
  const invalidRows = useMemo(() => rows.filter((row) => {
    const nameKey = methodKey(row.payment_method);
    const stableKey = methodKey(row.payment_method_key || row.payment_method);
    const n = Number(String(row.percent || "").replace(",", "."));
    return !nameKey || !stableKey || duplicateNameKeys.has(nameKey) || duplicateStableKeys.has(stableKey) || row.percent !== "" && (!Number.isFinite(n) || n < -100);
  }), [rows, duplicateNameKeys, duplicateStableKeys]);

  const saveM = useMutation({
    mutationFn: () => saveFinancingSettings(rows
      .filter((row) => methodKey(row.payment_method))
      .map((row) => ({
        payment_method_key: row.payment_method_key || row.original_payment_method_key || methodKey(row.payment_method),
        original_payment_method_key: row.original_payment_method_key || row.payment_method_key || methodKey(row.payment_method),
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
    if (!canEditNames) return;
    setRows((prev) => ([
      ...prev,
      {
        payment_method: "",
        payment_method_key: "",
        original_payment_method_key: "",
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
    if (!canEditNames) return;
    setRows((prev) => prev.filter((_, idx) => idx !== index));
  }

  function updatePaymentMethodName(index, value) {
    const nextName = value;
    setRows((prev) => prev.map((row, idx) => {
      if (idx !== index) return row;
      const next = { ...row, payment_method: nextName };
      if (row.is_new) {
        const key = methodKey(nextName);
        next.payment_method_key = key;
        next.original_payment_method_key = key;
      }
      return next;
    }));
  }

  function normalizePaymentMethodName(index, value) {
    const cleaned = cleanMethodName(value);
    setRows((prev) => prev.map((row, idx) => {
      if (idx !== index) return row;
      const next = { ...row, payment_method: cleaned };
      if (row.is_new) {
        const key = methodKey(cleaned);
        next.payment_method_key = key;
        next.original_payment_method_key = key;
      }
      return next;
    }));
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
          Configurá el porcentaje de recargo o descuento por forma de pago. Usá valores negativos para descuentos, por ejemplo -5 para efectivo.
          {canEditNames ? " Como superusuario también podés editar los nombres sin duplicar la forma de pago." : " Los nombres sólo los puede editar un superusuario."}
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
              {canEditNames ? <Button variant="secondary" onClick={addCustomRow} disabled={saveM.isPending}>Agregar tipo de financiamiento</Button> : null}
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
                  const nameKey = methodKey(row.payment_method);
                  const stableKey = methodKey(row.payment_method_key || row.payment_method);
                  const hasDuplicateName = !!nameKey && duplicateNameKeys.has(nameKey);
                  const hasDuplicateStableKey = !!stableKey && duplicateStableKeys.has(stableKey);
                  const missingName = !nameKey;
                  const percentNumber = Number(String(row.percent || "").replace(",", "."));
                  const invalidPercent = row.percent !== "" && (!Number.isFinite(percentNumber) || percentNumber < -100);
                  return (
                    <tr key={`${row.payment_method_key || "new"}-${index}`}>
                      <td>
                        {canEditNames ? (
                          <Input
                            value={row.payment_method}
                            onChange={(v) => updatePaymentMethodName(index, v)}
                            onBlur={(e) => normalizePaymentMethodName(index, e?.target?.value)}
                            placeholder="Ej: CHEQUE 0 - 30 - 60"
                            style={{ width: "100%", borderColor: missingName || hasDuplicateName || hasDuplicateStableKey ? "#d93025" : undefined }}
                          />
                        ) : (
                          <div style={{ fontWeight: 800 }}>{row.payment_method}</div>
                        )}
                        <div className="muted">
                          {row.is_new ? "Nuevo tipo manual" : row.is_custom ? "Agregado manualmente" : row.source === "config" ? "Configurado en Presupuestador" : "Tomado desde Odoo hasta que se guarde acá"}
                          {canEditNames && !row.is_new ? " · Nombre editable" : ""}
                          {hasDuplicateName ? " · Nombre duplicado" : ""}
                          {hasDuplicateStableKey ? " · Clave interna duplicada" : ""}
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
                        {canEditNames && row.is_new ? <Button variant="ghost" onClick={() => removeNewRow(index)} disabled={saveM.isPending}>Quitar</Button> : null}
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
            {canEditNames ? <Button variant="secondary" onClick={addCustomRow}>Agregar tipo de financiamiento</Button> : null}
          </>
        ) : null)}
      </div>
    </div>
  );
}
