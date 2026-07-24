import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useNavigate, NavLink } from "react-router-dom";
import Button from "../ui/Button.jsx";
import { useAuthStore } from "../domain/auth/store.js";
import { getTechnicalConsultUnreadSummary } from "../api/technicalConsults.js";
import { getCommercialConsultUnreadSummary } from "../api/commercialConsults.js";
import AptoKgProductSectionFilterPatch from "../components/AptoKgProductSectionFilterPatch.jsx";
import PendingClientAcceptanceModal from "../components/PendingClientAcceptanceModal.jsx";

const DROPDOWN_ITEM_STYLE = {
  display: "block",
  padding: "8px 16px",
  color: "#333",
  textDecoration: "none",
  fontSize: 14,
  whiteSpace: "nowrap",
  borderBottom: "1px solid #f0f0f0",
};

function SuperusuarioDropdown({ show }) {
  const [open, setOpen] = useState(false);
  if (!show) return null;
  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="navlink" style={{ cursor: "pointer", userSelect: "none" }}>
        Superusuario ▾
      </span>
      {open && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          background: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          minWidth: 260,
          zIndex: 200,
          padding: "4px 0",
        }}>
          <NavLink style={({ isActive }) => ({ ...DROPDOWN_ITEM_STYLE, background: isActive ? "#f0fffe" : undefined, fontWeight: isActive ? 700 : undefined })} to="/dashboard/catalogo-puertas">Catalogo Puertas</NavLink>
          <NavLink style={({ isActive }) => ({ ...DROPDOWN_ITEM_STYLE, background: isActive ? "#f0fffe" : undefined, fontWeight: isActive ? 700 : undefined })} to="/dashboard/reglas-tecnicas">Reglas Tecnicas</NavLink>
          <NavLink style={({ isActive }) => ({ ...DROPDOWN_ITEM_STYLE, background: isActive ? "#f0fffe" : undefined, fontWeight: isActive ? 700 : undefined })} to="/superuser/nombres-pdf">Nombres PDF productos</NavLink>
          <NavLink style={({ isActive }) => ({ ...DROPDOWN_ITEM_STYLE, background: isActive ? "#f0fffe" : undefined, fontWeight: isActive ? 700 : undefined })} to="/superuser/asignacion-produccion">Asignacion Produccion</NavLink>
          <NavLink style={({ isActive }) => ({ ...DROPDOWN_ITEM_STYLE, background: isActive ? "#f0fffe" : undefined, fontWeight: isActive ? 700 : undefined })} to="/superuser/presupuestos-admin">Admin presupuestos y Odoo</NavLink>
          <NavLink style={({ isActive }) => ({ ...DROPDOWN_ITEM_STYLE, background: isActive ? "#f0fffe" : undefined, fontWeight: isActive ? 700 : undefined })} to="/superuser/visualizador-porton">Visualizador portones</NavLink>
          <NavLink style={({ isActive }) => ({ ...DROPDOWN_ITEM_STYLE, borderBottom: "none", background: isActive ? "#f0fffe" : undefined, fontWeight: isActive ? 700 : undefined })} to="/superuser/actividad-vendedores">Actividad vendedores</NavLink>
        </div>
      )}
    </div>
  );
}

function AprobacionesDropdown({ show, showCommercial, showTechnical, showPortonesEstado }) {
  const [open, setOpen] = useState(false);
  if (!show) return null;
  const items = [
    showCommercial && { to: "/aprobacion/comercial/menu", label: "Aprobacion Comercial" },
    showTechnical && { to: "/aprobacion/tecnica/menu", label: "Revision Tecnica" },
    showPortonesEstado && { to: "/aprobacion/tecnica/portones-estado", label: "Estado Portones" },
  ].filter(Boolean);
  const lastIdx = items.length - 1;
  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="navlink" style={{ cursor: "pointer", userSelect: "none" }}>
        Aprobaciones ▾
      </span>
      {open && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          background: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          minWidth: 220,
          zIndex: 200,
          padding: "4px 0",
        }}>
          {items.map((item, idx) => (
            <NavLink
              key={item.to}
              style={({ isActive }) => ({
                ...DROPDOWN_ITEM_STYLE,
                ...(idx === lastIdx ? { borderBottom: "none" } : {}),
                background: isActive ? "#f0fffe" : undefined,
                fontWeight: isActive ? 700 : undefined,
              })}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function PresupuestarDropdown({ show }) {
  const [open, setOpen] = useState(false);
  if (!show) return null;
  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="navlink" style={{ cursor: "pointer", userSelect: "none" }}>
        Presupuestar ▾
      </span>
      {open && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          background: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          minWidth: 230,
          zIndex: 200,
          padding: "4px 0",
        }}>
          <NavLink style={({ isActive }) => ({ ...DROPDOWN_ITEM_STYLE, background: isActive ? "#f0fffe" : undefined, fontWeight: isActive ? 700 : undefined })} to="/cotizador" end>De Grandis Portones</NavLink>
          <NavLink style={({ isActive }) => ({ ...DROPDOWN_ITEM_STYLE, background: isActive ? "#f0fffe" : undefined, fontWeight: isActive ? 700 : undefined })} to="/cotizador/ipanel">Ipanel</NavLink>
          <NavLink style={({ isActive }) => ({ ...DROPDOWN_ITEM_STYLE, background: isActive ? "#f0fffe" : undefined, fontWeight: isActive ? 700 : undefined })} to="/cotizador/plegados">Plegados</NavLink>
          <NavLink style={({ isActive }) => ({ ...DROPDOWN_ITEM_STYLE, background: isActive ? "#f0fffe" : undefined, fontWeight: isActive ? 700 : undefined })} to="/cotizador/puerta">Puertas</NavLink>
          <NavLink style={({ isActive }) => ({ ...DROPDOWN_ITEM_STYLE, background: isActive ? "#f0fffe" : undefined, fontWeight: isActive ? 700 : undefined })} to="/cotizador/otros">Otros</NavLink>
          <NavLink style={({ isActive }) => ({ ...DROPDOWN_ITEM_STYLE, borderBottom: "none", background: isActive ? "#f0fffe" : undefined, fontWeight: isActive ? 700 : undefined })} to="/presupuestos">Mis presupuestos</NavLink>
        </div>
      )}
    </div>
  );
}

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

