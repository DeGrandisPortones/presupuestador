import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../ui/Button.jsx";
import { useAuthStore } from "../../domain/auth/store.js";

const SECTION_CARDS = [
  { key: "porton", title: "Aprobación de Portones", description: "Aprobaciones, circuito técnico, mediciones, acopio y producción de portones.", iconSrc: "/menu-icons/aprobacion-portones.png" },
  { key: "ipanel", title: "Aprobación de Ipanels", description: "Aprobaciones, acopio y producción de Ipanels. Sin circuito de mediciones.", iconSrc: "/brands/ipanel.png" },
  { key: "puerta", title: "Aprobación de Puertas", description: "Gestión del flujo de aprobación de puertas.", iconSrc: "/menu-icons/aprobacion-puertas.png" },
  { key: "plegados", title: "Aprobación de Plegados", description: "Aprobaciones de plegados con plano adjunto y descripción visible.", iconSrc: "/menu-icons/otros-presupuestos.png" },
  { key: "otros", title: "Aprobación de Otros", description: "Aprobaciones de presupuestos Otros.", iconSrc: "/menu-icons/otros-presupuestos.png" },
  { key: "all", title: "Todos", description: "Listado general con todos los tipos juntos.", iconSrc: "/menu-icons/mis-presupuestos.png" },
];

function firstTabForSection(section, mode) {
  if (section === "ipanel") return "aprobaciones_ipanels";
  if (section === "puerta") return mode === "tecnica" ? "aprobaciones_puertas" : "puertas";
  if (section === "plegados") return "aprobaciones_plegados";
  if (section === "otros") return "aprobaciones_otros";
  if (section === "all") return "aprobaciones_todos";
  return "aprobaciones_portones";
}

function ApprovalMenuCard({ card, onOpen }) {
  return (
    <div className="card menu-card">
      <div className="menu-card-media">
        {card.iconSrc ? <img src={card.iconSrc} alt={card.title} style={{ width: 76, height: 76, objectFit: "contain", display: "block" }} /> : null}
      </div>
      <div className="menu-title">{card.title}</div>
      <div className="muted" style={{ lineHeight: 1.4 }}>{card.description}</div>
      <div className="spacer" />
      <Button variant="secondary" onClick={onOpen}>Abrir</Button>
    </div>
  );
}

export default function ApprovalSectionMenuPage({ mode = "comercial" }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isTechnical = mode === "tecnica";
  const allowed = isTechnical ? !!(user?.is_rev_tecnica || user?.is_superuser) : !!(user?.is_enc_comercial || user?.is_superuser);
  const title = isTechnical ? "Aprobaciones Técnicas" : "Aprobaciones Comerciales";
  const targetBase = isTechnical ? "/aprobacion/tecnica" : "/aprobacion/comercial";
  const cards = useMemo(() => SECTION_CARDS, []);

  if (!allowed) {
    return <div className="container"><div className="card">No autorizado.</div></div>;
  }

  return (
    <div className="container">
      <div className="spacer" />
      <div className="card">
        <h2 style={{ margin: 0, textAlign: "center" }}>{title}</h2>
        <div className="muted" style={{ textAlign: "center", marginTop: 6 }}>Elegí el circuito que necesitás revisar.</div>
      </div>
      <div className="spacer" />
      <div className="menu-grid">
        {cards.map((card) => (
          <ApprovalMenuCard
            key={card.key}
            card={card}
            onOpen={() => navigate(`${targetBase}?section=${encodeURIComponent(card.key)}&tab=${encodeURIComponent(firstTabForSection(card.key, mode))}`)}
          />
        ))}
      </div>
    </div>
  );
}
