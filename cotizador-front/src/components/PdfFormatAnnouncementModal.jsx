import { useEffect, useState } from "react";

const SEEN_KEY = "dg_seen_announcement_pdf_format_v1";

export default function PdfFormatAnnouncementModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SEEN_KEY) !== "1") setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  function close() {
    try { window.localStorage.setItem(SEEN_KEY, "1"); } catch {}
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(17,24,39,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={close}
    >
      <div
        className="card"
        style={{ maxWidth: 680, width: "100%", maxHeight: "90vh", overflowY: "auto", borderRadius: 16, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 10, color: "#111827" }}>
          Nuevo formato del presupuesto en PDF
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "#374151" }}>
          <p style={{ margin: "0 0 10px" }}>
            A partir de ahora, el PDF de presupuesto tiene una primera hoja nueva con:
          </p>
          <ul style={{ margin: "0 0 10px", paddingLeft: 20 }}>
            <li>Los datos del cliente, los datos técnicos del portón y la forma de pago con la fecha estimada de entrega, cada uno en su propio recuadro.</li>
            <li>Los productos agrupados por sector (Productos, Automatización, Servicios), con el subtotal de cada uno y el total general.</li>
          </ul>
          <div style={{ margin: "0 0 12px", textAlign: "center" }}>
            <img
              src="/images/presupuesto-formato-nuevo.png"
              alt="Ejemplo de la primera hoja del presupuesto con el formato nuevo"
              style={{ maxWidth: "100%", maxHeight: 380, borderRadius: 10, border: "1px solid #E5E7EB", boxShadow: "0 4px 14px rgba(0,0,0,0.08)" }}
            />
          </div>
          <p style={{ margin: "0 0 10px" }}>
            El resto del presupuesto (detalle completo, condiciones, etc.) sigue igual que siempre.
          </p>
          <p style={{ margin: 0, color: "#6B7280", fontSize: 13 }}>
            Los presupuestos que ya estaban guardados antes de este cambio van a seguir mostrando el formato anterior.
          </p>
        </div>
        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={close}
            className="btn"
            style={{
              background: "#0f766e", color: "#fff", border: 0, borderRadius: 8,
              padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
