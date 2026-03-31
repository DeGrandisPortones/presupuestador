import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { adminCreateUser, adminListUsers, adminUpdateUser } from "../../api/admin.js";
import { getPricelists } from "../../api/odoo.js";

const PAGE_SIZE = 25;

export default function UsersAdminPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [roleTab, setRoleTab] = useState("all");
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);

  const usersQ = useQuery({
    queryKey: ["adminUsers", roleTab, q, activeFilter],
    queryFn: () => adminListUsers({ role: roleTab, q, active: activeFilter }),
    enabled: !!user?.is_enc_comercial,
  });

  const pricelistsQ = useQuery({
    queryKey: ["odooPricelistsForUsersAdmin"],
    queryFn: getPricelists,
    enabled: !!user?.is_enc_comercial,
    staleTime: 60 * 1000,
  });

  const users = usersQ.data || [];
  const pricelists = Array.isArray(pricelistsQ.data) ? pricelistsQ.data : [];

  const [mode, setMode] = useState("create");
  const [fUsername, setFUsername] = useState("");
  const [fFullName, setFFullName] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [fIsVendedor, setFIsVendedor] = useState(true);
  const [fIsDistribuidor, setFIsDistribuidor] = useState(false);
  const [fIsMedidor, setFIsMedidor] = useState(false);
  const [fIsSuperuser, setFIsSuperuser] = useState(false);
  const [fOdooPartnerId, setFOdooPartnerId] = useState("");
  const [fOdooPricelistId, setFOdooPricelistId] = useState("");
  const [fDefaultMapsUrl, setFDefaultMapsUrl] = useState("");
  const [fIsActive, setFIsActive] = useState(true);

  const resetCreate = () => {
    setMode("create");
    setSelectedId(null);
    setFUsername("");
    setFFullName("");
    setFPassword("");
    setFIsVendedor(roleTab !== "distribuidor" && roleTab !== "medidor" && roleTab !== "superuser");
    setFIsDistribuidor(roleTab === "distribuidor");
    setFIsMedidor(roleTab === "medidor");
    setFIsSuperuser(roleTab === "superuser");
    setFOdooPartnerId("");
    setFOdooPricelistId("");
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
    setFOdooPartnerId(u.odoo_partner_id ? String(u.odoo_partner_id) : "");
    setFOdooPricelistId(u.odoo_pricelist_id ? String(u.odoo_pricelist_id) : "");
    setFDefaultMapsUrl(u.default_maps_url ? String(u.default_maps_url) : "");
    setFIsActive(!!u.is_active);
  };

  useEffect(() => {
    if (!fIsDistribuidor && fOdooPricelistId) setFOdooPricelistId("");
  }, [fIsDistribuidor, fOdooPricelistId]);

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
        odoo_partner_id: fOdooPartnerId ? Number(fOdooPartnerId) : null,
        odoo_pricelist_id: fIsDistribuidor && fOdooPricelistId ? Number(fOdooPricelistId) : null,
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
        odoo_partner_id: fOdooPartnerId ? Number(fOdooPartnerId) : null,
        odoo_pricelist_id: fIsDistribuidor && fOdooPricelistId ? Number(fOdooPricelistId) : null,
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

  useEffect(() => {
    setPage(1);
  }, [roleTab, q, activeFilter]);

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

  const filtered = users;

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [filtered.length, page]);

  const visibleUsers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  function ensureAtLeastOneRole() {
    if (!fIsVendedor && !fIsDistribuidor && !fIsMedidor && !fIsSuperuser) {
      toast.error("Elegí Vendedor / Distribuidor / Medidor / Superusuario");
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

  return (
    <div className="container">
      <div className="spacer" />

      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Gestor de usuarios</h2>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={roleTab === "all" ? "primary" : "ghost"} onClick={() => { setRoleTab("all"); resetCreate(); }}>Todos</Button>
          <Button variant={roleTab === "vendedor" ? "primary" : "ghost"} onClick={() => { setRoleTab("vendedor"); resetCreate(); }}>Vendedores</Button>
          <Button variant={roleTab === "distribuidor" ? "primary" : "ghost"} onClick={() => { setRoleTab("distribuidor"); resetCreate(); }}>Distribuidores</Button>
          <Button variant={roleTab === "medidor" ? "primary" : "ghost"} onClick={() => { setRoleTab("medidor"); resetCreate(); }}>Medidores</Button>
          <Button variant={roleTab === "superuser" ? "primary" : "ghost"} onClick={() => { setRoleTab("superuser"); resetCreate(); }}>Superusuarios</Button>
        </div>
      </div>

      <div className="spacer" />

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="card" style={{ flex: 1, minWidth: 320 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>Listado</h3>
            <Button variant="ghost" onClick={() => usersQ.refetch()} disabled={usersQ.isFetching}>↻</Button>
          </div>

          <div className="spacer" />

          <Input value={q} onChange={setQ} placeholder="Buscar por usuario o nombre…" style={{ width: "100%" }} />

          <div className="spacer" />

          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", flex: 1 }}
            >
              <option value="all">Activos e inactivos</option>
              <option value="true">Solo activos</option>
              <option value="false">Solo inactivos</option>
            </select>
            <Button onClick={resetCreate} variant="secondary">Nuevo</Button>
          </div>

          <div className="spacer" />

          {usersQ.isLoading && <div className="muted">Cargando…</div>}
          {usersQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{usersQ.error.message}</div>}
          {!usersQ.isLoading && !filtered.length && <div className="muted">Sin usuarios</div>}

          {!!filtered.length && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {visibleUsers.map((u) => {
                  const active = !!u.is_active;
                  const isSel = String(u.id) === String(selectedId);
                  const roles = [];
                  if (u.is_superuser) roles.push("Superusuario");
                  if (u.is_vendedor) roles.push("Vendedor");
                  if (u.is_distribuidor) roles.push("Distribuidor");
                  if (u.is_medidor) roles.push("Medidor");

                  return (
                    <div
                      key={u.id}
                      style={{
                        border: "1px solid #eee",
                        padding: 10,
                        borderRadius: 12,
                        cursor: "pointer",
                        background: isSel ? "rgba(1,163,159,0.08)" : "transparent",
                      }}
                      onClick={() => loadEdit(u)}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontWeight: 800 }}>{u.username}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{active ? "Activo" : "Inactivo"}</div>
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {u.full_name || "(sin nombre)"}
                        {u.odoo_partner_id ? ` · Odoo partner: ${u.odoo_partner_id}` : ""}
                        {u.odoo_pricelist_id ? ` · Lista: ${u.odoo_pricelist_id}` : ""}
                      </div>
                      {!!roles.length && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {roles.join(" · ")}
                        </div>
                      )}

                      <div style={{ marginTop: 8, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <Button
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleActiveM.mutate({ id: u.id, nextActive: !active });
                          }}
                          disabled={toggleActiveM.isPending}
                        >
                          {active ? "Inhabilitar" : "Habilitar"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <PaginationControls page={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
            </>
          )}
        </div>

        <div className="card" style={{ flex: 2, minWidth: 520 }}>
          <h3 style={{ marginTop: 0 }}>{mode === "create" ? "Crear usuario" : `Editar usuario #${selectedId}`}</h3>

          <div className="spacer" />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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

            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Maps por defecto (URL)</div>
              <Input value={fDefaultMapsUrl} onChange={setFDefaultMapsUrl} placeholder="https://maps.app.goo.gl/..." style={{ width: "100%" }} />
            </div>
          </div>

          <div className="spacer" />

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
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 10 }}>
              <input type="checkbox" checked={fIsActive} onChange={(e) => setFIsActive(e.target.checked)} />
              Activo
            </label>
          </div>

          <div className="spacer" />

          <div style={{ display: "flex", gap: 8 }}>
            {mode === "create" ? (
              <Button
                variant="primary"
                onClick={() => {
                  if (!fUsername.trim()) return toast.error("Falta username");
                  if (!fPassword) return toast.error("Falta password");
                  if (!ensureAtLeastOneRole()) return;
                  if (!ensureDistributorPricelist()) return;
                  createM.mutate();
                }}
                disabled={createM.isPending}
              >
                {createM.isPending ? "Creando…" : "Crear"}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  if (!ensureAtLeastOneRole()) return;
                  if (!ensureDistributorPricelist()) return;
                  updateM.mutate();
                }}
                disabled={updateM.isPending}
              >
                {updateM.isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
            )}

            <Button variant="secondary" onClick={resetCreate}>Volver a crear</Button>
          </div>

          {(createM.isError || updateM.isError) && <div className="spacer" />}
          {(createM.isError || updateM.isError) && (
            <div style={{ color: "#d93025", fontSize: 13 }}>
              {(createM.error || updateM.error)?.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
