import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import { listMyDistributors, updateMyDistributorDefaultMapsUrl } from "../../api/sellerDistributors.js";
import { getPricelists } from "../../api/odoo.js";
import { useAuthStore } from "../../domain/auth/store.js";

function copyToClipboard(value, label) {
  const text = String(value || "").trim();
  if (!text) return;
  navigator.clipboard?.writeText(text)
    .then(() => toast.success(`${label} copiado`))
    .catch(() => toast.error("No se pudo copiar"));
}

function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function PricelistCell({ distributor, pricelistById }) {
  const id = Number(distributor?.odoo_pricelist_id || 0) || 0;
  if (!id) return <span className="muted">—</span>;
  const pricelist = pricelistById.get(id);
  const name = String(pricelist?.name || "").trim();
  if (!name) return <span>{id}</span>;
  return (
    <div>
      <div style={{ fontWeight: 800 }}>{name}</div>
      <div className="muted" style={{ fontSize: 12 }}>ID Odoo: {id}</div>
    </div>
  );
}


function MapsCell({ distributor, value, onChange, onSave, saving }) {
  const original = String(distributor?.default_maps_url || "").trim();
  const current = String(value || "").trim();
  const changed = current !== original;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", minWidth: 260 }}>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://maps.app.goo.gl/..."
        style={{ flex: 1, minWidth: 220, padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
      />
      <Button variant="secondary" disabled={saving || !changed} onClick={() => onSave(current)}>
        {saving ? "Guardando…" : "Guardar"}
      </Button>
    </div>
  );
}

export default function MyDistributorsPage() {
  const user = useAuthStore((s) => s.user);
  const canAccess = !!(user?.is_superuser || (user?.is_vendedor && !user?.is_distribuidor));
  const [searchText, setSearchText] = useState("");
  const [mapsDrafts, setMapsDrafts] = useState({});
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["myDistributors"],
    queryFn: listMyDistributors,
    enabled: canAccess,
  });

  const pricelistsQ = useQuery({
    queryKey: ["myDistributorsPricelists"],
    queryFn: getPricelists,
    enabled: canAccess,
    staleTime: 60 * 1000,
  });



  const saveMapsM = useMutation({
    mutationFn: ({ id, value }) => updateMyDistributorDefaultMapsUrl(id, value),
    onSuccess: () => {
      toast.success("URL de Google Maps guardada");
      qc.invalidateQueries({ queryKey: ["myDistributors"] });
    },
    onError: (e) => toast.error(e?.message || "No se pudo guardar la URL"),
  });

  const pricelistById = useMemo(() => {
    const map = new Map();
    for (const item of Array.isArray(pricelistsQ.data) ? pricelistsQ.data : []) {
      const id = Number(item?.id || 0) || 0;
      if (id) map.set(id, item);
    }
    return map;
  }, [pricelistsQ.data]);

  const distributors = q.data || [];

  useEffect(() => {
    const next = {};
    for (const d of distributors) next[d.id] = String(d?.default_maps_url || "");
    setMapsDrafts(next);
  }, [distributors]);
  const filteredDistributors = useMemo(() => {
    const search = normalizeSearch(searchText);
    if (!search) return distributors;
    return distributors.filter((d) => {
      const pricelistId = Number(d?.odoo_pricelist_id || 0) || 0;
      const pricelistName = pricelistId ? String(pricelistById.get(pricelistId)?.name || "") : "";
      const haystack = [
        d?.full_name,
        d?.username,
        d?.visible_password,
        d?.odoo_partner_id,
        d?.odoo_pricelist_id,
        d?.default_maps_url,
        pricelistName,
        d?.assigned_seller_username,
        d?.assigned_seller_full_name,
        d?.is_active ? "activo" : "inactivo",
      ].filter(Boolean).join(" ");
      return normalizeSearch(haystack).includes(search);
    });
  }, [distributors, pricelistById, searchText]);

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

  return (
    <div className="container">
      <div className="spacer" />
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Mis distribuidores</h2>
          <div className="muted">Listado de distribuidores asignados a tu usuario, con sus credenciales de acceso.</div>
        </div>
        <Button variant="secondary" onClick={() => { q.refetch(); pricelistsQ.refetch(); }} disabled={q.isFetching || pricelistsQ.isFetching}>
          {q.isFetching || pricelistsQ.isFetching ? "Actualizando…" : "Actualizar"}
        </Button>
      </div>

      <div className="spacer" />
      <div className="card">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Buscar por distribuidor, usuario, contraseña, lista de precios, partner o estado…"
            style={{ flex: 1, minWidth: 280, padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
          />
          <div className="muted" style={{ fontSize: 13 }}>
            {filteredDistributors.length} de {distributors.length}
          </div>
        </div>
        {pricelistsQ.isError ? (
          <div style={{ color: "#d93025", fontSize: 13, marginTop: 10 }}>
            No se pudieron cargar los nombres de listas desde Odoo. Se muestran los IDs.
          </div>
        ) : null}
      </div>

      <div className="spacer" />
      <div className="card">
        {q.isLoading ? <div className="muted">Cargando distribuidores…</div> : null}
        {q.isError ? <div style={{ color: "#d93025", fontSize: 13 }}>{q.error?.message || "No se pudieron cargar los distribuidores"}</div> : null}
        {!q.isLoading && !distributors.length ? <div className="muted">No tenés distribuidores asignados.</div> : null}
        {!q.isLoading && !!distributors.length && !filteredDistributors.length ? <div className="muted">No hay distribuidores que coincidan con la búsqueda.</div> : null}

        {!!filteredDistributors.length ? (
          <table>
            <thead>
              <tr>
                <th>Distribuidor</th>
                <th>Usuario</th>
                <th>Contraseña</th>
                <th>Lista de precios</th>
                <th>Partner Odoo</th>
                <th>Maps por defecto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filteredDistributors.map((d) => {
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
                    <td><PricelistCell distributor={d} pricelistById={pricelistById} /></td>
                    <td>{d.odoo_partner_id || <span className="muted">—</span>}</td>
                    <td>
                      <MapsCell
                        distributor={d}
                        value={mapsDrafts[d.id] ?? ""}
                        onChange={(value) => setMapsDrafts((prev) => ({ ...prev, [d.id]: value }))}
                        onSave={(value) => saveMapsM.mutate({ id: d.id, value })}
                        saving={saveMapsM.isPending && String(saveMapsM.variables?.id || "") === String(d.id)}
                      />
                    </td>
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
