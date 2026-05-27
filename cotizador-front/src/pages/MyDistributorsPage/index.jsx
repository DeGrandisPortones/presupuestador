import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import { listMyDistributors } from "../../api/sellerDistributors.js";
import { useAuthStore } from "../../domain/auth/store.js";

function copyToClipboard(value, label) {
  const text = String(value || "").trim();
  if (!text) return;
  navigator.clipboard?.writeText(text)
    .then(() => toast.success(`${label} copiado`))
    .catch(() => toast.error("No se pudo copiar"));
}

function PasswordCell({ value }) {
  const password = String(value || "").trim();
  if (!password) {
    return (
      <div>
        <span className="muted">No disponible</span>
        <div className="muted" style={{ fontSize: 12 }}>Resetear desde Gestor de usuarios para mostrarla.</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <code style={{ fontSize: 14, fontWeight: 800 }}>{password}</code>
      <Button variant="ghost" onClick={() => copyToClipboard(password, "Contraseña")}>Copiar</Button>
    </div>
  );
}

export default function MyDistributorsPage() {
  const user = useAuthStore((s) => s.user);
  const canAccess = !!(user?.is_superuser || (user?.is_vendedor && !user?.is_distribuidor));

  const q = useQuery({
    queryKey: ["myDistributors"],
    queryFn: listMyDistributors,
    enabled: canAccess,
  });

  if (!canAccess) {
    return (
      <div className="container">
        <div className="spacer" />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Mis distribuidores</h2>
          <div className="muted">No tenés permisos para ver esta sección.</div>
        </div>
      </div>
    );
  }

  const distributors = q.data || [];

  return (
    <div className="container">
      <div className="spacer" />
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Mis distribuidores</h2>
          <div className="muted">Listado de distribuidores asignados a tu usuario, con sus credenciales de acceso.</div>
        </div>
        <Button variant="secondary" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Actualizando…" : "Actualizar"}</Button>
      </div>

      <div className="spacer" />
      <div className="card">
        {q.isLoading ? <div className="muted">Cargando distribuidores…</div> : null}
        {q.isError ? <div style={{ color: "#d93025", fontSize: 13 }}>{q.error?.message || "No se pudieron cargar los distribuidores"}</div> : null}
        {!q.isLoading && !distributors.length ? <div className="muted">No tenés distribuidores asignados.</div> : null}

        {!!distributors.length ? (
          <table>
            <thead>
              <tr>
                <th>Distribuidor</th>
                <th>Usuario</th>
                <th>Contraseña</th>
                <th>Lista Odoo</th>
                <th>Partner Odoo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {distributors.map((d) => {
                const username = String(d.username || "").trim();
                return (
                  <tr key={d.id}>
                    <td>
                      <div style={{ fontWeight: 900 }}>{d.full_name || username}</div>
                      {d.full_name ? <div className="muted" style={{ fontSize: 12 }}>{username}</div> : null}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <code style={{ fontSize: 14, fontWeight: 800 }}>{username}</code>
                        <Button variant="ghost" onClick={() => copyToClipboard(username, "Usuario")}>Copiar</Button>
                      </div>
                    </td>
                    <td><PasswordCell value={d.visible_password} /></td>
                    <td>{d.odoo_pricelist_id || <span className="muted">—</span>}</td>
                    <td>{d.odoo_partner_id || <span className="muted">—</span>}</td>
                    <td>{d.is_active ? "Activo" : "Inactivo"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
