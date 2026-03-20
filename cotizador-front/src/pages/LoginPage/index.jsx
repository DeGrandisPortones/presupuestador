import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, Navigate } from "react-router-dom";

import Input from "../../ui/Input.jsx";
import Button from "../../ui/Button.jsx";
import { login } from "../../api/auth.js";
import { useAuthStore } from "../../domain/auth/store.js";
import { setOdooBootstrap } from "../../domain/odoo/bootstrap.js";

export default function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.token);

  if (token) return <Navigate to="/menu" replace />;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
      if (data.bootstrap?.products?.length || data.bootstrap?.pricelists?.length) {
        setOdooBootstrap(data.bootstrap, "porton");
      }
      navigate("/menu", { replace: true });
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
          <Input type="password" value={password} onChange={setPassword} placeholder="••••••••" style={{ width: "100%" }} />

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
