import { useState } from "react";

import Button from "../../ui/Button.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import SuperuserProductPdfNamesPage from "../SuperuserProductPdfNamesPage/index.jsx";
import DuretContentTab from "./DuretContentTab.jsx";
import DuretTemplateTab from "./DuretTemplateTab.jsx";

const TABS = [
  { key: "nombres", label: "Nombres PDF" },
  { key: "contenido", label: "Contenido" },
  { key: "plantilla", label: "Plantilla" },
];

// Seccion "Duret" del dashboard: un vendedor con users.pdf_brand='duret'
// recibe, al descargar el "presupuesto", una propuesta comercial de 2
// paginas con formato/logo propio (ver renderDuretPresupuestoPdf en
// routes/pdf.routes.js) en vez del PDF estandar De Grandis. Casi todo su
// contenido es configurable acá, en 3 pestañas:
//  - Nombres PDF: nombre plano por producto para la tabla de detalle
//    (reusa la misma pantalla que usa el PDF estandar, con brand="duret").
//  - Contenido: por producto, en qué sección de "La solución propuesta"
//    aparece, a qué grupo del desglose económico suma su importe, y qué
//    chip/bullet aporta (presupuestador_product_pdf_content).
//  - Plantilla: los textos fijos que no dependen de qué se vendió puntualmente
//    (duret_pdf_template).
export default function DuretPdfNamesPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState("nombres");

  if (!user?.is_superuser) {
    return (
      <div className="container">
        <div className="spacer" />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Duret</h2>
          <div className="muted">No tenés permisos (solo superusuario).</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="spacer" />

      <div className="card">
        <h2 style={{ margin: 0 }}>Duret — Propuesta comercial</h2>
        <div className="muted" style={{ marginTop: 6 }}>
          Configuración del PDF con marca y formato propios que reciben los vendedores de Duret.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {TABS.map((t) => (
            <Button key={t.key} variant={tab === t.key ? "primary" : "ghost"} onClick={() => setTab(t.key)}>
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="spacer" />

      {tab === "nombres" && (
        <SuperuserProductPdfNamesPage
          brand="duret"
          title="Duret — Nombres PDF productos"
          subtitle="Nombres de producto que van a aparecer en la tabla de detalle del PDF Duret. No afecta el PDF estándar De Grandis. Si queda vacío, usa el nombre que devuelve Odoo."
        />
      )}
      {tab === "contenido" && <DuretContentTab />}
      {tab === "plantilla" && <DuretTemplateTab />}
    </div>
  );
}
