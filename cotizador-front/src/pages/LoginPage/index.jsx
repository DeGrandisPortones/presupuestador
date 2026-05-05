import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, Navigate } from "react-router-dom";

import Input from "../../ui/Input.jsx";
import Button from "../../ui/Button.jsx";
import { login } from "../../api/auth.js";
import { useAuthStore } from "../../domain/auth/store.js";
import { setOdooBootstrap } from "../../domain/odoo/bootstrap.js";
import { prefetchOdooBootstrapInBackground } from "../../domain/odoo/prefetch.js";

function EyeIcon({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="3" />
      {!open ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const setOdooStatus = useAuthStore((s) => s.setOdooStatus);
  const token = useAuthStore((s) => s.token);

  if (token) return <Navigate to="/menu" replace />;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!shake) return;
    const t = window.setTimeout(() => setShake(false), 520);
    return () => window.clearTimeout(t);
  }, [shake]);

  const triggerShake = () => {
    setShake(false);
    window.setTimeout(() => setShake(true), 0);
  };

  const m = useMutation({
    mutationFn: () => login({ username, password }),
    onSuccess: (data) => {
      setSession({ token: data.token, user: data.user });

      if (data.bootstrap?.products?.length || data.bootstrap?.pricelists?.length || data.bootstrap?.sections?.length) {
        setOdooBootstrap(data.bootstrap, "porton");
        setOdooStatus("online");
      }

      navigate("/menu", { replace: true });

      window.setTimeout(() => {
        prefetchOdooBootstrapInBackground({ loginBootstrap: data.bootstrap }).catch(() => {
          setOdooStatus("offline");
        });
      }, 0);
    },
  });

  return (
    <div className="container" style={{ display: "flex", justifyContent: "center", paddingTop: 64 }}>
      <div className="card" style={{ width: 420 }}>
        <h2 className="login-title" style={{ marginTop: 0 }}></h2>
        <div className={`login-logos ${shake ? "shake" : ""}`} aria-label="Marcas">
          <img className="login-logo" src="/brands/dflex.png" alt="Dflex" />
          <img className="login-logo" src="/brands/degrandis.png" alt="DeGrandis Portones" />
          <img className="login-logo" src="/brands/ipanel.png" alt="iPanel" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (m.isPending) return;
            if (!username || !password) return;
            triggerShake();
            m.mutate();
          }}
        >
          <div className="spacer" />
          <div className="muted">Usuario</div>
          <Input value={username} onChange={setUsername} placeholder="Usuario" style={{ width: "100%" }} />

          <div className="spacer" />
          <div className="muted">Contraseña</div>
          <div style={{ position: "relative" }}>
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{ width: "100%", paddingRight: 48 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              aria-pressed={showPassword}
              title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              style={{
                position: "absolute",
                top: "50%",
                right: 8,
                transform: "translateY(-50%)",
                width: 34,
                height: 34,
                border: "0",
                borderRadius: 8,
                background: "transparent",
                color: "#6b7280",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>

          <div className="spacer" />
          {m.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{m.error.message}</div>}
          <div className="spacer" />

          <div style={{ display: "flex", justifyContent: "center" }}>
            <Button type="submit" disabled={m.isPending || !username || !password}>
              {m.isPending ? "Ingresando..." : "Entrar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
