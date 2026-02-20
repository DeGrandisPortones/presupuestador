import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import CotizadorPage from "./pages/CotizadorPage/index.jsx";

const CotizadorPortonRoute = () => <CotizadorPage catalogKind="porton" />;
const CotizadorIpanelRoute = () => <CotizadorPage catalogKind="ipanel" />;
import LoginPage from "./pages/LoginPage/index.jsx";

import PresupuestosPage from "./pages/PresupuestosPage/index.jsx";
import QuoteDetailPage from "./pages/QuoteDetailPage/index.jsx";
import AprobacionComercialPage from "./pages/AprobacionComercialPage/index.jsx";
import AprobacionTecnicaPage from "./pages/AprobacionTecnicaPage/index.jsx";
import DashboardPage from "./pages/DashboardPage/index.jsx";

import RequireAuth from "./routes/RequireAuth.jsx";
import AppLayout from "./layouts/AppLayout.jsx";

import { useAuthStore } from "./domain/auth/store.js";
import { getMe } from "./api/auth.js";

export default function App() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (!token) return;
    if (user) return;

    getMe()
      .then(setUser)
      .catch(() => logout());
  }, [token, user, setUser, logout]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/cotizador" replace />} />

          <Route path="cotizador" element={<CotizadorPortonRoute />} />
          <Route path="cotizador/:id" element={<CotizadorPortonRoute />} />
          <Route path="cotizador/ipanel" element={<CotizadorIpanelRoute />} />
          <Route path="cotizador/ipanel/:id" element={<CotizadorIpanelRoute />} />

          <Route path="presupuestos" element={<PresupuestosPage />} />
          <Route path="presupuestos/:id" element={<QuoteDetailPage />} />

          <Route path="aprobacion/comercial" element={<AprobacionComercialPage />} />
          <Route path="aprobacion/tecnica" element={<AprobacionTecnicaPage />} />

          <Route path="dashboard" element={<DashboardPage />} />
        </Route>

        <Route path="*" element={<Navigate to={token ? "/cotizador" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
