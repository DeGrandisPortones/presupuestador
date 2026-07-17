import { useEffect, useRef } from "react";
import toast from "react-hot-toast";

const VERSION_URL = "/version.json";
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos
const MIN_MS_BETWEEN_FOCUS_CHECKS = 2 * 60 * 1000; // evita duplicar el chequeo del interval
const TOAST_ID = "app-version-update";

async function fetchBuildId() {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.buildId === "string" ? data.buildId : null;
  } catch {
    // Dev local (sin build) o falla de red puntual: no hay version.json, no rompemos nada.
    return null;
  }
}

function showUpdateToast() {
  toast(
    (t) => (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span>Hay una actualización disponible.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: "#111827",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "6px 12px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Actualizar
        </button>
        <button
          type="button"
          onClick={() => toast.dismiss(t.id)}
          style={{ background: "transparent", border: "none", color: "#6B7280", cursor: "pointer" }}
        >
          Ahora no
        </button>
      </div>
    ),
    { id: TOAST_ID, duration: Infinity, position: "bottom-center" },
  );
}

// No forzamos el reload solos: el usuario puede estar a mitad de cargar un
// presupuesto y perder lo que tiene sin guardar. Solo avisamos con un banner
// persistente y que decida cuándo actualizar.
export function useVersionUpdateWatcher() {
  const baselineRef = useRef(null);
  const notifiedRef = useRef(false);
  const lastCheckAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      lastCheckAtRef.current = Date.now();
      const buildId = await fetchBuildId();
      if (cancelled || !buildId) return;
      if (baselineRef.current === null) {
        baselineRef.current = buildId;
        return;
      }
      if (buildId !== baselineRef.current && !notifiedRef.current) {
        notifiedRef.current = true;
        showUpdateToast();
      }
    }

    check();
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);

    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheckAtRef.current < MIN_MS_BETWEEN_FOCUS_CHECKS) return;
      check();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
