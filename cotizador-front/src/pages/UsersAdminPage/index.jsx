import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { adminCreateUser, adminListUsers, adminUpdateUser } from "../../api/admin.js";

function norm(s) {
  return String(s || "").toLowerCase().trim();
}

export default function UsersAdminPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [roleTab, setRoleTab] = useState("all"); // all | vendedor | distribuidor | medidor
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState("all"); // all | true | false

  const [selectedId, setSelectedId] = useState(null);

  const usersQ = useQuery({
    queryKey: ["adminUsers", roleTab, q, activeFilter],
    queryFn: () => adminListUsers({ role: roleTab, q, active: activeFilter }),
    enabled: !!user?.is_enc_comercial,
  });

  const users = usersQ.data || [];

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return users.find((u) => String(u.id) === String(selectedId)) || null;
  }, [users, selectedId]);

  // Form state (create/edit)
  const [mode, setMode] = useState("create"); // create | edit
  const [fUsername, setFUsername] = useState("");
  const [fFullName, setFFullName] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [fIsVendedor, setFIsVendedor] = useState(true);
  const [fIsDistribuidor, setFIsDistribuidor] = useState(false);
  const [fIsMedidor, setFIsMedidor] = useState(false);
  const [fOdooPartnerId, setFOdooPartnerId] = useState("");
  const [fDefaultMapsUrl, setFDefaultMapsUrl] = useState("");
  const [fIsActive, setFIsActive] = useState(true);

  const resetCreate = () => {
    setMode("create");
    setSelectedId(null);
    setFUsername("");
    setFFullName("");
    setFPassword("");
    setFIsVendedor(roleTab !== "distribuidor" && roleTab !== "medidor");
    setFIsDistribuidor(roleTab === "distribuidor");
    setFIsMedidor(roleTab === "medidor");
    setFOdooPartnerId("");
    setFDefaultMapsUrl("");
    setFIsActive(true);
  };

  const loadEdit = (u) => {
    setMode("edit");
    setSelectedId(u.id);
    setFUsername(u.username);
    setFFullName(u.full_name || "");
    setFPassword(""); // vacío => no cambia
    setFIsVendedor(!!u.is_vendedor);
    setFIsDistribuidor(!!u.is_distribuidor);
    setFIsMedidor(!!u.is_medidor);
    setFOdooPartnerId(u.odoo_partner_id ? String(u.odoo_partner_id) : "");
    setFDefaultMapsUrl(u.default_maps_url ? String(u.default_maps_url) : "");
    setFIsActive(!!u.is_active);
  };

  const createM = useMutation({
    mutationFn: () =>
      adminCreateUser({
        username: fUsername,
        password: fPassword,
        full_name: fFullName,
        is_vendedor: fIsVendedor,
        is_distribuidor: fIsDistribuidor,
        is_medidor: fIsMedidor,
        odoo_partner_id: fOdooPartnerId ? Number(fOdooPartnerId) : null,
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
        password: fPassword ? fPassword : "", // vacío => no cambia
        is_vendedor: fIsVendedor,
        is_distribuidor: fIsDistribuidor,
        is_medidor: fIsMedidor,
        is_medidor: fIsMedidor,
        odoo_partner_id: fOdooPartnerId ? Number(fOdooPartnerId) : null,
        default_maps_url: fDefaultMapsUrl ? String(fDefaultMapsUrl) : null,
        is_active: fIsActive,
      }),
    onSuccess: () => {
      toast.success("Usuario actualizado");
      qc.invalidateQueries({ queryKey: ["adminUsers"] });
      // refrescar selección
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

  const filtered = users;

  return (
    <div className="container">
      <div className="spacer" />

      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Gestor de usuarios</h2>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={roleTab === "all" ? "primary" : "ghost"} onClick={() => { setRoleTab("all"); resetCreate(); }}>
            Todos
          </Button>
          <Button variant={roleTab === "vendedor" ? "primary" : "ghost"} onClick={() => { setRoleTab("vendedor"); resetCreate(); }}>
            Vendedores
          </Button>
          <Button variant={roleTab === "distribuidor" ? "primary" : "ghost"} onClick={() => { setRoleTab("distribuidor"); resetCreate(); }}>
            Distribuidores
          </Button>
          <Button variant={roleTab === "medidor" ? "primary" : "ghost"} onClick={() => { setRoleTab("medidor"); resetCreate(); }}>
            Medidores
          </Button>
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

          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 520, overflow: "auto", paddingRight: 6 }}>
            {filtered.map((u) => {
              const active = !!u.is_active;
              const isSel = String(u.id) === String(selectedId);
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
                  </div>

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
        </div>

        <div className="card" style={{ flex: 2, minWidth: 520 }}>
          <h3 style={{ marginTop: 0 }}>{mode === "create" ? "Crear usuario" : `Editar usuario #${selectedId}`}</h3>

          <div className="spacer" />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Usuario</div>
              <Input
                value={fUsername}
                onChange={setFUsername}
                placeholder="usuario"
                style={{ width: "100%" }}
                disabled={mode === "edit"}
              />
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
                  if (!fIsVendedor && !fIsDistribuidor && !fIsMedidor) return toast.error("Elegí Vendedor / Distribuidor / Medidor");
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
                  if (!fIsVendedor && !fIsDistribuidor && !fIsMedidor) return toast.error("Elegí Vendedor / Distribuidor / Medidor");
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
