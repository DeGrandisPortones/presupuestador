import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { adminCreateUser, adminListUsers, adminUpdateUser } from "../../api/admin.js";
import { getPricelists } from "../../api/odoo.js";

const PAGE_SIZE = 50;

function getRolesText(u) {
  const roles = [];
  if (u?.is_superuser) roles.push("Superusuario");
  if (u?.is_vendedor) roles.push("Vendedor");
  if (u?.is_distribuidor) roles.push("Distribuidor");
  if (u?.is_medidor) roles.push("Medidor");
  if (u?.is_logistica) roles.push("Logística");
  if (u?.is_administracion) roles.push("Administración");
  return roles.join(" · ") || "—";
}

function getUserDisplayName(u) {
  return String(u?.full_name || u?.username || "").trim();
}

function getPricelistName(pricelists, id) {
  const numericId = Number(id || 0) || 0;
  if (!numericId) return "—";
  const item = pricelists.find((pl) => Number(pl?.id || 0) === numericId);
  return item?.name ? `${item.name} · ${numericId}` : String(numericId);
}

export default function UsersAdminPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [roleTab, setRoleTab] = useState("all");
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);

  const [mode, setMode] = useState("create");
  const [fUsername, setFUsername] = useState("");
  const [fFullName, setFFullName] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [fIsVendedor, setFIsVendedor] = useState(true);
  const [fIsDistribuidor, setFIsDistribuidor] = useState(false);
  const [fIsMedidor, setFIsMedidor] = useState(false);
  const [fIsSuperuser, setFIsSuperuser] = useState(false);
  const [fIsAdministracion, setFIsAdministracion] = useState(false);
  const [fOdooPartnerId, setFOdooPartnerId] = useState("");
  const [fOdooPricelistId, setFOdooPricelistId] = useState("");
  const [fAssignedSellerUserId, setFAssignedSellerUserId] = useState("");
  const [fDefaultMapsUrl, setFDefaultMapsUrl] = useState("");
  const [fIsActive, setFIsActive] = useState(true);

  const usersQ = useQuery({
    queryKey: ["adminUsers", roleTab, q, activeFilter],
    queryFn: () => adminListUsers({ role: roleTab, q, active: activeFilter }),
    enabled: !!user?.is_enc_comercial,
  });

  const vendorUsersQ = useQuery({
    queryKey: ["adminUsers", "vendedores-activos-para-distribuidores"],
    queryFn: () => adminListUsers({ role: "vendedor", active: "true" }),
    enabled: !!user?.is_enc_comercial,
    staleTime: 60 * 1000,
  });

  const pricelistsQ = useQuery({
    queryKey: ["odooPricelistsForUsersAdmin"],
    queryFn: getPricelists,
    enabled: !!user?.is_enc_comercial,
    staleTime: 60 * 1000,
  });

  const users = usersQ.data || [];
  const vendorUsers = vendorUsersQ.data || [];
  const pricelists = Array.isArray(pricelistsQ.data) ? pricelistsQ.data : [];
  const filtered = users;

  const visibleUsers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [roleTab, q, activeFilter]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [filtered.length, page]);

  useEffect(() => {
    if (!fIsDistribuidor && fOdooPricelistId) setFOdooPricelistId("");
    if (!fIsDistribuidor && fAssignedSellerUserId) setFAssignedSellerUserId("");
  }, [fIsDistribuidor, fOdooPricelistId, fAssignedSellerUserId]);

  const resetCreate = () => {
    setMode("create");
    setSelectedId(null);
    setFUsername("");
    setFFullName("");
    setFPassword("");
    setFIsVendedor(roleTab !== "distribuidor" && roleTab !== "medidor" && roleTab !== "superuser" && roleTab !== "administracion");
    setFIsDistribuidor(roleTab === "distribuidor");
    setFIsMedidor(roleTab === "medidor");
    setFIsSuperuser(roleTab === "superuser");
    setFIsAdministracion(roleTab === "administracion");
    setFOdooPartnerId("");
    setFOdooPricelistId("");
    setFAssignedSellerUserId("");
    setFDefaultMapsUrl("");
    setFIsActive(true);
  };

  const loadEdit = (u) => {
    setMode("edit");
    setSelectedId(u.id);
    setFUsername(u.username);
    setFFullName(u.full_name || "");
    setFPassword("");
    setFIsVendedor(!!u.is_vendedor);
    setFIsDistribuidor(!!u.is_distribuidor);
    setFIsMedidor(!!u.is_medidor);
    setFIsSuperuser(!!u.is_superuser);
    setFIsAdministracion(!!u.is_administracion);
    setFOdooPartnerId(u.odoo_partner_id ? String(u.odoo_partner_id) : "");
    setFOdooPricelistId(u.odoo_pricelist_id ? String(u.odoo_pricelist_id) : "");
    setFAssignedSellerUserId(u.assigned_seller_user_id ? String(u.assigned_seller_user_id) : "");
    setFDefaultMapsUrl(u.default_maps_url ? String(u.default_maps_url) : "");
    setFIsActive(!!u.is_active);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function ensureAtLeastOneRole() {
    if (!fIsVendedor && !fIsDistribuidor && !fIsMedidor && !fIsSuperuser && !fIsAdministracion) {
      toast.error("Elegí Vendedor / Distribuidor / Medidor / Superusuario / Administración");
      return false;
    }
    return true;
  }

  function ensureDistributorPricelist() {
    if (fIsDistribuidor && !fOdooPricelistId) {
      toast.error("Elegí una lista de precios para el distribuidor");
      return false;
    }
    return true;
  }

  function ensureDistributorSeller() {
    if (fIsDistribuidor && !fAssignedSellerUserId) {
      toast.error("Elegí un vendedor asignado para el distribuidor");
      return false;
    }
    return true;
  }

  const createM = useMutation({
    mutationFn: () =>
      adminCreateUser({
        username: fUsername,
        password: fPassword,
        full_name: fFullName,
        is_vendedor: fIsVendedor,
        is_distribuidor: fIsDistribuidor,
        is_medidor: fIsMedidor,
        is_superuser: fIsSuperuser,
        is_administracion: fIsAdministracion,
        odoo_partner_id: fOdooPartnerId ? Number(fOdooPartnerId) : null,
        odoo_pricelist_id: fIsDistribuidor && fOdooPricelistId ? Number(fOdooPricelistId) : null,
        assigned_seller_user_id: fIsDistribuidor && fAssignedSellerUserId ? Number(fAssignedSellerUserId) : null,
        default_maps_url: fDefaultMapsUrl ? String(fDefaultMapsUrl) : null,
        is_active: fIsActive,
      }),
    onSuccess: () => {
      toast.success("Usuario creado");
      qc.invalidateQueries({ queryKey: ["adminUsers"] });
      resetCreate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateM = useMutation({
    mutationFn: () =>
      adminUpdateUser(selectedId, {
        full_name: fFullName,
        password: fPassword ? fPassword : "",
        is_vendedor: fIsVendedor,
        is_distribuidor: fIsDistribuidor,
        is_medidor: fIsMedidor,
        is_superuser: fIsSuperuser,
        is_administracion: fIsAdministracion,
        odoo_partner_id: fOdooPartnerId ? Number(fOdooPartnerId) : null,
        odoo_pricelist_id: fIsDistribuidor && fOdooPricelistId ? Number(fOdooPricelistId) : null,
        assigned_seller_user_id: fIsDistribuidor && fAssignedSellerUserId ? Number(fAssignedSellerUserId) : null,
        default_maps_url: fDefaultMapsUrl ? String(fDefaultMapsUrl) : null,
        is_active: fIsActive,
      }),
    onSuccess: () => {
      toast.success("Usuario actualizado");
      qc.invalidateQueries({ queryKey: ["adminUsers"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleActiveM = useMutation({
    mutationFn: ({ id, nextActive }) => adminUpdateUser(id, { is_active: nextActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminUsers"] }),
    onError: (e) => toast.error(e.message),
  });

  if (!user?.is_enc_comercial) {
    return (
      <div className="container">
        <div className="spacer" />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Gestor de usuarios</h2>
          <div className="muted">No tenés permisos (solo Encargado Comercial).</div>
        </div>
      </div>
    );
  }

  const submitForm = () => {
    if (mode === "create") {
      if (!fUsername.trim()) return toast.error("Falta username");
      if (!fPassword) return toast.error("Falta password");
      if (!ensureAtLeastOneRole()) return;
      if (!ensureDistributorPricelist()) return;
      if (!ensureDistributorSeller()) return;
      createM.mutate();
      return;
    }
    if (!ensureAtLeastOneRole()) return;
    if (!ensureDistributorPricelist()) return;
    if (!ensureDistributorSeller()) return;
    updateM.mutate();
  };

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

      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Gestor de usuarios</h2>
          <div className="muted">Crear, editar y administrar vendedores, distribuidores, medidores y superusuarios.</div>
        </div>
        <Button onClick={resetCreate} variant="primary">Nuevo usuario</Button>
      </div>

      <div className="spacer" />

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>{mode === "create" ? "Crear usuario" : `Editar usuario #${selectedId}`}</h3>
          <div className="muted" style={{ fontSize: 13 }}>
            {mode === "edit" ? "Seleccionaste un usuario de la tabla." : "Cargá los datos y tocá Crear."}
          </div>
        </div>

        <div className="spacer" />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Usuario</div>
            <Input value={fUsername} onChange={setFUsername} placeholder="usuario" style={{ width: "100%" }} disabled={mode === "edit"} />
          </div>

          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Nombre</div>
            <Input value={fFullName} onChange={setFFullName} placeholder="Nombre completo" style={{ width: "100%" }} />
          </div>

          <div>
            <div className="muted" style={{ marginBottom: 6 }}>{mode === "create" ? "Contraseña" : "Nueva contraseña (opcional)"}</div>
            <Input
              value={fPassword}
              onChange={setFPassword}
              placeholder={mode === "create" ? "Contraseña" : "Dejar vacío para no cambiar"}
              style={{ width: "100%" }}
              type="password"
            />
            {mode === "edit" && fIsDistribuidor ? <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Si cargás una nueva contraseña, se mostrará en Mis distribuidores.</div> : null}
          </div>

          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Odoo partner ID (opcional)</div>
            <Input value={fOdooPartnerId} onChange={setFOdooPartnerId} placeholder="12345" style={{ width: "100%" }} />
          </div>

          {fIsDistribuidor ? (
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Lista de precios del distribuidor</div>
              <select
                value={fOdooPricelistId}
                onChange={(e) => setFOdooPricelistId(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              >
                <option value="">Seleccione lista…</option>
                {pricelists.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name}{pl.active === false ? " (inactiva)" : ""}
                  </option>
                ))}
              </select>
              {pricelistsQ.isLoading ? <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Cargando listas desde Odoo…</div> : null}
              {pricelistsQ.isError ? <div style={{ color: "#d93025", fontSize: 12, marginTop: 6 }}>{pricelistsQ.error.message}</div> : null}
            </div>
          ) : null}

          {fIsDistribuidor ? (
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Vendedor asignado</div>
              <select
                value={fAssignedSellerUserId}
                onChange={(e) => setFAssignedSellerUserId(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              >
                <option value="">Seleccione vendedor…</option>
                {vendorUsers.map((v) => (
                  <option key={v.id} value={v.id}>
                    {getUserDisplayName(v)} · {v.username}
                  </option>
                ))}
              </select>
              {vendorUsersQ.isLoading ? <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Cargando vendedores…</div> : null}
              {vendorUsersQ.isError ? <div style={{ color: "#d93025", fontSize: 12, marginTop: 6 }}>{vendorUsersQ.error.message}</div> : null}
            </div>
          ) : null}

          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Maps por defecto (URL)</div>
            <Input value={fDefaultMapsUrl} onChange={setFDefaultMapsUrl} placeholder="https://maps.app.goo.gl/..." style={{ width: "100%" }} />
          </div>
        </div>

        <div className="spacer" />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={fIsVendedor} onChange={(e) => setFIsVendedor(e.target.checked)} />
              Vendedor
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={fIsDistribuidor} onChange={(e) => setFIsDistribuidor(e.target.checked)} />
              Distribuidor
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={fIsMedidor} onChange={(e) => setFIsMedidor(e.target.checked)} />
              Medidor
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={fIsSuperuser} onChange={(e) => setFIsSuperuser(e.target.checked)} />
              Superusuario
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={fIsAdministracion} onChange={(e) => setFIsAdministracion(e.target.checked)} />
              Administración
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={fIsActive} onChange={(e) => setFIsActive(e.target.checked)} />
              Activo
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="primary" onClick={submitForm} disabled={createM.isPending || updateM.isPending}>
              {mode === "create"
                ? (createM.isPending ? "Creando…" : "Crear")
                : (updateM.isPending ? "Guardando…" : "Guardar cambios")}
            </Button>
            <Button variant="secondary" onClick={resetCreate}>Limpiar / nuevo</Button>
          </div>
        </div>

        {(createM.isError || updateM.isError) && <div className="spacer" />}
        {(createM.isError || updateM.isError) && (
          <div style={{ color: "#d93025", fontSize: 13 }}>
            {(createM.error || updateM.error)?.message}
          </div>
        )}
      </div>

      <div className="spacer" />

      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={roleTab === "all" ? "primary" : "ghost"} onClick={() => { setRoleTab("all"); resetCreate(); }}>Todos</Button>
          <Button variant={roleTab === "vendedor" ? "primary" : "ghost"} onClick={() => { setRoleTab("vendedor"); resetCreate(); }}>Vendedores</Button>
          <Button variant={roleTab === "distribuidor" ? "primary" : "ghost"} onClick={() => { setRoleTab("distribuidor"); resetCreate(); }}>Distribuidores</Button>
          <Button variant={roleTab === "medidor" ? "primary" : "ghost"} onClick={() => { setRoleTab("medidor"); resetCreate(); }}>Medidores</Button>
          <Button variant={roleTab === "superuser" ? "primary" : "ghost"} onClick={() => { setRoleTab("superuser"); resetCreate(); }}>Superusuarios</Button>
          <Button variant={roleTab === "administracion" ? "primary" : "ghost"} onClick={() => { setRoleTab("administracion"); resetCreate(); }}>Administración</Button>
        </div>
        <Button variant="ghost" onClick={() => usersQ.refetch()} disabled={usersQ.isFetching}>↻ Actualizar</Button>
      </div>

      <div className="spacer" />

      <div className="card">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Input value={q} onChange={setQ} placeholder="Buscar por usuario o nombre…" style={{ flex: 1, minWidth: 260 }} />
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 190 }}
          >
            <option value="all">Activos e inactivos</option>
            <option value="true">Solo activos</option>
            <option value="false">Solo inactivos</option>
          </select>
          <div className="muted" style={{ fontSize: 13 }}>
            {visibleUsers.length} visibles · {filtered.length} total
          </div>
        </div>
      </div>

      <div className="spacer" />

      <div className="card" style={{ overflowX: "auto" }}>
        {usersQ.isLoading && <div className="muted">Cargando…</div>}
        {usersQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{usersQ.error.message}</div>}
        {!usersQ.isLoading && !filtered.length && <div className="muted">Sin usuarios</div>}

        {!!filtered.length && (
          <>
            <table style={{ width: "100%", minWidth: 1180, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "8%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "12%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Usuario</th>
                  <th>Nombre</th>
                  <th>Roles</th>
                  <th>Vendedor asignado</th>
                  <th>Lista / Partner</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((u) => {
                  const active = !!u.is_active;
                  const isSel = String(u.id) === String(selectedId);
                  return (
                    <tr key={u.id} style={{ background: isSel ? "rgba(1,163,159,0.08)" : "transparent" }}>
                      <td style={tableCellStyle}>#{u.id}</td>
                      <td style={tableCellStyle}>
                        <div style={{ fontWeight: 900 }}>{u.username}</div>
                        {u.visible_password ? <div className="muted" style={{ fontSize: 12 }}>Pass: {u.visible_password}</div> : null}
                      </td>
                      <td style={tableCellStyle}>{u.full_name || <span className="muted">Sin nombre</span>}</td>
                      <td style={tableCellStyle}>{getRolesText(u)}</td>
                      <td style={tableCellStyle}>
                        {u.is_distribuidor ? (
                          <span>{u.assigned_seller_full_name || u.assigned_seller_username || "Sin asignar"}</span>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td style={tableCellStyle}>
                        {u.odoo_pricelist_id ? <div>{getPricelistName(pricelists, u.odoo_pricelist_id)}</div> : <div className="muted">Sin lista</div>}
                        {u.odoo_partner_id ? <div className="muted" style={{ fontSize: 12 }}>Partner: {u.odoo_partner_id}</div> : null}
                      </td>
                      <td style={tableCellStyle}>{active ? "Activo" : "Inactivo"}</td>
                      <td style={tableCellStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Button variant="secondary" onClick={() => loadEdit(u)}>Editar</Button>
                          <Button
                            variant="ghost"
                            onClick={() => toggleActiveM.mutate({ id: u.id, nextActive: !active })}
                            disabled={toggleActiveM.isPending}
                          >
                            {active ? "Inhabilitar" : "Habilitar"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <PaginationControls page={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
