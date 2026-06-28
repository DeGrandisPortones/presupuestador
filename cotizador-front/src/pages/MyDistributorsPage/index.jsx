import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { listMyDistributors, updateMyDistributorDefaultMapsUrl, updateMyDistributorPhone } from "../../api/sellerDistributors.js";
import { getPricelists } from "../../api/odoo.js";
import { useAuthStore } from "../../domain/auth/store.js";

const PAGE_SIZE = 25;

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
      <code style={{ fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" }}>{password}</code>
      <Button variant="ghost" onClick={() => copyToClipboard(password, "Contrasena")}>Copiar</Button>
    </div>
  );
}

function PricelistCell({ distributor, pricelistById }) {
  const id = Number(distributor?.odoo_pricelist_id || 0) || 0;
  if (!id) return <span className="muted">-</span>;
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

function SellerCell({ distributor }) {
  const sellerName = String(distributor?.assigned_seller_full_name || "").trim();
  const sellerUser = String(distributor?.assigned_seller_username || "").trim();
  if (!sellerName && !sellerUser) return <span className="muted">Sin vendedor</span>;
  return (
    <div>
      <div style={{ fontWeight: 800 }}>{sellerName || sellerUser}</div>
      {sellerName && sellerUser ? <div className="muted" style={{ fontSize: 12 }}>{sellerUser}</div> : null}
    </div>
  );
}

function PhoneCell({ distributor, value, onChange, onSave, saving }) {
  const original = String(distributor?.phone || "").trim();
  const current = String(value || "").trim();
  const changed = current !== original;
  return (
    <div style={{ display: "grid", gap: 8, width: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(130px, 1fr) auto", gap: 8, alignItems: "center", width: "100%" }}>
        <input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ej. 3516123456"
          style={{ width: "100%", minWidth: 0, padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
        />
        <Button variant="secondary" disabled={saving || !changed} onClick={() => onSave(current)}>
          {saving ? "Guardando..." : "Guardar"}
        </Button>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>Teléfono del distribuidor para notificaciones de medición.</div>
    </div>
  );
}

function MapsCell({ distributor, value, onChange, onSave, saving }) {
  const original = String(distributor?.default_maps_url || "").trim();
  const current = String(value || "").trim();
  const changed = current !== original;
  return (
    <div style={{ display: "grid", gap: 8, width: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) auto", gap: 8, alignItems: "center", width: "100%" }}>
        <input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://maps.app.goo.gl/..."
          style={{ width: "100%", minWidth: 0, padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
        />
        <Button variant="secondary" disabled={saving || !changed} onClick={() => onSave(current)}>
          {saving ? "Guardando..." : "Guardar"}
        </Button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {original ? (
          <a href={original} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 800 }}>
            Abrir Maps
          </a>
        ) : null}
        <span className="muted" style={{ fontSize: 12 }}>
          El vendedor puede cargar la URL que se usara como ubicacion por defecto del distribuidor.
        </span>
      </div>
    </div>
  );
}

export default function MyDistributorsPage() {
  const user = useAuthStore((s) => s.user);
  const canAccess = !!(user?.is_superuser || user?.is_enc_comercial || (user?.is_vendedor && !user?.is_distribuidor));
  const canSeeAll = !!(user?.is_superuser || user?.is_enc_comercial);
  const [searchText, setSearchText] = useState("");
  const [mapsDrafts, setMapsDrafts] = useState({});
  const [phoneDrafts, setPhoneDrafts] = useState({});
  const [page, setPage] = useState(1);
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

  const savePhoneM = useMutation({
    mutationFn: ({ id, value }) => updateMyDistributorPhone(id, value),
    onSuccess: () => {
      toast.success("Teléfono guardado");
      qc.invalidateQueries({ queryKey: ["myDistributors"] });
    },
    onError: (e) => toast.error(e?.message || "No se pudo guardar el teléfono"),
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
    const nextMaps = {};
    const nextPhone = {};
    for (const d of distributors) {
      nextMaps[d.id] = String(d?.default_maps_url || "");
      nextPhone[d.id] = String(d?.phone || "");
    }
    setMapsDrafts(nextMaps);
    setPhoneDrafts(nextPhone);
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

  useEffect(() => { setPage(1); }, [searchText]);

  const pagedDistributors = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredDistributors.slice(start, start + PAGE_SIZE);
  }, [filteredDistributors, page]);

  if (!canAccess) {
    return (
      <div className="container">
        <div className="spacer" />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Mis distribuidores</h2>
          <div className="muted">No tenes permisos para ver esta seccion.</div>
        </div>
      </div>
    );
  }

  const pageStyle = {
    maxWidth: "none",
    width: "calc(100vw - 48px)",
    marginLeft: "auto",
    marginRight: "auto",
    paddingLeft: 0,
    paddingRight: 0,
  };

  const tableCellStyle = {
    verticalAlign: "top",
    whiteSpace: "normal",
    wordBreak: "break-word",
  };

  return (
    <div className="container" style={pageStyle}>
      <div className="spacer" />
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Mis distribuidores</h2>
          <div className="muted">
            {canSeeAll
              ? "Listado completo de distribuidores, con vendedor asignado y credenciales de acceso."
              : "Listado de distribuidores asignados a tu usuario, con credenciales y URL de Google Maps editable."}
          </div>
        </div>
        <Button variant="secondary" onClick={() => { q.refetch(); pricelistsQ.refetch(); }} disabled={q.isFetching || pricelistsQ.isFetching}>
          {q.isFetching || pricelistsQ.isFetching ? "Actualizando..." : "Actualizar"}
        </Button>
      </div>

      <div className="spacer" />
      <div className="card">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Buscar por distribuidor, vendedor, usuario, contrasena, lista de precios, partner o estado..."
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
      <div className="card" style={{ overflowX: "auto" }}>
        {q.isLoading ? <div className="muted">Cargando distribuidores...</div> : null}
        {q.isError ? <div style={{ color: "#d93025", fontSize: 13 }}>{q.error?.message || "No se pudieron cargar los distribuidores"}</div> : null}
        {!q.isLoading && !distributors.length ? <div className="muted">No hay distribuidores para mostrar.</div> : null}
        {!q.isLoading && !!distributors.length && !filteredDistributors.length ? <div className="muted">No hay distribuidores que coincidan con la busqueda.</div> : null}

        {!!filteredDistributors.length ? (
          <table style={{ width: "100%", minWidth: 1560, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "14%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "6%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Distribuidor</th>
                <th>Vendedor</th>
                <th>Usuario</th>
                <th>Contrasena</th>
                <th>Lista de precios</th>
                <th>Partner Odoo</th>
                <th>Teléfono</th>
                <th>Maps por defecto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {pagedDistributors.map((d) => {
                const username = String(d.username || "").trim();
                return (
                  <tr key={d.id}>
                    <td style={tableCellStyle}>
                      <div style={{ fontWeight: 900 }}>{d.full_name || username}</div>
                      {d.full_name ? <div className="muted" style={{ fontSize: 12 }}>{username}</div> : null}
                    </td>
                    <td style={tableCellStyle}><SellerCell distributor={d} /></td>
                    <td style={tableCellStyle}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <code style={{ fontSize: 14, fontWeight: 800 }}>{username}</code>
                        <Button variant="ghost" onClick={() => copyToClipboard(username, "Usuario")}>Copiar</Button>
                      </div>
                    </td>
                    <td style={tableCellStyle}><PasswordCell value={d.visible_password} /></td>
                    <td style={tableCellStyle}><PricelistCell distributor={d} pricelistById={pricelistById} /></td>
                    <td style={tableCellStyle}>{d.odoo_partner_id || <span className="muted">-</span>}</td>
                    <td style={tableCellStyle}>
                      <PhoneCell
                        distributor={d}
                        value={phoneDrafts[d.id] ?? ""}
                        onChange={(value) => setPhoneDrafts((prev) => ({ ...prev, [d.id]: value }))}
                        onSave={(value) => savePhoneM.mutate({ id: d.id, value })}
                        saving={savePhoneM.isPending && String(savePhoneM.variables?.id || "") === String(d.id)}
                      />
                    </td>
                    <td style={tableCellStyle}>
                      <MapsCell
                        distributor={d}
                        value={mapsDrafts[d.id] ?? ""}
                        onChange={(value) => setMapsDrafts((prev) => ({ ...prev, [d.id]: value }))}
                        onSave={(value) => saveMapsM.mutate({ id: d.id, value })}
                        saving={saveMapsM.isPending && String(saveMapsM.variables?.id || "") === String(d.id)}
                      />
                    </td>
                    <td style={tableCellStyle}>{d.is_active ? "Activo" : "Inactivo"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
        <PaginationControls
          page={page}
          totalItems={filteredDistributors.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
