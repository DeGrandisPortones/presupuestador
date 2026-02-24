import { Outlet, useNavigate, NavLink } from "react-router-dom";
import Button from "../ui/Button.jsx";
import { useAuthStore } from "../domain/auth/store.js";

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const roles = [];
  if (user?.is_distribuidor) roles.push("Distribuidor");
  if (user?.is_vendedor) roles.push("Vendedor");
  if (user?.is_enc_comercial) roles.push("Enc. Comercial");
  if (user?.is_rev_tecnica) roles.push("Rev. Técnica");
  if (user?.is_medidor) roles.push("Medidor");

  const roleText = roles.length ? roles.join(" / ") : "Cargando sesión...";

  // ✅ Dashboard solo para Enc. Comercial (el distribuidor NO lo ve)
  const showDashboard = !!user?.is_enc_comercial;

  // ✅ Cotizadores + Mis presupuestos solo para vendedor/distribuidor
  const canQuote = !!(user?.is_vendedor || user?.is_distribuidor);

  return (
    <div>
      <div className="card app-header" style={{ borderRadius: 0 }}>
        <div
          className="container"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 0 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img className="brand-logo" src="/brands/dflex.png" alt="Dflex" />
            <div>
              <div style={{ fontWeight: 900 }}>Presupuestador</div>
              <div className="muted">{user ? `${user.username} · ${roleText}` : roleText}</div>
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
          >
            Salir
          </Button>
        </div>

        <div className="container" style={{ padding: 0, marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/menu">
            Menú
          </NavLink>

          {canQuote && (
            <>
              <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/cotizador" end>
                Cotizador Portones
              </NavLink>

              <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/cotizador/ipanel">
                Cotizador Ipanel
              </NavLink>

              <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/presupuestos">
                Mis presupuestos
              </NavLink>
            </>
          )}

          {user?.is_medidor && (
            <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/mediciones">
              Mediciones
            </NavLink>
          )}

          {user?.is_enc_comercial && (
            <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/aprobacion/comercial">
              Aprobación Comercial
            </NavLink>
          )}

          {showDashboard && (
            <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/dashboard">
              Dashboard
            </NavLink>
          )}

          {user?.is_enc_comercial && (
            <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/usuarios">
              Gestor de usuarios
            </NavLink>
          )}

          {user?.is_rev_tecnica && (
            <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/aprobacion/tecnica">
              Revisión Técnica
            </NavLink>
          )}
        </div>
      </div>

      <Outlet />
    </div>
  );
}
