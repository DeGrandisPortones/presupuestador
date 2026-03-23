import { Outlet, useNavigate, NavLink } from "react-router-dom";
import Button from "../ui/Button.jsx";
import { useAuthStore } from "../domain/auth/store.js";

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const isSuperuser = !!user?.is_superuser;

  const roles = [];
  if (isSuperuser) roles.push("Superusuario");
  if (user?.is_distribuidor) roles.push("Distribuidor");
  if (user?.is_vendedor) roles.push("Vendedor");
  if (user?.is_enc_comercial) roles.push("Enc. Comercial");
  if (user?.is_rev_tecnica) roles.push("Rev. Técnica");
  if (user?.is_medidor) roles.push("Medidor");
  if (user?.is_logistica) roles.push("Logística");

  const roleText = roles.length ? roles.join(" / ") : "Cargando sesión...";

  const showDashboard = !!(isSuperuser || user?.is_enc_comercial);
  const showUsers = !!(isSuperuser || user?.is_enc_comercial);
  const canQuote = !!(isSuperuser || user?.is_vendedor || user?.is_distribuidor);
  const showMediciones = !!(isSuperuser || user?.is_medidor) && !user?.is_rev_tecnica;
  const showCommercial = !!(isSuperuser || user?.is_enc_comercial);
  const showTechnical = !!(isSuperuser || user?.is_rev_tecnica);

  return (
    <div>
      <div className="card app-header" style={{ borderRadius: 0 }}>
        <div
          className="container"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 0 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img className="brand-logo" src="/brands/dflex.png" alt="Dflex" />
            <div>

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

          {showMediciones && (
            <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/mediciones">
              Mediciones
            </NavLink>
          )}

          {showCommercial && (
            <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/aprobacion/comercial">
              Aprobación Comercial
            </NavLink>
          )}

          {showDashboard && (
            <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/dashboard">
              Dashboard
            </NavLink>
          )}

          {showUsers && (
            <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/usuarios">
              Gestor de usuarios
            </NavLink>
          )}

          {showTechnical && (
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
