import { useQuery } from "@tanstack/react-query";
import { Outlet, useNavigate, NavLink } from "react-router-dom";
import Button from "../ui/Button.jsx";
import { useAuthStore } from "../domain/auth/store.js";
import { getTechnicalConsultUnreadSummary } from "../api/technicalConsults.js";
import AptoKgProductSectionFilterPatch from "../components/AptoKgProductSectionFilterPatch.jsx";

function OdooStatusBadge() {
  const odooStatus = useAuthStore((s) => s.odooStatus);
  const isOnline = odooStatus === "online";
  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: 999,
        border: `1px solid ${isOnline ? "#1f7a45" : "#a12626"}`,
        background: isOnline ? "#eaf8ef" : "#fdecec",
        color: isOnline ? "#1f7a45" : "#a12626",
        fontWeight: 800,
        fontSize: 13,
        lineHeight: 1,
        minWidth: 82,
        textAlign: "center",
      }}
      title={isOnline ? "Conexion con Odoo disponible" : "Sin respuesta valida desde Odoo"}
    >
      {isOnline ? "Online" : "Offline"}
    </div>
  );
}

function TechnicalConsultHeaderButton() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const canAccessConsults = !!(user?.is_superuser || user?.is_vendedor || user?.is_distribuidor || user?.is_rev_tecnica);
  const isTechnical = !!(user?.is_superuser || user?.is_rev_tecnica);
  const isRequester = !!(!isTechnical && (user?.is_vendedor || user?.is_distribuidor));

  const summaryQ = useQuery({
    queryKey: ["technicalConsultUnreadSummary"],
    queryFn: getTechnicalConsultUnreadSummary,
    enabled: canAccessConsults,
    staleTime: 10000,
    refetchInterval: 15000,
  });

  if (!canAccessConsults) return null;

  const summary = summaryQ.data || {};
  const unreadCount = isRequester
    ? Number(summary.mine_unread_count || 0)
    : Math.max(Number(summary.technical_unread_count || 0), Number(summary.technical_pending_count || 0));

  const highlight = unreadCount > 0;

  return (
    <div style={{ position: "relative" }}>
      <Button
        variant={highlight ? "primary" : "ghost"}
        onClick={() => navigate("/consultas-tecnicas")}
        title={highlight ? `${unreadCount} consulta(s) pendiente(s)` : "Abrir consultas tecnicas"}
        style={{ position: "relative", paddingRight: highlight ? 38 : undefined }}
      >
        Consulta tecnica
      </Button>
      {highlight ? (
        <span
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            minWidth: 22,
            height: 22,
            borderRadius: 999,
            background: "#d93025",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 800,
            padding: "0 6px",
            boxShadow: "0 0 0 3px #fff",
          }}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </div>
  );
}

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
  if (user?.is_rev_tecnica) roles.push("Rev. Tecnica");
  if (user?.is_medidor) roles.push("Medidor");
  if (user?.is_logistica) roles.push("Logistica");

  const roleText = roles.length ? roles.join(" / ") : "Cargando sesion...";

  const showDashboard = !!(isSuperuser || user?.is_enc_comercial);
  const showUsers = !!(isSuperuser || user?.is_enc_comercial);
  const canQuote = !!(isSuperuser || user?.is_vendedor || user?.is_distribuidor);
  const showMyDistributors = !!(isSuperuser || user?.is_enc_comercial || (user?.is_vendedor && !user?.is_distribuidor));
  const showMediciones = !!(isSuperuser || user?.is_medidor) && !user?.is_rev_tecnica;
  const showCommercial = !!(isSuperuser || user?.is_enc_comercial);
  const showTechnical = !!(isSuperuser || user?.is_rev_tecnica);

  const isDevEnv = import.meta.env.VITE_API_URL?.includes("dev");

  return (
    <div style={{ position: "relative" }}>
      {isDevEnv && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 0,
          pointerEvents: "none", overflow: "hidden",
        }}>
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute",
              left: `${(i % 4) * 28 - 10}%`,
              top: `${Math.floor(i / 4) * 22 - 5}%`,
              transform: "rotate(-35deg)",
              fontSize: 28,
              fontWeight: 900,
              color: "rgba(200,40,40,0.18)",
              whiteSpace: "nowrap",
              userSelect: "none",
              letterSpacing: 4,
            }}>
              DEV ENVIRONMENT
            </div>
          ))}
        </div>
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
      <div className="card app-header" style={{ borderRadius: 0, ...(isDevEnv && { background: "#7a1a1a" }) }}>
        <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 0, gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img className="brand-logo" src="/brands/dflex.png" alt="Dflex" />
            <div>
              <div className="muted">{user ? `${user.username} - ${roleText}` : roleText}</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <TechnicalConsultHeaderButton />
            <OdooStatusBadge />
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
        </div>

        <div className="container" style={{ padding: 0, marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/menu">Menu</NavLink>

          {canQuote && (
            <>
              <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/cotizador" end>
                Presupuesto Portones
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/cotizador/ipanel">
                Presupuesto Ipanel
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/cotizador/plegados">
                Presupuesto Plegados
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/cotizador/puerta">
                Presupuesto Puertas
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/cotizador/otros">
                Presupuesto Otros
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/presupuestos">
                Mis presupuestos
              </NavLink>
            </>
          )}

          {showMyDistributors && <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/mis-distribuidores">Mis distribuidores</NavLink>}
          {showMediciones && <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/mediciones">Mediciones</NavLink>}
          {showCommercial && <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/aprobacion/comercial/menu">Aprobacion Comercial</NavLink>}
          {showDashboard && <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/dashboard">Dashboard</NavLink>}
          {showUsers && <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/usuarios">Gestor de usuarios</NavLink>}
          {showTechnical && <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/aprobacion/tecnica/menu">Revision Tecnica</NavLink>}
        </div>
      </div>

      <AptoKgProductSectionFilterPatch />
      <Outlet />
      </div>
    </div>
  );
}
