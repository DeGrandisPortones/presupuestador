import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { adminGetProductPdfNames, adminSetProductPdfName } from "../../api/admin.js";

function buildSearchText(item = {}) {
  return [
    item?.product_id,
    item?.odoo_id,
    item?.odoo_template_id,
    item?.odoo_variant_id,
    item?.odoo_name,
    item?.presupuestador_name,
    item?.alias,
    item?.pdf_name,
  ].join(" ").toLowerCase();
}

export default function SuperuserProductPdfNamesPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [kind, setKind] = useState("porton");
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState({});

  const itemsQ = useQuery({
    queryKey: ["adminProductPdfNames", kind],
    queryFn: () => adminGetProductPdfNames(kind),
    enabled: !!user?.is_superuser,
  });

  useEffect(() => {
    const next = {};
    for (const item of (itemsQ.data || [])) {
      next[String(item.product_id)] = String(item.pdf_name || "");
    }
    setDrafts(next);
  }, [itemsQ.data]);

  const saveM = useMutation({
    mutationFn: async ({ productId, pdfName }) => adminSetProductPdfName(kind, productId, pdfName),
    onSuccess: (_saved, variables) => {
      toast.success(`Nombre PDF guardado para producto ${variables.productId}`);
      qc.invalidateQueries({ queryKey: ["adminProductPdfNames", kind] });
    },
    onError: (e) => toast.error(e?.message || "No se pudo guardar"),
  });

  const filtered = useMemo(() => {
    const needle = String(q || "").trim().toLowerCase();
    const source = Array.isArray(itemsQ.data) ? itemsQ.data : [];
    if (!needle) return source;
    return source.filter((item) => buildSearchText(item).includes(needle));
  }, [itemsQ.data, q]);

  if (!user?.is_superuser) {
    return (
      <div className="container">
        <div className="spacer" />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Nombres PDF productos</h2>
          <div className="muted">No tenés permisos (solo superusuario).</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="spacer" />

      <div className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Nombres PDF productos</h2>
          <div className="muted" style={{ marginTop: 6 }}>
            Acá definís qué nombre exacto querés que salga en el PDF. Si queda vacío, usa el nombre que devuelve Odoo.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={kind === "porton" ? "primary" : "ghost"} onClick={() => setKind("porton")}>Portón</Button>
          <Button variant={kind === "ipanel" ? "primary" : "ghost"} onClick={() => setKind("ipanel")}>Ipanel</Button>
          <Button variant={kind === "otros" ? "primary" : "ghost"} onClick={() => setKind("otros")}>Otros</Button>
          <Button variant="secondary" onClick={() => itemsQ.refetch()} disabled={itemsQ.isFetching}>
            {itemsQ.isFetching ? "Actualizando..." : "Actualizar"}
          </Button>
        </div>
      </div>

      <div className="spacer" />

      <div className="card">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por ID, nombre Odoo, alias o nombre PDF..."
            style={{ flex: 1, minWidth: 260, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />
          <div className="muted">{filtered.length} producto(s)</div>
        </div>
      </div>

      <div className="spacer" />

      <div className="card" style={{ overflowX: "auto" }}>
        {itemsQ.isLoading ? <div className="muted">Cargando...</div> : null}
        {itemsQ.isError ? <div style={{ color: "#d93025", fontSize: 13 }}>{itemsQ.error.message}</div> : null}
        {!itemsQ.isLoading && !itemsQ.isError && !filtered.length ? <div className="muted">Sin productos para mostrar.</div> : null}

        {!!filtered.length && (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>ID Pres.</th>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>ID Odoo</th>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>Nombre Odoo</th>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>Nombre presupuestador</th>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>Nombre PDF</th>
                <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const productId = String(item.product_id);
                const draft = drafts[productId] ?? "";
                const effectiveName = String(draft || item.odoo_name || "").trim();

                return (
                  <tr key={`${kind}-${productId}`}>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", verticalAlign: "top" }}>
                      <div style={{ fontWeight: 700 }}>{item.product_id}</div>
                      <div className="muted" style={{ fontSize: 12 }}>Variante: {item.odoo_variant_id || "—"}</div>
                    </td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", verticalAlign: "top" }}>
                      <div style={{ fontWeight: 700 }}>{item.odoo_id || item.odoo_template_id || "—"}</div>
                      <div className="muted" style={{ fontSize: 12 }}>Template</div>
                    </td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", verticalAlign: "top" }}>
                      <div>{item.odoo_name || "—"}</div>
                    </td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", verticalAlign: "top" }}>
                      <div>{item.presupuestador_name || "—"}</div>
                      {item.alias ? <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Alias: {item.alias}</div> : null}
                    </td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", verticalAlign: "top", minWidth: 300 }}>
                      <input
                        value={draft}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [productId]: e.target.value }))}
                        placeholder={item.odoo_name || "Nombre PDF"}
                        style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                      />
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        Efectivo: {effectiveName || "—"}
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", verticalAlign: "top", whiteSpace: "nowrap" }}>
                      <Button
                        variant="primary"
                        onClick={() => saveM.mutate({ productId: item.product_id, pdfName: draft })}
                        disabled={saveM.isPending}
                      >
                        Guardar
                      </Button>
                      <div style={{ height: 8 }} />
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setDrafts((prev) => ({ ...prev, [productId]: "" }));
                          saveM.mutate({ productId: item.product_id, pdfName: "" });
                        }}
                        disabled={saveM.isPending}
                      >
                        Usar Odoo
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
