import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import {
  adminGetProductionPropertyAssignments,
  adminSetProductionPropertyAssignment,
} from "../../api/admin.js";

function buildSearchText(item = {}, assignment = {}) {
  return [
    item?.group,
    item?.label,
    item?.source_key,
    item?.description,
    assignment?.target_property,
  ].join(" ").toLowerCase();
}

const pageShellStyle = {
  width: "calc(100vw - 48px)",
  maxWidth: "calc(100vw - 48px)",
  margin: "0 auto",
};

export default function SuperuserProductionPropertyAssignmentsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState({});

  const query = useQuery({
    queryKey: ["adminProductionPropertyAssignments"],
    queryFn: adminGetProductionPropertyAssignments,
    enabled: !!user?.is_superuser,
  });

  useEffect(() => {
    const next = {};
    const rows = Array.isArray(query.data?.assignments) ? query.data.assignments : [];
    for (const row of rows) {
      const sourceKey = String(row?.source_key || "");
      if (!sourceKey) continue;
      next[sourceKey] = {
        target_property: String(row?.target_property || ""),
        is_active: row?.is_active !== false,
      };
    }
    setDrafts(next);
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: async ({ sourceKey, payload }) => adminSetProductionPropertyAssignment(sourceKey, payload),
    onSuccess: (_result, variables) => {
      toast.success(`Asignación guardada para ${variables.sourceKey}`);
      qc.invalidateQueries({ queryKey: ["adminProductionPropertyAssignments"] });
    },
    onError: (error) => {
      toast.error(error?.message || "No se pudo guardar la asignación");
    },
  });

  const sourceProperties = Array.isArray(query.data?.source_properties) ? query.data.source_properties : [];
  const targetProperties = Array.isArray(query.data?.target_properties) ? query.data.target_properties : [];

  const filtered = useMemo(() => {
    const needle = String(q || "").trim().toLowerCase();
    if (!needle) return sourceProperties;
    return sourceProperties.filter((item) => buildSearchText(item, drafts[item.source_key] || {}).includes(needle));
  }, [sourceProperties, drafts, q]);

  if (!user?.is_superuser) {
    return (
      <div className="container" style={pageShellStyle}>
        <div className="spacer" />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Asignación de propiedades a producción</h2>
          <div className="muted">No tenés permisos (solo superusuario).</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={pageShellStyle}>
      <div className="spacer" />

      <div className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Asignación de propiedades a producción</h2>
          <div className="muted" style={{ marginTop: 6 }}>
            Primera columna: dato del portón desde presupuestador. Segunda columna: propiedad destino del integrador.
          </div>
        </div>

        <Button variant="secondary" onClick={() => query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? "Actualizando..." : "Actualizar"}
        </Button>
      </div>

      <div className="spacer" />

      <div className="card">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por grupo, propiedad origen o propiedad destino..."
            style={{ flex: 1, minWidth: 280, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />
          <div className="muted">{filtered.length} propiedad(es)</div>
        </div>
      </div>

      <div className="spacer" />

      <div className="card" style={{ overflowX: "auto" }}>
        {query.isLoading ? <div className="muted">Cargando...</div> : null}
        {query.isError ? <div style={{ color: "#d93025", fontSize: 13 }}>{query.error.message}</div> : null}
        {!query.isLoading && !query.isError && !filtered.length ? <div className="muted">Sin propiedades para mostrar.</div> : null}

        {!!filtered.length && (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1400 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>Grupo</th>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>Propiedad presupuestador</th>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>Descripción</th>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>Propiedad integrador</th>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>Activa</th>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const sourceKey = String(item.source_key || "");
                const draft = drafts[sourceKey] || { target_property: "", is_active: true };

                return (
                  <tr key={sourceKey}>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", verticalAlign: "top" }}>
                      {item.group || "—"}
                    </td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", verticalAlign: "top" }}>
                      <div style={{ fontWeight: 700 }}>{item.label || sourceKey}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{sourceKey}</div>
                    </td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", verticalAlign: "top" }}>
                      {item.description || "—"}
                    </td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", verticalAlign: "top", minWidth: 360 }}>
                      <select
                        value={draft.target_property || ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDrafts((current) => ({
                            ...current,
                            [sourceKey]: {
                              ...(current[sourceKey] || { is_active: true }),
                              target_property: value,
                            },
                          }));
                        }}
                        style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                      >
                        <option value="">Sin asignar</option>
                        {targetProperties.map((target) => (
                          <option key={`${sourceKey}-${target}`} value={target}>{target}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", verticalAlign: "top" }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={draft.is_active !== false}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setDrafts((current) => ({
                              ...current,
                              [sourceKey]: {
                                ...(current[sourceKey] || { target_property: "" }),
                                is_active: checked,
                              },
                            }));
                          }}
                        />
                        {draft.is_active !== false ? "Sí" : "No"}
                      </label>
                    </td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", verticalAlign: "top", whiteSpace: "nowrap" }}>
                      <Button
                        variant="primary"
                        onClick={() => saveMutation.mutate({
                          sourceKey,
                          payload: {
                            target_property: draft.target_property || "",
                            is_active: draft.is_active !== false,
                          },
                        })}
                        disabled={saveMutation.isPending}
                      >
                        Guardar
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
