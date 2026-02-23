import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../domain/auth/store.js";
import Button from "../../ui/Button.jsx";

export default function MenuPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const canQuote = !!(user?.is_vendedor || user?.is_distribuidor);

  const showDashboard = !!(user?.is_distribuidor || user?.is_enc_comercial);
  const showCommercialInbox = !!user?.is_enc_comercial;
  const showUsers = !!user?.is_enc_comercial;
  const showTechInbox = !!user?.is_rev_tecnica;

  return (
    <div className="container">
      <div className="spacer" />

      <div className="card">
        <h2 style={{ margin: 0 }}>Menú</h2>
      </div>

      <div className="spacer" />

      <div className="menu-grid">
        {canQuote && (
        <div className="card menu-card">
          <img className="product-logo" src="/brands/degrandis.png" alt="De Grandis Portones" />
          <div className="menu-title">Cotizador De Grandis Portones</div>
          <div className="spacer" />
          <Button variant="primary" onClick={() => navigate("/cotizador")}>Ir al cotizador</Button>
        </div>
        )}


        {canQuote && (
        <div className="card menu-card">
          <img className="product-logo" src="/brands/ipanel.png" alt="Ipanel" />
          <div className="menu-title">Cotizador Ipanel</div>
          <div className="spacer" />
          <Button variant="primary" onClick={() => navigate("/cotizador/ipanel")}>Ir al cotizador</Button>
        </div>
        )}


        {canQuote && (
        <div className="card menu-card">
          <div className="menu-title">Mis presupuestos</div>
          <div className="spacer" />
          <Button variant="secondary" onClick={() => navigate("/presupuestos")}>Ver mis presupuestos</Button>
        </div>
        )}


        {showDashboard && (
          <div className="card menu-card">
            <div className="menu-title">Dashboard</div>
            <div className="spacer" />
            <Button variant="secondary" onClick={() => navigate("/dashboard")}>Abrir dashboard</Button>
          </div>
        )}

        {showUsers && (
          <div className="card menu-card">
            <div className="menu-title">Gestor de usuarios</div>
            <div className="spacer" />
            <Button variant="secondary" onClick={() => navigate("/usuarios")}>Abrir gestor</Button>
          </div>
        )}

        {showCommercialInbox && (
          <div className="card menu-card">
            <div className="menu-title">Aprobación Comercial</div>
            <div className="spacer" />
            <Button variant="secondary" onClick={() => navigate("/aprobacion/comercial")}>Ir a aprobación</Button>
          </div>
        )}

        {showTechInbox && (
          <div className="card menu-card">
            <div className="menu-title">Revisión Técnica</div>
            <div className="spacer" />
            <Button variant="secondary" onClick={() => navigate("/aprobacion/tecnica")}>Ir a revisión</Button>
          </div>
        )}
      </div>
    </div>
  );
}
