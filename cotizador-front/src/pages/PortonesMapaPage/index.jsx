import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { listPortonesMapa } from "../../api/quotes.js";
import { useAuthStore } from "../../domain/auth/store.js";
import { STATUS_COLORS, COLOR_GROUPS, computeStatusInfo } from "../../domain/quote/portonStatus.js";
import Button from "../../ui/Button.jsx";

const ARGENTINA_CENTER = [-38.4, -63.6];
const ARGENTINA_ZOOM = 4;

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export default function PortonesMapaPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const allowed = !!(user?.is_rev_tecnica || user?.is_superuser || user?.is_enc_comercial || user?.is_logistica);

  const [filterColor, setFilterColor] = useState("all");

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);
  const didFitBoundsRef = useRef(false);

  const q = useQuery({
    queryKey: ["portones_mapa"],
    queryFn: listPortonesMapa,
    staleTime: 15000,
    refetchInterval: (query) => (query.state.data?.pendingGeo > 0 ? 8000 : 60000),
  });

  const rows = useMemo(() => {
    const quotes = q.data?.quotes || [];
    return quotes
      .filter((r) => Number.isFinite(r.geo_lat) && Number.isFinite(r.geo_lng))
      .map((quote) => ({
        ...quote,
        statusInfo: computeStatusInfo(quote),
        customerName: quote.end_customer?.name || "—",
        address: [quote.end_customer?.address, quote.end_customer?.city].filter(Boolean).join(" - "),
        displayRef: quote.final_sale_order_name
          || quote.final_copy_sale_order_name
          || quote.odoo_sale_order_name
          || `#${quote.quote_number || "—"}`,
      }));
  }, [q.data]);

  const filtered = useMemo(() => {
    if (filterColor === "all") return rows;
    return rows.filter((r) => r.statusInfo.color === filterColor);
  }, [rows, filterColor]);

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    const map = L.map(mapElRef.current).setView(ARGENTINA_CENTER, ARGENTINA_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    filtered.forEach((r) => {
      const colors = STATUS_COLORS[r.statusInfo.color] || STATUS_COLORS.gray;
      const marker = L.circleMarker([r.geo_lat, r.geo_lng], {
        radius: 9,
        color: "#fff",
        weight: 2,
        fillColor: colors.text,
        fillOpacity: 0.9,
      });

      const popupEl = document.createElement("div");
      popupEl.style.minWidth = "200px";
      popupEl.innerHTML = `
        <div style="font-weight:700;margin-bottom:4px;color:#333;">${escapeHtml(r.displayRef)}</div>
        <div style="margin-bottom:4px;color:#333;">${escapeHtml(r.customerName)}</div>
        <div style="font-size:12px;color:#666;margin-bottom:6px;">${escapeHtml(r.address || "Sin dirección")}</div>
        <div style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;background:${colors.bg};color:${colors.text};border:1px solid ${colors.border};">${escapeHtml(r.statusInfo.label)}</div>
      `;
      const btn = document.createElement("button");
      btn.textContent = "Ver detalle →";
      btn.style.cssText = "display:block;margin-top:8px;padding:4px 10px;border-radius:6px;border:1px solid #90caf9;background:#e3f2fd;color:#0d47a1;cursor:pointer;font-size:12px;font-weight:600;";
      btn.onclick = () => navigate(`/presupuestos/${r.id}`);
      popupEl.appendChild(btn);

      marker.bindPopup(popupEl);
      marker.addTo(layer);
    });

    if (!didFitBoundsRef.current && filtered.length > 0) {
      const bounds = L.latLngBounds(filtered.map((r) => [r.geo_lat, r.geo_lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      didFitBoundsRef.current = true;
    }
  }, [filtered, navigate]);

  if (!allowed) {
    return <div className="container"><div className="card">No autorizado.</div></div>;
  }

  const pendingGeo = q.data?.pendingGeo || 0;

  return (
    <div className="container">
      <div className="spacer" />

      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Mapa de Portones</h2>
          <div className="muted" style={{ marginTop: 4 }}>
            Ubicación geográfica de los portones en el sistema ({filtered.length} de {rows.length} con ubicación).
          </div>
        </div>
        <Button variant="ghost" onClick={() => navigate("/aprobacion/tecnica/menu")}>
          ← Volver al menú
        </Button>
      </div>

      <div className="spacer" />

      <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {COLOR_GROUPS.map((g) => {
          const active = filterColor === g.key;
          const count = g.key === "all" ? rows.length : rows.filter((r) => r.statusInfo.color === g.key).length;
          if (g.key !== "all" && count === 0) return null;
          return (
            <button
              key={g.key}
              onClick={() => setFilterColor(g.key)}
              style={{
                padding: "5px 14px",
                borderRadius: 999,
                border: `1px solid ${active ? "#333" : "#ccc"}`,
                background: active ? "#333" : "#fff",
                color: active ? "#fff" : "#333",
                fontWeight: active ? 700 : 400,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {g.label} ({count})
            </button>
          );
        })}
        {pendingGeo > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#f57f17", fontWeight: 600 }}>
            ⏳ Resolviendo {pendingGeo} ubicación(es)...
          </span>
        )}
      </div>

      <div className="spacer" />

      {q.isLoading && <div className="card muted" style={{ textAlign: "center" }}>Cargando...</div>}
      {q.isError && <div className="card" style={{ color: "red" }}>Error: {q.error?.message}</div>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div ref={mapElRef} style={{ width: "100%", height: "70vh" }} />
      </div>
    </div>
  );
}
