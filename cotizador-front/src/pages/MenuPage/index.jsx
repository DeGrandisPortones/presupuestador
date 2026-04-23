import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../domain/auth/store.js";
import Button from "../../ui/Button.jsx";

function MenuIcon({ children }) {
  return <div className="menu-card-icon">{children}</div>;
}

function MenuTile({ title, description, buttonText, onClick, logoSrc, logoAlt, iconSrc, icon }) {
  return (
    <div className="card menu-card">
      <div className="menu-card-media">
        {logoSrc ? (
          <img className="product-logo menu-card-logo" src={logoSrc} alt={logoAlt || title} />
        ) : iconSrc ? (
          <img src={iconSrc} alt={logoAlt || title} style={{ width: 76, height: 76, objectFit: "contain", display: "block" }} />
        ) : (
          <MenuIcon>{icon}</MenuIcon>
        )}
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
  const showPlanning = !!(isSuperuser || user?.is_enc_comercial);
  const showCommercialInbox = !!(isSuperuser || user?.is_enc_comercial);
  const showUsers = !!(isSuperuser || user?.is_enc_comercial);
  const showTechInbox = !!(isSuperuser || user?.is_rev_tecnica);
  const showDoors = !!(isSuperuser || user?.is_vendedor);
  const showMediciones = !!(isSuperuser || user?.is_medidor);
  const showTechnicalRules = !!isSuperuser;
  const showQuoteViewer = !!isSuperuser;
  const showSellerActivity = !!isSuperuser;
  const showPdfNamesAdmin = !!isSuperuser;
  const showProductionAssignments = !!isSuperuser;

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
            iconSrc="/menu-icons/otros-presupuestos.png"
          />
        )}

        {showDoors && (
          <MenuTile
            title="Puertas"
            description="Puertas aisladas o vinculadas a portón."
            buttonText="Abrir puertas"
            onClick={() => navigate("/puertas")}
            iconSrc="/menu-icons/puertas.png"
          />
        )}

        {canQuote && (
          <MenuTile
            title="Mis presupuestos"
            buttonText="Ver mis presupuestos"
            onClick={() => navigate("/presupuestos")}
            iconSrc="/menu-icons/mis-presupuestos.png"
          />
        )}

        {showMediciones && (
          <MenuTile
            title="Mediciones"
            buttonText="Abrir mediciones"
            onClick={() => navigate("/mediciones")}
            iconSrc="/menu-icons/mediciones.png"
          />
        )}

        {showDashboard && (
          <MenuTile
            title="Dashboard"
            buttonText="Abrir dashboard"
            onClick={() => navigate("/dashboard")}
            iconSrc="/menu-icons/dashboard.png"
          />
        )}

        {showPlanning && (
          <MenuTile
            title="Planificación"
            description="Capacidad de producción por semana."
            buttonText="Abrir planificación"
            onClick={() => navigate("/planificacion")}
            iconSrc="/menu-icons/planificacion.png"
          />
        )}

        {showTechnicalRules && (
          <MenuTile
            title="Reglas Técnicas"
            description="Dashboard exclusivo de superusuario para definir reglas sobre la planilla técnica y el pegado a Odoo."
            buttonText="Abrir reglas"
            onClick={() => navigate("/dashboard/reglas-tecnicas")}
            iconSrc="/menu-icons/reglas-tecnicas.png"
          />
        )}

        {showPdfNamesAdmin && (
          <MenuTile
            title="Nombres PDF productos"
            description="Definí el nombre exacto que querés que salga en los PDF por producto."
            buttonText="Abrir nombres PDF"
            onClick={() => navigate("/superuser/nombres-pdf")}
            icon="📝"
          />
        )}

        {showProductionAssignments && (
          <MenuTile
            title="Asignación de propiedades a producción"
            description="Elegí a qué propiedad del integrador debe ir cada dato del portón."
            buttonText="Abrir asignación"
            onClick={() => navigate("/superuser/asignacion-produccion")}
            icon="🧩"
          />
        )}

        {showQuoteViewer && (
          <MenuTile
            title="Visualizador de portones"
            description="Buscá por NP o NV y mirá el historial completo del portón."
            buttonText="Abrir visualizador"
            onClick={() => navigate("/superuser/visualizador-porton")}
            icon="🔎"
          />
        )}

        {showSellerActivity && (
          <MenuTile
            title="Actividad vendedores / distribuidores"
            description="Elegí un usuario y mirá las acciones realizadas con sus portones."
            buttonText="Abrir actividad"
            onClick={() => navigate("/superuser/actividad-vendedores")}
            icon="📊"
          />
        )}

        {showUsers && (
          <MenuTile
            title="Gestor de usuarios"
            buttonText="Abrir gestor"
            onClick={() => navigate("/usuarios")}
            iconSrc="/menu-icons/gestor-usuarios.png"
          />
        )}

        {showCommercialInbox && (
          <MenuTile
            title="Aprobación Comercial"
            buttonText="Ir a aprobación"
            onClick={() => navigate("/aprobacion/comercial")}
            iconSrc="/menu-icons/aprobacion-comercial.png"
          />
        )}

        {showTechInbox && (
          <>
            <MenuTile
              title="Aprobaciones Portones"
              description="Revisión técnica de presupuestos de portones."
              buttonText="Abrir portones"
              onClick={() => navigate("/aprobacion/tecnica?tab=aprobaciones_portones")}
              iconSrc="/menu-icons/aprobacion-portones.png"
            />

            <MenuTile
              title="Aprobaciones Puertas"
              description="Revisión técnica de puertas."
              buttonText="Abrir puertas"
              onClick={() => navigate("/aprobacion/tecnica?tab=aprobaciones_puertas")}
              iconSrc="/menu-icons/aprobacion-puertas.png"
            />

            <MenuTile
              title="Aprobaciones Mediciones"
              description="Revisión técnica de mediciones terminadas."
              buttonText="Abrir aprobaciones"
              onClick={() => navigate("/aprobacion/tecnica?tab=aprobaciones_mediciones")}
              iconSrc="/menu-icons/aprobacion-mediciones.png"
            />
          </>
        )}
      </div>
    </div>
  );
}
