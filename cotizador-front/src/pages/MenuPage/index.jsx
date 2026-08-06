import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../domain/auth/store.js";
import Button from "../../ui/Button.jsx";

function MenuIcon({ children }) {
  return <div className="menu-card-icon">{children}</div>;
}

function MenuTile({ title, buttonText, onClick, logoSrc, logoAlt, iconSrc, icon }) {
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
  const showDashboard = !!(isSuperuser || user?.is_enc_comercial || user?.see_all_distributors);
  const showPlanning = !!(isSuperuser || user?.is_enc_comercial);
  const showFinancing = !!(isSuperuser || user?.is_enc_comercial);
  const showCommercialInbox = !!(isSuperuser || user?.is_enc_comercial);
  const showUsers = !!(isSuperuser || user?.is_enc_comercial);
  const showTechInbox = !!(isSuperuser || user?.is_rev_tecnica);
  const showDoors = !!(isSuperuser || user?.is_vendedor || user?.is_distribuidor);
  const showMyDistributors = !!(isSuperuser || user?.is_enc_comercial || (user?.is_vendedor && !user?.is_distribuidor));
  const showMyCommissions = !!(user?.is_vendedor && !user?.is_distribuidor);
  const showMediciones = !!(isSuperuser || user?.is_medidor);
  const showTechnicalRules = !!isSuperuser;
  const showQuoteViewer = !!isSuperuser;
  const showSellerActivity = !!isSuperuser;
  const showPdfNamesAdmin = !!isSuperuser;
  const showProductionAssignments = !!isSuperuser;
  const showQuotesAdmin = !!isSuperuser;
  const showAdministracion = !!(isSuperuser || user?.is_administracion);
  const showPortonesEstado = !!(isSuperuser || user?.is_rev_tecnica || user?.is_enc_comercial || user?.is_logistica || user?.is_administracion);
  const showPortonesEstadoStandalone = showPortonesEstado && !showTechInbox;

  return (
    <div className="container">
      <div className="spacer" />
      <div className="card">
        <h2 style={{ margin: 0, textAlign: "center" }}>Menu</h2>
      </div>
      <div className="spacer" />
      <div className="menu-grid">
        {canQuote && (
          <MenuTile
            title="Presupuesto De Grandis Portones"
            buttonText="Ir al presupuesto"
            onClick={() => navigate("/cotizador")}
            logoSrc="/brands/degrandis.png"
            logoAlt="De Grandis Portones"
          />
        )}

        {canQuote && (
          <MenuTile
            title="Presupuesto Ipanel"
            buttonText="Ir al presupuesto"
            onClick={() => navigate("/cotizador/ipanel")}
            logoSrc="/brands/ipanel.png"
            logoAlt="Ipanel"
          />
        )}

        {canQuote && (
          <MenuTile
            title="Presupuestar Plegados"
            buttonText="Ir al presupuesto"
            onClick={() => navigate("/cotizador/plegados")}
            iconSrc="/menu-icons/otros-presupuestos.png"
          />
        )}

        {showDoors && (
          <MenuTile
            title="Presupuesto Puertas"
            buttonText="Ir al presupuesto"
            onClick={() => navigate("/cotizador/puerta")}
            iconSrc="/menu-icons/puertas.png"
          />
        )}

        {canQuote && (
          <MenuTile
            title="Presupuesto Otros"
            buttonText="Ir al presupuesto"
            onClick={() => navigate("/cotizador/otros")}
            iconSrc="/menu-icons/otros-presupuestos.png"
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

        {showMyDistributors && (
          <MenuTile
            title="Mis distribuidores"
            buttonText="Ver distribuidores"
            onClick={() => navigate("/mis-distribuidores")}
            icon=""
          />
        )}

        {showMyCommissions && (
          <MenuTile
            title="Mis comisiones"
            buttonText="Ver comisiones"
            onClick={() => navigate("/mis-comisiones")}
            icon=""
          />
        )}

        {showMediciones && (
          <MenuTile title="Mediciones" buttonText="Abrir mediciones" onClick={() => navigate("/mediciones")} iconSrc="/menu-icons/mediciones.png" />
        )}

        {showDashboard && <MenuTile title="Dashboard" buttonText="Abrir dashboard" onClick={() => navigate("/dashboard")} iconSrc="/menu-icons/dashboard.png" />}
        {isSuperuser && <MenuTile title="Catalogo Puertas" buttonText="Configurar puertas" onClick={() => navigate("/dashboard/catalogo-puertas")} iconSrc="/menu-icons/puertas.png" />}
        {showPlanning && <MenuTile title="Planificacion" buttonText="Abrir planificacion" onClick={() => navigate("/planificacion")} iconSrc="/menu-icons/planificacion.png" />}
        {showFinancing && <MenuTile title="Financiamiento" buttonText="Abrir financiamiento" onClick={() => navigate("/financiamiento")} icon="" />}
        {showTechnicalRules && <MenuTile title="Reglas Tecnicas" buttonText="Abrir reglas" onClick={() => navigate("/dashboard/reglas-tecnicas")} iconSrc="/menu-icons/reglas-tecnicas.png" />}
        {showPdfNamesAdmin && <MenuTile title="Nombres PDF productos" buttonText="Abrir nombres PDF" onClick={() => navigate("/superuser/nombres-pdf")} icon="" />}
        {showProductionAssignments && <MenuTile title="Asignacion de propiedades a produccion" buttonText="Abrir asignacion" onClick={() => navigate("/superuser/asignacion-produccion")} icon="" />}
        {showQuotesAdmin && <MenuTile title="Admin presupuestos y Odoo" buttonText="Abrir listado" onClick={() => navigate("/superuser/presupuestos-admin")} icon="" />}
        {showQuoteViewer && <MenuTile title="Visualizador de portones" buttonText="Abrir visualizador" onClick={() => navigate("/superuser/visualizador-porton")} icon="" />}
        {showSellerActivity && <MenuTile title="Actividad vendedores / distribuidores" buttonText="Abrir actividad" onClick={() => navigate("/superuser/actividad-vendedores")} icon="" />}
        {showUsers && <MenuTile title="Gestor de usuarios" buttonText="Abrir gestor" onClick={() => navigate("/usuarios")} iconSrc="/menu-icons/gestor-usuarios.png" />}
        {showCommercialInbox && <MenuTile title="Aprobacion Comercial" buttonText="Ir a aprobacion" onClick={() => navigate("/aprobacion/comercial/menu")} iconSrc="/menu-icons/aprobacion-comercial.png" />}

        {showTechInbox && (
          <>
            <MenuTile title="Aprobaciones Técnicas" buttonText="Abrir menú" onClick={() => navigate("/aprobacion/tecnica/menu")} iconSrc="/menu-icons/aprobacion-portones.png" />
          </>
        )}
        {showPortonesEstadoStandalone && (
          <MenuTile title="Estado Productos" buttonText="Ver estado" onClick={() => navigate("/aprobacion/tecnica/portones-estado")} iconSrc="/menu-icons/aprobacion-portones.png" />
        )}
        {showAdministracion && (
          <MenuTile title="Administración" buttonText="Abrir administración" onClick={() => navigate("/administracion")} icon="" />
        )}
      </div>
    </div>
  );
}
