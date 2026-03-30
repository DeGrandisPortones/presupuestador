import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../domain/auth/store.js";
import Button from "../../ui/Button.jsx";

function MenuIcon({ children }) {
  return <div className="menu-card-icon">{children}</div>;
}

function SvgIcon({ children, viewBox = "0 0 24 24" }) {
  return (
    <svg className="menu-card-svg" viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function MenuTile({ title, description, buttonText, onClick, logoSrc, logoAlt, icon }) {
  return (
    <div className="card menu-card">
      <div className="menu-card-media">
        {logoSrc ? <img className="product-logo menu-card-logo" src={logoSrc} alt={logoAlt || title} /> : <MenuIcon>{icon}</MenuIcon>}
      </div>
      <div className="menu-title">{title}</div>
      {description ? <div className="muted menu-description">{description}</div> : null}
      <div className="spacer" />
      <Button variant="secondary" onClick={onClick}>{buttonText}</Button>
    </div>
  );
}

export default function MenuPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const isSuperuser = !!user?.is_superuser;
  const canQuote = !!(isSuperuser || user?.is_vendedor || user?.is_distribuidor);
  const showDashboard = !!(isSuperuser || user?.is_enc_comercial);
  const showCommercialInbox = !!(isSuperuser || user?.is_enc_comercial);
  const showUsers = !!(isSuperuser || user?.is_enc_comercial);
  const showTechInbox = !!(isSuperuser || user?.is_rev_tecnica);
  const showDoors = !!(isSuperuser || user?.is_vendedor);
  const showMediciones = !!(isSuperuser || user?.is_medidor);

  return (
    <div className="container">
      <div className="spacer" />
      <div className="card">
        <h2 style={{ margin: 0, textAlign: "center" }}>Menú</h2>
      </div>
      <div className="spacer" />
      <div className="menu-grid">
        {canQuote && (
          <MenuTile
            title="Cotizador De Grandis Portones"
            buttonText="Ir al cotizador"
            onClick={() => navigate("/cotizador")}
            logoSrc="/brands/degrandis.png"
            logoAlt="De Grandis Portones"
          />
        )}

        {canQuote && (
          <MenuTile
            title="Cotizador Ipanel"
            buttonText="Ir al cotizador"
            onClick={() => navigate("/cotizador/ipanel")}
            logoSrc="/brands/ipanel.png"
            logoAlt="Ipanel"
          />
        )}

        {canQuote && (
          <MenuTile
            title="Presupuesto Otros"
            description="Circuito de presupuestos para productos fuera de Portones e Ipanel."
            buttonText="Ir al cotizador"
            onClick={() => navigate("/cotizador/otros")}
            icon={
              <SvgIcon>
                <path d="M4 5h16v14H4z" />
                <path d="M8 9h8" />
                <path d="M8 13h8" />
              </SvgIcon>
            }
          />
        )}

        {showDoors && (
          <MenuTile
            title="Puertas"
            description="Puertas aisladas o vinculadas a portón."
            buttonText="Abrir puertas"
            onClick={() => navigate("/puertas")}
            icon={
              <SvgIcon>
                <path d="M7 3h8a2 2 0 0 1 2 2v14H7z" />
                <path d="M7 3H5a2 2 0 0 0-2 2v14h4" />
                <path d="M13 12h.01" />
              </SvgIcon>
            }
          />
        )}

        {canQuote && (
          <MenuTile
            title="Mis presupuestos"
            buttonText="Ver mis presupuestos"
            onClick={() => navigate("/presupuestos")}
            icon={
              <SvgIcon>
                <path d="M6 3h9l3 3v15H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
                <path d="M15 3v4h4" />
                <path d="M8 11h8" />
                <path d="M8 15h8" />
              </SvgIcon>
            }
          />
        )}

        {showMediciones && (
          <MenuTile
            title="Mediciones"
            buttonText="Abrir mediciones"
            onClick={() => navigate("/mediciones")}
            icon={
              <SvgIcon>
                <path d="M4 7l3-3 13 13-3 3z" />
                <path d="M12 5l7 7" />
                <path d="M2 22l5-1-4-4z" />
              </SvgIcon>
            }
          />
        )}

        {showDashboard && (
          <MenuTile
            title="Dashboard"
            buttonText="Abrir dashboard"
            onClick={() => navigate("/dashboard")}
            icon={
              <SvgIcon>
                <path d="M4 13h6v7H4z" />
                <path d="M14 4h6v16h-6z" />
                <path d="M4 4h6v5H4z" />
              </SvgIcon>
            }
          />
        )}

        {showUsers && (
          <MenuTile
            title="Gestor de usuarios"
            buttonText="Abrir gestor"
            onClick={() => navigate("/usuarios")}
            icon={
              <SvgIcon>
                <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                <circle cx="9.5" cy="7" r="3" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 4.13a4 4 0 0 1 0 7.75" />
              </SvgIcon>
            }
          />
        )}

        {showCommercialInbox && (
          <MenuTile
            title="Aprobación Comercial"
            buttonText="Ir a aprobación"
            onClick={() => navigate("/aprobacion/comercial")}
            icon={
              <SvgIcon>
                <circle cx="12" cy="12" r="9" />
                <path d="M8.5 12h7" />
                <path d="M12 8.5v7" />
              </SvgIcon>
            }
          />
        )}

        {showTechInbox && (
          <>
            <MenuTile
              title="Aprobaciones Portones"
              description="Revisión técnica de presupuestos de portones."
              buttonText="Abrir portones"
              onClick={() => navigate("/aprobacion/tecnica?tab=aprobaciones_portones")}
              icon={
                <SvgIcon>
                  <path d="M4 20V8a2 2 0 0 1 2-2h12v14H4z" />
                  <path d="M8 6V4h8v2" />
                  <path d="M9 12h6" />
                </SvgIcon>
              }
            />

            <MenuTile
              title="Aprobaciones Puertas"
              description="Revisión técnica de puertas."
              buttonText="Abrir puertas"
              onClick={() => navigate("/aprobacion/tecnica?tab=aprobaciones_puertas")}
              icon={
                <SvgIcon>
                  <path d="M7 3h10a2 2 0 0 1 2 2v16H7z" />
                  <path d="M11 12h.01" />
                </SvgIcon>
              }
            />

            <MenuTile
              title="Aprobaciones Mediciones"
              description="Revisión técnica de mediciones terminadas."
              buttonText="Abrir aprobaciones"
              onClick={() => navigate("/aprobacion/tecnica?tab=aprobaciones_mediciones")}
              icon={
                <SvgIcon>
                  <path d="M4 12l5 5L20 6" />
                  <path d="M4 6h8" />
                  <path d="M4 18h8" />
                </SvgIcon>
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