function CommercialConsultHeaderButton() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const canAccessConsults = !!(user?.is_superuser || user?.is_vendedor || user?.is_distribuidor || user?.is_enc_comercial);
  const isCommercial = !!(user?.is_superuser || user?.is_enc_comercial);
  const isRequester = !!(!isCommercial && (user?.is_vendedor || user?.is_distribuidor));

  const summaryQ = useQuery({
    queryKey: ["commercialConsultUnreadSummary"],
    queryFn: getCommercialConsultUnreadSummary,
    enabled: canAccessConsults,
    staleTime: 10000,
    refetchInterval: 15000,
  });

  if (!canAccessConsults) return null;

  const summary = summaryQ.data || {};
  const unreadCount = isRequester
    ? Number(summary.mine_unread_count || 0)
    : Math.max(Number(summary.commercial_unread_count || 0), Number(summary.commercial_pending_count || 0));

  const highlight = unreadCount > 0;

  return (
    <div style={{ position: "relative" }}>
      <Button
        variant={highlight ? "primary" : "ghost"}
        onClick={() => navigate("/consultas-comerciales")}
        title={highlight ? `${unreadCount} consulta(s) pendiente(s)` : "Abrir consultas comerciales"}
        style={{ position: "relative", paddingRight: highlight ? 38 : undefined }}
      >
        Consulta comercial
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
  if (user?.is_administracion) roles.push("Administración");

  const roleText = roles.length ? roles.join(" / ") : "Cargando sesion...";

  const showDashboard = !!(isSuperuser || user?.is_enc_comercial || user?.see_all_distributors);
  const showUsers = !!(isSuperuser || user?.is_enc_comercial);
  const showPresupuestar = !!(isSuperuser || user?.is_vendedor || user?.is_distribuidor || user?.is_enc_comercial);
  const showMyDistributors = !!(isSuperuser || user?.is_enc_comercial || (user?.is_vendedor && !user?.is_distribuidor));
  const showMediciones = !!(isSuperuser || user?.is_medidor) && !user?.is_rev_tecnica;
  const showCommercial = !!(isSuperuser || user?.is_enc_comercial);
  const showTechnical = !!(isSuperuser || user?.is_rev_tecnica);
  const showPortonesEstado = !!(isSuperuser || user?.is_rev_tecnica || user?.is_enc_comercial || user?.is_logistica);
  const showAdministracion = !!(isSuperuser || user?.is_administracion);
  const showPlanning = !!(isSuperuser || user?.is_enc_comercial);
  const showFinancing = !!(isSuperuser || user?.is_enc_comercial);

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
      <div
        className={`card app-header${user?.is_vendedor && !isDevEnv ? " app-header--vendedor" : ""}`}
        style={{ borderRadius: 0, ...(isDevEnv && { background: "#7a1a1a" }) }}
      >
        <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 0, gap: 16, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img className="brand-logo" src="/brands/dflex.png" alt="Dflex" />
          </div>

          {user ? (
            <div style={{
              position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
              background: "#fff", color: "#111", borderRadius: 999,
              padding: "10px 24px", fontSize: 17, fontWeight: 800,
              boxShadow: "0 2px 10px rgba(0,0,0,0.18)", whiteSpace: "nowrap",
            }}>
              {user.username} - {roleText}
            </div>
          ) : null}

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <TechnicalConsultHeaderButton />
            <CommercialConsultHeaderButton />
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

          <PresupuestarDropdown show={showPresupuestar} />

          {showMyDistributors && <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/mis-distribuidores">Mis distribuidores</NavLink>}
          {showMediciones && <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/mediciones">Mediciones</NavLink>}
          {showDashboard && <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/dashboard">Dashboard</NavLink>}
          {showPlanning && <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/planificacion">Planificacion</NavLink>}
          {showFinancing && <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/financiamiento">Financiamiento</NavLink>}
          {showUsers && <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/usuarios">Gestor de usuarios</NavLink>}
          <AprobacionesDropdown
            show={!!(showCommercial || showTechnical || showPortonesEstado)}
            showCommercial={showCommercial}
            showTechnical={showTechnical}
            showPortonesEstado={showPortonesEstado}
          />
          {showAdministracion && <NavLink className={({ isActive }) => (isActive ? "navlink active" : "navlink")} to="/administracion">Administración</NavLink>}
          <SuperusuarioDropdown show={isSuperuser} />
        </div>
      </div>

      <AptoKgProductSectionFilterPatch />
      <PendingClientAcceptanceModal />
      <Outlet />
      </div>
    </div>
  );
}
